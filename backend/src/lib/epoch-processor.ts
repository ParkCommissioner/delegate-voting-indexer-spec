// Epoch processor: orchestrates all processing stages for an epoch

import type {
  Address,
  EpochId,
  Epoch,
  EpochGaugeTotal,
  DelegateRanking,
  Vote,
  Delegation,
  Contribution,
} from '../types.js';
import { GAUGES } from '../types.js';
import {
  computeEpochTimestamps,
  getBlockRangeFromEpochStart,
} from './snapshot-resolver.js';
import { fetchEventsForEpoch, fetchDelegationEventsUpTo } from './event-fetcher.js';
import { identifyActiveVoters, getResetVoters } from './voter-identifier.js';
import { reconstructDelegationState } from './delegation-state.js';
import { decomposeAllVotes, aggregateByGauge, aggregateByDelegate } from './vote-decomposer.js';
import { getTokenVotingPower } from './voting-power.js';
import { runAllInvariantChecks, summarizeResults, type InvariantResult } from './invariants.js';

export interface EpochProcessingResult {
  epoch: Epoch;
  votes: Vote[];
  delegations: Delegation[];
  contributions: Contribution[];
  gaugeTotals: EpochGaugeTotal[];
  delegateRankings: DelegateRanking[];
  invariantResults: InvariantResult[];
}

// Process a single epoch through all stages
export async function processEpoch(
  epochId: EpochId,
  enableUpdateVotingPowerHook: boolean = false
): Promise<EpochProcessingResult> {
  console.log(`Processing epoch ${epochId}...`);

  // Stage 0: Compute timestamps
  const timestamps = computeEpochTimestamps(epochId);
  const snapshotTimestamp = enableUpdateVotingPowerHook
    ? timestamps.voteEndTimestamp // If hook enabled, use vote end
    : timestamps.votingPowerSnapshotTimestamp; // If hook disabled, use epoch start

  console.log(`  Snapshot timestamp: ${snapshotTimestamp}`);

  // Stage 1: Event collection
  console.log('  Stage 1: Collecting events...');
  const blockRange = await getBlockRangeFromEpochStart(epochId);
  const events = await fetchEventsForEpoch(epochId, blockRange.fromBlock, blockRange.toBlock);

  console.log(`    Voted events: ${events.voted.length}`);
  console.log(`    Reset events: ${events.reset.length}`);
  console.log(`    DelegateChanged events: ${events.delegateChanged.length}`);
  console.log(`    TokensDelegated events: ${events.tokensDelegated.length}`);
  console.log(`    TokensUndelegated events: ${events.tokensUndelegated.length}`);

  // Stage 2: Voter identification
  console.log('  Stage 2: Identifying voters...');
  const activeVoters = identifyActiveVoters(events, epochId);
  const resetVoters = getResetVoters(events, epochId);

  console.log(`    Active voters: ${activeVoters.size}`);
  console.log(`    Reset voters: ${resetVoters.size}`);

  // Stage 3: Delegation state reconstruction
  console.log('  Stage 3: Reconstructing delegation state...');
  // Fetch historical delegation events up to snapshot
  const delegationEvents = await fetchDelegationEventsUpTo(snapshotTimestamp, 0);
  const delegationState = reconstructDelegationState(
    delegationEvents.delegateChanged,
    delegationEvents.tokensDelegated,
    delegationEvents.tokensUndelegated,
    snapshotTimestamp
  );

  console.log(`    Delegators tracked: ${delegationState.delegatorToDelegate.size}`);
  console.log(`    Active delegates: ${delegationState.delegateToDelegators.size}`);

  // Stage 4 & 5: Voting power calculation and vote decomposition
  console.log('  Stage 4-5: Decomposing votes...');
  const contributions = await decomposeAllVotes(
    activeVoters,
    delegationState,
    epochId,
    snapshotTimestamp
  );

  console.log(`    Total contributions: ${contributions.length}`);

  // Stage 6: Aggregation
  console.log('  Stage 6: Aggregating results...');
  const gaugeAggregates = aggregateByGauge(contributions);
  const delegateAggregates = aggregateByDelegate(contributions);

  // Run invariant checks
  console.log('  Running invariant checks...');
  const invariantResults = await runAllInvariantChecks(
    epochId,
    activeVoters,
    resetVoters,
    delegationState,
    contributions,
    snapshotTimestamp,
    getTokenVotingPower
  );

  const summary = summarizeResults(invariantResults);
  console.log(`    Invariants passed: ${summary.passed}/${summary.passed + summary.failed}`);

  // Build output structures
  const epoch: Epoch = {
    epochId,
    startTimestamp: timestamps.startTimestamp,
    voteStartTimestamp: timestamps.voteStartTimestamp,
    voteEndTimestamp: timestamps.voteEndTimestamp,
    snapshotTimestamp,
    totalVotes: contributions.reduce((sum, c) => sum + c.contribution, 0n),
    isFinalized: true,
    createdAt: new Date(),
  };

  const votes: Vote[] = [];
  for (const [delegate, voterState] of activeVoters) {
    for (const gaugeVote of voterState.gaugesVotedFor) {
      votes.push({
        epochId,
        delegateAddress: delegate,
        gaugeAddress: gaugeVote.gauge,
        votingPowerUsed: voterState.totalVotingPower,
        votesCast: gaugeVote.votes,
        weightPercentage: Number((gaugeVote.votes * 10000n) / voterState.totalVotingPower) / 100,
        votedAtTimestamp: voterState.lastVotedTimestamp,
        votedAtBlock: voterState.lastVotedBlock,
        txHash: voterState.txHash,
      });
    }
  }

  const delegations: Delegation[] = [];
  const seenDelegators = new Set<Address>();
  for (const contribution of contributions) {
    if (seenDelegators.has(contribution.delegator)) continue;
    seenDelegators.add(contribution.delegator);

    const tokenIds: number[] = []; // Would need to track this in decomposition

    delegations.push({
      epochId,
      delegatorAddress: contribution.delegator,
      delegateAddress: contribution.delegate,
      tokenIds,
      totalVotingPower: contribution.delegatorVotingPower,
      snapshotTimestamp,
    });
  }

  const contributionRecords: Contribution[] = contributions.map(c => ({
    epochId: c.epochId,
    delegatorAddress: c.delegator,
    delegateAddress: c.delegate,
    gaugeAddress: c.gauge,
    delegatorVotingPower: c.delegatorVotingPower,
    contributionAmount: c.contribution,
    contributionPercentage: c.percentage,
  }));

  const gaugeTotals: EpochGaugeTotal[] = GAUGES.map(gauge => {
    const agg = gaugeAggregates.get(gauge as Address);
    return {
      epochId,
      gaugeAddress: gauge as Address,
      totalVotes: agg?.totalVotes ?? 0n,
      uniqueVoters: votes.filter(v => v.gaugeAddress.toLowerCase() === gauge.toLowerCase()).length,
      uniqueContributors: agg?.uniqueContributors.size ?? 0,
    };
  });

  const delegateRankings: DelegateRanking[] = Array.from(delegateAggregates.entries())
    .map(([delegate, agg]) => ({
      epochId,
      delegateAddress: delegate,
      totalVotingPower: agg.totalVotingPower,
      delegatorCount: agg.delegatorCount,
      gaugesVotedFor: agg.gaugesVotedFor.size,
      rank: 0, // Will be set after sorting
    }))
    .sort((a, b) => (b.totalVotingPower > a.totalVotingPower ? 1 : -1))
    .map((d, i) => ({ ...d, rank: i + 1 }));

  console.log(`Epoch ${epochId} processing complete.`);

  return {
    epoch,
    votes,
    delegations,
    contributions: contributionRecords,
    gaugeTotals,
    delegateRankings,
    invariantResults,
  };
}

// Process multiple epochs
export async function processEpochs(
  epochIds: EpochId[],
  enableUpdateVotingPowerHook: boolean = false
): Promise<Map<EpochId, EpochProcessingResult>> {
  const results = new Map<EpochId, EpochProcessingResult>();

  for (const epochId of epochIds) {
    const result = await processEpoch(epochId, enableUpdateVotingPowerHook);
    results.set(epochId, result);
  }

  return results;
}

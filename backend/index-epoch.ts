#!/usr/bin/env npx tsx
// Script to index an epoch and save to Supabase
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... npx tsx index-epoch.ts

import { JsonRpcProvider, Contract } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { GAUGE_VOTER_ABI, ESCROW_IVOTES_ADAPTER_ABI, CLOCK_ABI } from './src/lib/abis.js';
import { reconstructDelegationState, getDelegatedTokens } from './src/lib/delegation-state.js';
import type {
  Address,
  VotedEvent,
  DelegateChangedEvent,
  TokensDelegatedEvent,
  TokensUndelegatedEvent,
  VoterState,
  DelegatorContribution,
  EpochId,
} from './src/types.js';
import { CONTRACTS, GAUGES, TIMING } from './src/types.js';

const RPC_URL = process.env.KATANA_RPC_URL || 'https://rpc.katana.network';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzntegnlqzjhbmockwvt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_KEY) {
  console.error('Error: SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('=== Indexing Epoch and Saving to Supabase ===\n');

  const provider = new JsonRpcProvider(RPC_URL);
  const gaugeVoter = new Contract(CONTRACTS.GAUGE_VOTER, GAUGE_VOTER_ABI, provider);
  const escrowAdapter = new Contract(CONTRACTS.ESCROW_IVOTES_ADAPTER, ESCROW_IVOTES_ADAPTER_ABI, provider);
  const clock = new Contract(CONTRACTS.CLOCK, CLOCK_ABI, provider);

  // Verify connections
  const blockNumber = await provider.getBlockNumber();
  console.log(`Connected to Katana. Current block: ${blockNumber}`);

  const currentEpoch = Number(await clock.currentEpoch());
  console.log(`Current epoch: ${currentEpoch}`);

  const enableHook = await gaugeVoter.enableUpdateVotingPowerHook();
  console.log(`enableUpdateVotingPowerHook: ${enableHook}`);

  // --- Fetch Voted events from known block range ---
  console.log('\n--- Fetching Voted Events ---');
  const fromBlock = 15177770;
  const toBlock = 15177790;

  const votedEvents = await gaugeVoter.queryFilter(
    gaugeVoter.filters.Voted(),
    fromBlock,
    toBlock
  );

  console.log(`Found ${votedEvents.length} Voted events`);

  if (votedEvents.length === 0) {
    console.log('No voted events found. Exiting.');
    return;
  }

  // Parse events
  const parsedVotes: VotedEvent[] = votedEvents.map(e => {
    const args = (e as any).args;
    return {
      voter: args[0] as Address,
      gauge: args[1] as Address,
      epoch: Number(args[2]),
      votingPowerCastForGauge: BigInt(args[3]),
      totalVotingPowerInGauge: BigInt(args[4]),
      totalVotingPowerInContract: BigInt(args[5]),
      timestamp: Number(args[6]),
      blockNumber: e.blockNumber,
      logIndex: e.index,
      txHash: e.transactionHash,
    };
  });

  // Determine actual epoch from timestamps
  const eventTimestamp = parsedVotes[0]?.timestamp || 0;
  const targetEpoch: EpochId = Math.floor(eventTimestamp / TIMING.EPOCH_DURATION);
  console.log(`Target epoch: ${targetEpoch}`);

  // --- Identify Active Voters ---
  console.log('\n--- Identifying Active Voters ---');
  const activeVoters = new Map<Address, VoterState>();

  for (const vote of parsedVotes) {
    const existing = activeVoters.get(vote.voter);
    if (existing) {
      const existingGauge = existing.gaugesVotedFor.find(g => g.gauge.toLowerCase() === vote.gauge.toLowerCase());
      if (existingGauge) {
        existingGauge.votes = vote.votingPowerCastForGauge;
      } else {
        existing.gaugesVotedFor.push({
          gauge: vote.gauge,
          votes: vote.votingPowerCastForGauge,
        });
      }
      if (vote.blockNumber > existing.lastVotedBlock) {
        existing.totalVotingPower = vote.totalVotingPowerInContract;
        existing.lastVotedTimestamp = vote.timestamp;
        existing.lastVotedBlock = vote.blockNumber;
        existing.txHash = vote.txHash;
      }
    } else {
      activeVoters.set(vote.voter, {
        voter: vote.voter,
        gaugesVotedFor: [{
          gauge: vote.gauge,
          votes: vote.votingPowerCastForGauge,
        }],
        totalVotingPower: vote.totalVotingPowerInContract,
        lastVotedTimestamp: vote.timestamp,
        lastVotedBlock: vote.blockNumber,
        txHash: vote.txHash,
      });
    }
  }

  console.log(`Active voters: ${activeVoters.size}`);

  // --- Compute timestamps ---
  const epochStartTs = targetEpoch * TIMING.EPOCH_DURATION;
  const voteStartTs = epochStartTs + TIMING.VOTE_WINDOW_BUFFER;
  const voteEndTs = epochStartTs + TIMING.VOTE_DURATION - TIMING.VOTE_WINDOW_BUFFER;
  const snapshotTimestamp = enableHook ? voteEndTs : epochStartTs;

  // --- Fetch Delegation Events ---
  console.log('\n--- Fetching Delegation Events ---');
  const BATCH_SIZE = 25000;
  const delegateChangedEvents: DelegateChangedEvent[] = [];
  const tokensDelegatedEvents: TokensDelegatedEvent[] = [];
  const tokensUndelegatedEvents: TokensUndelegatedEvent[] = [];

  for (let start = 0; start <= toBlock; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, toBlock);
    try {
      const events = await escrowAdapter.queryFilter(
        escrowAdapter.filters.DelegateChanged(),
        start,
        end
      );
      for (const e of events) {
        const args = (e as any).args;
        const block = await provider.getBlock(e.blockNumber);
        delegateChangedEvents.push({
          delegator: args[0] as Address,
          fromDelegate: args[1] as Address,
          toDelegate: args[2] as Address,
          timestamp: block ? Number(block.timestamp) : 0,
          blockNumber: e.blockNumber,
          logIndex: e.index,
          txHash: e.transactionHash,
        });
      }
    } catch (err: any) {
      if (!err.message.includes('no results')) {
        console.error(`Error at blocks ${start}-${end}:`, err.message);
      }
    }
  }

  console.log(`DelegateChanged events: ${delegateChangedEvents.length}`);

  // --- Reconstruct Delegation State ---
  const delegationState = reconstructDelegationState(
    delegateChangedEvents.filter(e => e.timestamp <= snapshotTimestamp),
    tokensDelegatedEvents.filter(e => e.timestamp <= snapshotTimestamp),
    tokensUndelegatedEvents.filter(e => e.timestamp <= snapshotTimestamp),
    snapshotTimestamp
  );

  // --- Vote Decomposition ---
  console.log('\n--- Vote Decomposition ---');
  const contributions: DelegatorContribution[] = [];

  for (const [delegate, voterState] of activeVoters) {
    const delegators = delegationState.delegateToDelegators.get(delegate) || new Set<Address>();

    if (delegators.size === 0) {
      for (const gaugeVote of voterState.gaugesVotedFor) {
        contributions.push({
          epochId: targetEpoch,
          delegator: delegate,
          delegate: delegate,
          gauge: gaugeVote.gauge,
          delegatorVotingPower: voterState.totalVotingPower,
          contribution: gaugeVote.votes,
          percentage: 100,
        });
      }
    } else {
      const delegatorCount = delegators.size;
      const vpPerDelegator = voterState.totalVotingPower / BigInt(delegatorCount);

      for (const delegator of delegators) {
        const proportion = Number(vpPerDelegator) / Number(voterState.totalVotingPower);

        for (const gaugeVote of voterState.gaugesVotedFor) {
          const contributionAmount = BigInt(Math.floor(Number(gaugeVote.votes) * proportion));
          contributions.push({
            epochId: targetEpoch,
            delegator,
            delegate,
            gauge: gaugeVote.gauge,
            delegatorVotingPower: vpPerDelegator,
            contribution: contributionAmount,
            percentage: proportion * 100,
          });
        }
      }
    }
  }

  console.log(`Total contributions: ${contributions.length}`);

  // --- Save to Supabase ---
  console.log('\n--- Saving to Supabase ---');

  // 1. Save epoch
  const totalVotes = contributions.reduce((sum, c) => sum + c.contribution, 0n);
  const { error: epochError } = await supabase
    .from('epochs')
    .upsert({
      epoch_id: targetEpoch,
      start_timestamp: epochStartTs,
      vote_start_timestamp: voteStartTs,
      vote_end_timestamp: voteEndTs,
      snapshot_timestamp: snapshotTimestamp,
      total_votes: totalVotes.toString(),
      is_finalized: true,
    });

  if (epochError) {
    console.error('Error saving epoch:', epochError);
  } else {
    console.log(`  Saved epoch ${targetEpoch}`);
  }

  // 2. Save votes
  const voteRecords = [];
  for (const [delegate, voterState] of activeVoters) {
    for (const gaugeVote of voterState.gaugesVotedFor) {
      voteRecords.push({
        epoch_id: targetEpoch,
        delegate_address: delegate,
        gauge_address: gaugeVote.gauge,
        voting_power_used: voterState.totalVotingPower.toString(),
        votes_cast: gaugeVote.votes.toString(),
        weight_percentage: Number((gaugeVote.votes * 10000n) / voterState.totalVotingPower) / 100,
        voted_at_timestamp: voterState.lastVotedTimestamp,
        voted_at_block: voterState.lastVotedBlock,
        tx_hash: voterState.txHash,
      });
    }
  }

  const { error: votesError } = await supabase
    .from('votes')
    .upsert(voteRecords, { onConflict: 'epoch_id,delegate_address,gauge_address' });

  if (votesError) {
    console.error('Error saving votes:', votesError);
  } else {
    console.log(`  Saved ${voteRecords.length} votes`);
  }

  // 3. Save delegations
  const delegationRecords = [];
  const seenDelegators = new Set<Address>();
  for (const contribution of contributions) {
    if (seenDelegators.has(contribution.delegator)) continue;
    seenDelegators.add(contribution.delegator);

    const tokenIds = getDelegatedTokens(delegationState, contribution.delegator, contribution.delegate);

    delegationRecords.push({
      epoch_id: targetEpoch,
      delegator_address: contribution.delegator,
      delegate_address: contribution.delegate,
      token_ids: tokenIds,
      total_voting_power: contribution.delegatorVotingPower.toString(),
      snapshot_timestamp: snapshotTimestamp,
    });
  }

  const { error: delegationsError } = await supabase
    .from('delegations')
    .upsert(delegationRecords, { onConflict: 'epoch_id,delegator_address' });

  if (delegationsError) {
    console.error('Error saving delegations:', delegationsError);
  } else {
    console.log(`  Saved ${delegationRecords.length} delegations`);
  }

  // 4. Save contributions
  const contributionRecords = contributions.map(c => ({
    epoch_id: c.epochId,
    delegator_address: c.delegator,
    delegate_address: c.delegate,
    gauge_address: c.gauge,
    delegator_voting_power: c.delegatorVotingPower.toString(),
    contribution_amount: c.contribution.toString(),
    contribution_percentage: c.percentage,
  }));

  const { error: contribError } = await supabase
    .from('contributions')
    .upsert(contributionRecords, { onConflict: 'epoch_id,delegator_address,gauge_address' });

  if (contribError) {
    console.error('Error saving contributions:', contribError);
  } else {
    console.log(`  Saved ${contributionRecords.length} contributions`);
  }

  // 5. Save gauge totals
  const gaugeTotalRecords = GAUGES.map(gauge => {
    let totalVotesForGauge = 0n;
    let uniqueVoters = 0;
    let uniqueContributors = 0;

    const votersSet = new Set<string>();
    const contributorsSet = new Set<string>();

    for (const [delegate, voterState] of activeVoters) {
      const gaugeVote = voterState.gaugesVotedFor.find(g => g.gauge.toLowerCase() === gauge.toLowerCase());
      if (gaugeVote) {
        totalVotesForGauge += gaugeVote.votes;
        votersSet.add(delegate);
      }
    }

    for (const c of contributions) {
      if (c.gauge.toLowerCase() === gauge.toLowerCase()) {
        contributorsSet.add(c.delegator);
      }
    }

    return {
      epoch_id: targetEpoch,
      gauge_address: gauge,
      total_votes: totalVotesForGauge.toString(),
      unique_voters: votersSet.size,
      unique_contributors: contributorsSet.size,
    };
  });

  const { error: gaugeError } = await supabase
    .from('epoch_gauge_totals')
    .upsert(gaugeTotalRecords, { onConflict: 'epoch_id,gauge_address' });

  if (gaugeError) {
    console.error('Error saving gauge totals:', gaugeError);
  } else {
    console.log(`  Saved ${gaugeTotalRecords.length} gauge totals`);
  }

  // 6. Save delegate rankings
  const delegateAggregates = new Map<Address, { totalVP: bigint; delegatorCount: number; gauges: Set<string> }>();
  for (const c of contributions) {
    const existing = delegateAggregates.get(c.delegate);
    if (existing) {
      existing.totalVP += c.delegatorVotingPower;
      existing.gauges.add(c.gauge);
    } else {
      delegateAggregates.set(c.delegate, {
        totalVP: c.delegatorVotingPower,
        delegatorCount: 1,
        gauges: new Set([c.gauge]),
      });
    }
  }

  const rankingRecords = Array.from(delegateAggregates.entries())
    .map(([delegate, agg]) => ({
      delegate,
      totalVP: agg.totalVP,
      delegatorCount: agg.delegatorCount,
      gaugesVotedFor: agg.gauges.size,
    }))
    .sort((a, b) => (b.totalVP > a.totalVP ? 1 : -1))
    .map((d, i) => ({
      epoch_id: targetEpoch,
      delegate_address: d.delegate,
      total_voting_power: d.totalVP.toString(),
      delegator_count: d.delegatorCount,
      gauges_voted_for: d.gaugesVotedFor,
      rank: i + 1,
    }));

  const { error: rankingError } = await supabase
    .from('delegate_rankings')
    .upsert(rankingRecords, { onConflict: 'epoch_id,delegate_address' });

  if (rankingError) {
    console.error('Error saving rankings:', rankingError);
  } else {
    console.log(`  Saved ${rankingRecords.length} delegate rankings`);
  }

  // --- Verify ---
  console.log('\n--- Verifying Data in Supabase ---');
  const { data: epochData } = await supabase.from('epochs').select('*').eq('epoch_id', targetEpoch);
  console.log(`  Epochs: ${epochData?.length || 0} rows`);

  const { data: votesData } = await supabase.from('votes').select('*').eq('epoch_id', targetEpoch);
  console.log(`  Votes: ${votesData?.length || 0} rows`);

  const { data: contribData } = await supabase.from('contributions').select('*').eq('epoch_id', targetEpoch);
  console.log(`  Contributions: ${contribData?.length || 0} rows`);

  const { data: gaugeData } = await supabase.from('epoch_gauge_totals').select('*').eq('epoch_id', targetEpoch);
  console.log(`  Gauge totals: ${gaugeData?.length || 0} rows`);

  const { data: rankingData } = await supabase.from('delegate_rankings').select('*').eq('epoch_id', targetEpoch);
  console.log(`  Rankings: ${rankingData?.length || 0} rows`);

  console.log('\n=== Indexing Complete ===');
}

main().catch(console.error);

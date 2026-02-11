// Vote decomposer: splits delegate votes into per-delegator contributions

import type {
  Address,
  EpochId,
  DelegatorContribution,
  VoterState,
  DelegationState,
} from '../types.js';
import { calculateDelegateVotingPowerBreakdown } from './voting-power.js';

// Decompose a delegate's vote into per-delegator contributions for all gauges
export async function decomposeVote(
  delegate: Address,
  voterState: VoterState,
  delegationState: DelegationState,
  epochId: EpochId,
  snapshotTimestamp: number
): Promise<DelegatorContribution[]> {
  // Get the voting power breakdown for this delegate
  const vpBreakdown = await calculateDelegateVotingPowerBreakdown(
    delegate,
    delegationState,
    snapshotTimestamp
  );

  if (vpBreakdown.totalVotingPower === 0n) {
    return [];
  }

  const contributions: DelegatorContribution[] = [];

  // For each gauge the delegate voted for
  for (const gaugeVote of voterState.gaugesVotedFor) {
    // For each delegator
    for (const delegatorBreakdown of vpBreakdown.breakdown) {
      // Calculate proportional contribution
      // contribution = (delegatorVP / totalDelegateVP) * votesForGauge
      const contribution = (delegatorBreakdown.votingPower * gaugeVote.votes) / vpBreakdown.totalVotingPower;

      // Calculate percentage (with precision)
      const percentage = Number((delegatorBreakdown.votingPower * 10000n) / vpBreakdown.totalVotingPower) / 100;

      contributions.push({
        epochId,
        delegator: delegatorBreakdown.delegator,
        delegate,
        gauge: gaugeVote.gauge,
        delegatorVotingPower: delegatorBreakdown.votingPower,
        contribution,
        percentage,
      });
    }
  }

  return contributions;
}

// Decompose all votes for an epoch
export async function decomposeAllVotes(
  activeVoters: Map<Address, VoterState>,
  delegationState: DelegationState,
  epochId: EpochId,
  snapshotTimestamp: number
): Promise<DelegatorContribution[]> {
  const allContributions: DelegatorContribution[] = [];

  for (const [delegate, voterState] of activeVoters) {
    const contributions = await decomposeVote(
      delegate,
      voterState,
      delegationState,
      epochId,
      snapshotTimestamp
    );
    allContributions.push(...contributions);
  }

  return allContributions;
}

// Aggregate contributions by delegator
export function aggregateByDelegator(
  contributions: DelegatorContribution[]
): Map<Address, { totalContribution: bigint; gaugeBreakdown: DelegatorContribution[] }> {
  const aggregated = new Map<Address, { totalContribution: bigint; gaugeBreakdown: DelegatorContribution[] }>();

  for (const contribution of contributions) {
    if (!aggregated.has(contribution.delegator)) {
      aggregated.set(contribution.delegator, {
        totalContribution: 0n,
        gaugeBreakdown: [],
      });
    }

    const entry = aggregated.get(contribution.delegator)!;
    entry.totalContribution += contribution.contribution;
    entry.gaugeBreakdown.push(contribution);
  }

  return aggregated;
}

// Aggregate contributions by gauge
export function aggregateByGauge(
  contributions: DelegatorContribution[]
): Map<Address, { totalVotes: bigint; uniqueContributors: Set<Address> }> {
  const aggregated = new Map<Address, { totalVotes: bigint; uniqueContributors: Set<Address> }>();

  for (const contribution of contributions) {
    if (!aggregated.has(contribution.gauge)) {
      aggregated.set(contribution.gauge, {
        totalVotes: 0n,
        uniqueContributors: new Set(),
      });
    }

    const entry = aggregated.get(contribution.gauge)!;
    entry.totalVotes += contribution.contribution;
    entry.uniqueContributors.add(contribution.delegator);
  }

  return aggregated;
}

// Aggregate contributions by delegate
export function aggregateByDelegate(
  contributions: DelegatorContribution[]
): Map<Address, { totalVotingPower: bigint; delegatorCount: number; gaugesVotedFor: Set<Address> }> {
  const aggregated = new Map<Address, { totalVotingPower: bigint; delegatorCount: number; gaugesVotedFor: Set<Address> }>();

  for (const contribution of contributions) {
    if (!aggregated.has(contribution.delegate)) {
      aggregated.set(contribution.delegate, {
        totalVotingPower: 0n,
        delegatorCount: 0,
        gaugesVotedFor: new Set(),
      });
    }

    const entry = aggregated.get(contribution.delegate)!;
    entry.gaugesVotedFor.add(contribution.gauge);
  }

  // Second pass to count unique delegators and total VP
  const delegateDelegators = new Map<Address, Set<Address>>();
  for (const contribution of contributions) {
    if (!delegateDelegators.has(contribution.delegate)) {
      delegateDelegators.set(contribution.delegate, new Set());
    }
    delegateDelegators.get(contribution.delegate)!.add(contribution.delegator);
  }

  for (const [delegate, delegators] of delegateDelegators) {
    const entry = aggregated.get(delegate)!;
    entry.delegatorCount = delegators.size;

    // Sum up voting power (each delegator should only be counted once)
    let totalVP = 0n;
    const seenDelegators = new Set<Address>();
    for (const contribution of contributions) {
      if (contribution.delegate === delegate && !seenDelegators.has(contribution.delegator)) {
        totalVP += contribution.delegatorVotingPower;
        seenDelegators.add(contribution.delegator);
      }
    }
    entry.totalVotingPower = totalVP;
  }

  return aggregated;
}

// Validate that contributions sum to delegate's vote
export function validateContributionSum(
  contributions: DelegatorContribution[],
  voterState: VoterState
): { isValid: boolean; gaugeResults: Map<Address, { expected: bigint; actual: bigint }> } {
  const gaugeResults = new Map<Address, { expected: bigint; actual: bigint }>();
  let isValid = true;

  // Build expected values from voter state
  for (const gaugeVote of voterState.gaugesVotedFor) {
    gaugeResults.set(gaugeVote.gauge, { expected: gaugeVote.votes, actual: 0n });
  }

  // Sum contributions per gauge
  for (const contribution of contributions) {
    if (contribution.delegate !== voterState.voter) continue;

    const entry = gaugeResults.get(contribution.gauge);
    if (entry) {
      entry.actual += contribution.contribution;
    }
  }

  // Check for mismatches
  for (const [gauge, result] of gaugeResults) {
    // Allow for small rounding errors (up to 1 wei per delegator)
    const diff = result.expected > result.actual
      ? result.expected - result.actual
      : result.actual - result.expected;

    if (diff > BigInt(contributions.filter(c => c.gauge === gauge).length)) {
      isValid = false;
    }
  }

  return { isValid, gaugeResults };
}

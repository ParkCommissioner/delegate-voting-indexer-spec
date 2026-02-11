// Invariant checker: verifies correctness of processing at each stage

import { getGaugeVoterContract } from './provider.js';
import type {
  Address,
  EpochId,
  VoterState,
  DelegationState,
  DelegatorContribution,
  TokenId,
} from '../types.js';
import { GAUGES } from '../types.js';
import { getDelegateVotingPower } from './voting-power.js';
import { getDelegatorsFor, getDelegatedTokens } from './delegation-state.js';

export interface InvariantResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  details?: string;
}

// Invariant 1: Total Vote Power Consistency
// Sum of all Voted event power (after removing Reset users) must equal contract total
// When enableUpdateVotingPowerHook=true, votes are stored at epoch 0, so writeEpochId should be 0
export async function checkTotalVotePowerConsistency(
  epochId: EpochId,
  activeVoters: Map<Address, VoterState>,
  writeEpochId?: EpochId
): Promise<InvariantResult> {
  const gaugeVoter = getGaugeVoterContract();
  const queryEpoch = writeEpochId ?? epochId;

  try {
    const contractTotal = await gaugeVoter.epochTotalVotingPowerCast(queryEpoch);
    const indexedTotal = Array.from(activeVoters.values()).reduce((sum, voter) => {
      return sum + voter.gaugesVotedFor.reduce((s, g) => s + g.votes, 0n);
    }, 0n);

    return {
      name: 'Total Vote Power Consistency',
      passed: contractTotal === indexedTotal,
      expected: contractTotal.toString(),
      actual: indexedTotal.toString(),
      details: `Queried epoch ${queryEpoch}`,
    };
  } catch (error) {
    return {
      name: 'Total Vote Power Consistency',
      passed: false,
      details: `Error querying contract: ${error}`,
    };
  }
}

// Invariant 2: Per-Gauge Vote Consistency
// For each gauge, sum of votes must equal gauge total in contract
// When enableUpdateVotingPowerHook=true, votes are stored at epoch 0, so writeEpochId should be 0
export async function checkPerGaugeVoteConsistency(
  epochId: EpochId,
  activeVoters: Map<Address, VoterState>,
  writeEpochId?: EpochId
): Promise<InvariantResult[]> {
  const gaugeVoter = getGaugeVoterContract();
  const queryEpoch = writeEpochId ?? epochId;
  const results: InvariantResult[] = [];

  for (const gauge of GAUGES) {
    try {
      const contractGaugeTotal = await gaugeVoter.epochGaugeVotes(queryEpoch, gauge);

      let indexedGaugeTotal = 0n;
      for (const voter of activeVoters.values()) {
        const gaugeVote = voter.gaugesVotedFor.find(g => g.gauge.toLowerCase() === gauge.toLowerCase());
        if (gaugeVote) {
          indexedGaugeTotal += gaugeVote.votes;
        }
      }

      results.push({
        name: `Per-Gauge Vote Consistency (${gauge})`,
        passed: contractGaugeTotal === indexedGaugeTotal,
        expected: contractGaugeTotal.toString(),
        actual: indexedGaugeTotal.toString(),
        details: `Queried epoch ${queryEpoch}`,
      });
    } catch (error) {
      results.push({
        name: `Per-Gauge Vote Consistency (${gauge})`,
        passed: false,
        details: `Error querying contract: ${error}`,
      });
    }
  }

  return results;
}

// Invariant 3: Delegation Power Consistency
// Sum of delegated voting power at snapshot must equal delegate's getPastVotes
export async function checkDelegationPowerConsistency(
  delegate: Address,
  delegationState: DelegationState,
  snapshotTimestamp: number,
  tokenVotingPowerFn: (tokenId: TokenId, timestamp: number) => Promise<bigint>
): Promise<InvariantResult> {
  try {
    const adapterPower = await getDelegateVotingPower(delegate, snapshotTimestamp);

    let calculatedPower = 0n;
    const delegators = getDelegatorsFor(delegationState, delegate);

    for (const delegator of delegators) {
      const tokens = getDelegatedTokens(delegationState, delegator, delegate);
      for (const tokenId of tokens) {
        const tokenVP = await tokenVotingPowerFn(tokenId, snapshotTimestamp);
        calculatedPower += tokenVP;
      }
    }

    return {
      name: `Delegation Power Consistency (${delegate})`,
      passed: adapterPower === calculatedPower,
      expected: adapterPower.toString(),
      actual: calculatedPower.toString(),
    };
  } catch (error) {
    return {
      name: `Delegation Power Consistency (${delegate})`,
      passed: false,
      details: `Error: ${error}`,
    };
  }
}

// Invariant 4: Attribution Sum Consistency
// For each delegate's vote on a gauge, sum of contributions must equal delegate's total vote
export function checkAttributionSumConsistency(
  delegate: Address,
  gauge: Address,
  expectedVotes: bigint,
  contributions: DelegatorContribution[]
): InvariantResult {
  const relevantContributions = contributions.filter(
    c => c.delegate === delegate && c.gauge === gauge
  );

  const contributionSum = relevantContributions.reduce((sum, c) => sum + c.contribution, 0n);

  // Allow for rounding errors (up to 1 wei per contributor)
  const tolerance = BigInt(relevantContributions.length);
  const diff = expectedVotes > contributionSum
    ? expectedVotes - contributionSum
    : contributionSum - expectedVotes;

  return {
    name: `Attribution Sum Consistency (${delegate} -> ${gauge})`,
    passed: diff <= tolerance,
    expected: expectedVotes.toString(),
    actual: contributionSum.toString(),
    details: `Tolerance: ${tolerance}, Difference: ${diff}`,
  };
}

// Invariant 5: No Double Counting
// Each veNFT's voting power must be attributed to exactly one delegator-delegate pair per epoch
export function checkNoDoubleCounting(
  epochId: EpochId,
  contributions: DelegatorContribution[]
): InvariantResult {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const contribution of contributions) {
    // Group by delegator + gauge (delegator's power should only be counted once per gauge)
    const key = `${contribution.delegator}-${contribution.gauge}-${epochId}`;
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  }

  return {
    name: 'No Double Counting',
    passed: duplicates.length === 0,
    details: duplicates.length > 0 ? `Duplicates found: ${duplicates.join(', ')}` : undefined,
  };
}

// Invariant 6: Non-voter Exclusion
// Users whose latest action is Reset must have zero contribution
export function checkNonVoterExclusion(
  resetVoters: Set<Address>,
  contributions: DelegatorContribution[]
): InvariantResult {
  const violators: Address[] = [];

  for (const voter of resetVoters) {
    const voterContributions = contributions.filter(c => c.delegate === voter);
    const totalContribution = voterContributions.reduce((sum, c) => sum + c.contribution, 0n);

    if (totalContribution > 0n) {
      violators.push(voter);
    }
  }

  return {
    name: 'Non-voter Exclusion',
    passed: violators.length === 0,
    details: violators.length > 0 ? `Reset voters with contributions: ${violators.join(', ')}` : undefined,
  };
}

// Run all invariant checks for an epoch
// writeEpochId: When enableUpdateVotingPowerHook=true, pass 0; otherwise pass epochId or omit
export async function runAllInvariantChecks(
  epochId: EpochId,
  activeVoters: Map<Address, VoterState>,
  resetVoters: Set<Address>,
  delegationState: DelegationState,
  contributions: DelegatorContribution[],
  snapshotTimestamp: number,
  tokenVotingPowerFn: (tokenId: TokenId, timestamp: number) => Promise<bigint>,
  writeEpochId?: EpochId
): Promise<InvariantResult[]> {
  const results: InvariantResult[] = [];

  // Invariant 1
  results.push(await checkTotalVotePowerConsistency(epochId, activeVoters, writeEpochId));

  // Invariant 2
  const gaugeResults = await checkPerGaugeVoteConsistency(epochId, activeVoters, writeEpochId);
  results.push(...gaugeResults);

  // Invariant 3 - for each active delegate
  for (const [delegate] of activeVoters) {
    results.push(await checkDelegationPowerConsistency(
      delegate,
      delegationState,
      snapshotTimestamp,
      tokenVotingPowerFn
    ));
  }

  // Invariant 4 - for each delegate-gauge pair
  for (const [delegate, voterState] of activeVoters) {
    for (const gaugeVote of voterState.gaugesVotedFor) {
      results.push(checkAttributionSumConsistency(
        delegate,
        gaugeVote.gauge,
        gaugeVote.votes,
        contributions
      ));
    }
  }

  // Invariant 5
  results.push(checkNoDoubleCounting(epochId, contributions));

  // Invariant 6
  results.push(checkNonVoterExclusion(resetVoters, contributions));

  return results;
}

// Summary of invariant check results
export function summarizeResults(results: InvariantResult[]): {
  passed: number;
  failed: number;
  all: InvariantResult[];
} {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return { passed, failed, all: results };
}

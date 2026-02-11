// Voter identification: determines active voters for an epoch

import type { Address, EventData, VoterState, EpochId } from '../types.js';

type VoteEvent = { type: 'voted'; event: EventData['voted'][0] } | { type: 'reset'; event: EventData['reset'][0] };

// Identify active voters from event data
// Active voters are those whose latest event per gauge is a Voted event (not Reset)
export function identifyActiveVoters(events: EventData, _epochId: EpochId): Map<Address, VoterState> {
  const activeVoters = new Map<Address, VoterState>();

  // Combine and sort all vote-related events chronologically
  const allEvents: VoteEvent[] = [
    ...events.voted.map(e => ({ type: 'voted' as const, event: e })),
    ...events.reset.map(e => ({ type: 'reset' as const, event: e })),
  ].sort((a, b) => {
    if (a.event.blockNumber !== b.event.blockNumber) {
      return a.event.blockNumber - b.event.blockNumber;
    }
    return a.event.logIndex - b.event.logIndex;
  });

  // Track the latest state per voter
  // Structure: voter -> { gauges: Map<gauge, latestEvent> }
  const voterGaugeStates = new Map<Address, Map<Address, VoteEvent>>();

  for (const event of allEvents) {
    const voter = event.event.voter;
    const gauge = event.event.gauge;

    if (!voterGaugeStates.has(voter)) {
      voterGaugeStates.set(voter, new Map());
    }

    const gaugeStates = voterGaugeStates.get(voter)!;

    // Reset clears all gauges for this voter if it's a full reset
    // Otherwise, just update this gauge's state
    if (event.type === 'reset') {
      // Check if this is a per-gauge reset or full reset
      // In AddressGaugeVoter, reset() emits Reset for each gauge
      gaugeStates.set(gauge, event);
    } else {
      // Vote event: this is the latest state for this gauge
      gaugeStates.set(gauge, event);
    }
  }

  // Build active voter states
  // A voter is active if they have at least one gauge where the latest event is Voted
  for (const [voter, gaugeStates] of voterGaugeStates) {
    const activeGauges: { gauge: Address; votes: bigint }[] = [];
    let latestTimestamp = 0;
    let latestBlock = 0;
    let latestTxHash = '';

    for (const [gauge, event] of gaugeStates) {
      if (event.type === 'voted') {
        activeGauges.push({
          gauge,
          votes: event.event.votingPowerCastForGauge,
        });

        if (event.event.timestamp > latestTimestamp) {
          latestTimestamp = event.event.timestamp;
          latestBlock = event.event.blockNumber;
          latestTxHash = event.event.txHash;
        }
      }
    }

    // Only add to active voters if they have at least one active gauge
    if (activeGauges.length > 0) {
      // Calculate total voting power from the latest Voted event
      // All gauges should have been voted in the same transaction, so they share the same VP
      const totalVotingPower = activeGauges.reduce((sum, g) => sum + g.votes, 0n);

      activeVoters.set(voter, {
        voter,
        gaugesVotedFor: activeGauges,
        totalVotingPower,
        lastVotedTimestamp: latestTimestamp,
        lastVotedBlock: latestBlock,
        txHash: latestTxHash,
      });
    }
  }

  return activeVoters;
}

// Get addresses that were reset (voters whose latest event is Reset for all gauges)
export function getResetVoters(events: EventData, epochId: EpochId): Set<Address> {
  const activeVoters = identifyActiveVoters(events, epochId);
  const allVotersInEvents = new Set<Address>();

  for (const event of events.voted) {
    allVotersInEvents.add(event.voter);
  }
  for (const event of events.reset) {
    allVotersInEvents.add(event.voter);
  }

  const resetVoters = new Set<Address>();
  for (const voter of allVotersInEvents) {
    if (!activeVoters.has(voter)) {
      resetVoters.add(voter);
    }
  }

  return resetVoters;
}

// Validate voter state consistency
// The sum of votes across gauges should equal the voter's total voting power used
export function validateVoterState(voterState: VoterState): boolean {
  const sumOfGaugeVotes = voterState.gaugesVotedFor.reduce((sum, g) => sum + g.votes, 0n);
  return sumOfGaugeVotes === voterState.totalVotingPower;
}

// Tests for voter identifier

import { describe, it, expect } from 'vitest';
import { identifyActiveVoters, getResetVoters, validateVoterState } from './voter-identifier.js';
import type { EventData, VotedEvent, ResetEvent, Address } from '../types.js';

const createVotedEvent = (
  voter: Address,
  gauge: Address,
  epoch: number,
  votes: bigint,
  timestamp: number,
  blockNumber: number,
  logIndex: number
): VotedEvent => ({
  voter,
  gauge,
  epoch,
  votingPowerCastForGauge: votes,
  totalVotingPowerInGauge: votes,
  totalVotingPowerInContract: votes,
  timestamp,
  blockNumber,
  logIndex,
  txHash: `0x${'a'.repeat(64)}`,
});

const createResetEvent = (
  voter: Address,
  gauge: Address,
  epoch: number,
  votes: bigint,
  timestamp: number,
  blockNumber: number,
  logIndex: number
): ResetEvent => ({
  voter,
  gauge,
  epoch,
  votingPowerRemovedFromGauge: votes,
  totalVotingPowerInGauge: 0n,
  totalVotingPowerInContract: 0n,
  timestamp,
  blockNumber,
  logIndex,
  txHash: `0x${'b'.repeat(64)}`,
});

const emptyEventData: EventData = {
  voted: [],
  reset: [],
  tokensDelegated: [],
  tokensUndelegated: [],
  delegateChanged: [],
};

describe('Voter Identifier', () => {
  describe('identifyActiveVoters', () => {
    it('should return empty map for no events', () => {
      const result = identifyActiveVoters(emptyEventData, 1);
      expect(result.size).toBe(0);
    });

    it('should identify a single voter', () => {
      const voter = '0x1234567890123456789012345678901234567890' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const events: EventData = {
        ...emptyEventData,
        voted: [createVotedEvent(voter, gauge, 1, 1000n, 100, 10, 0)],
      };

      const result = identifyActiveVoters(events, 1);

      expect(result.size).toBe(1);
      expect(result.has(voter)).toBe(true);

      const voterState = result.get(voter)!;
      expect(voterState.voter).toBe(voter);
      expect(voterState.gaugesVotedFor.length).toBe(1);
      expect(voterState.gaugesVotedFor[0].gauge).toBe(gauge);
      expect(voterState.gaugesVotedFor[0].votes).toBe(1000n);
    });

    it('should identify voter with multiple gauge votes', () => {
      const voter = '0x1234567890123456789012345678901234567890' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const events: EventData = {
        ...emptyEventData,
        voted: [
          createVotedEvent(voter, gauge1, 1, 700n, 100, 10, 0),
          createVotedEvent(voter, gauge2, 1, 300n, 100, 10, 1),
        ],
      };

      const result = identifyActiveVoters(events, 1);

      expect(result.size).toBe(1);
      const voterState = result.get(voter)!;
      expect(voterState.gaugesVotedFor.length).toBe(2);
      expect(voterState.totalVotingPower).toBe(1000n);
    });

    it('should exclude voter whose latest event is Reset', () => {
      const voter = '0x1234567890123456789012345678901234567890' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const events: EventData = {
        ...emptyEventData,
        voted: [createVotedEvent(voter, gauge, 1, 1000n, 100, 10, 0)],
        reset: [createResetEvent(voter, gauge, 1, 1000n, 200, 20, 0)],
      };

      const result = identifyActiveVoters(events, 1);

      expect(result.size).toBe(0);
    });

    it('should include voter who voted after reset', () => {
      const voter = '0x1234567890123456789012345678901234567890' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const events: EventData = {
        ...emptyEventData,
        voted: [
          createVotedEvent(voter, gauge1, 1, 1000n, 100, 10, 0),
          createVotedEvent(voter, gauge2, 1, 500n, 300, 30, 0),
        ],
        reset: [createResetEvent(voter, gauge1, 1, 1000n, 200, 20, 0)],
      };

      const result = identifyActiveVoters(events, 1);

      expect(result.size).toBe(1);
      const voterState = result.get(voter)!;
      // Should only have gauge2 since gauge1 was reset and not re-voted
      expect(voterState.gaugesVotedFor.length).toBe(1);
      expect(voterState.gaugesVotedFor[0].gauge).toBe(gauge2);
    });

    it('should handle multiple voters', () => {
      const voter1 = '0x1111111111111111111111111111111111111111' as Address;
      const voter2 = '0x2222222222222222222222222222222222222222' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const events: EventData = {
        ...emptyEventData,
        voted: [
          createVotedEvent(voter1, gauge, 1, 1000n, 100, 10, 0),
          createVotedEvent(voter2, gauge, 1, 2000n, 100, 10, 1),
        ],
      };

      const result = identifyActiveVoters(events, 1);

      expect(result.size).toBe(2);
      expect(result.has(voter1)).toBe(true);
      expect(result.has(voter2)).toBe(true);
    });
  });

  describe('getResetVoters', () => {
    it('should return voters whose latest event is Reset', () => {
      const voter1 = '0x1111111111111111111111111111111111111111' as Address;
      const voter2 = '0x2222222222222222222222222222222222222222' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const events: EventData = {
        ...emptyEventData,
        voted: [
          createVotedEvent(voter1, gauge, 1, 1000n, 100, 10, 0),
          createVotedEvent(voter2, gauge, 1, 2000n, 100, 10, 1),
        ],
        reset: [createResetEvent(voter2, gauge, 1, 2000n, 200, 20, 0)],
      };

      const result = getResetVoters(events, 1);

      expect(result.size).toBe(1);
      expect(result.has(voter2)).toBe(true);
      expect(result.has(voter1)).toBe(false);
    });
  });

  describe('validateVoterState', () => {
    it('should return true for consistent voter state', () => {
      const voterState = {
        voter: '0x1234567890123456789012345678901234567890' as Address,
        gaugesVotedFor: [
          { gauge: '0x0000000000000000000000000000000000000001' as Address, votes: 700n },
          { gauge: '0x0000000000000000000000000000000000000002' as Address, votes: 300n },
        ],
        totalVotingPower: 1000n,
        lastVotedTimestamp: 100,
        lastVotedBlock: 10,
        txHash: `0x${'a'.repeat(64)}`,
      };

      expect(validateVoterState(voterState)).toBe(true);
    });

    it('should return false for inconsistent voter state', () => {
      const voterState = {
        voter: '0x1234567890123456789012345678901234567890' as Address,
        gaugesVotedFor: [
          { gauge: '0x0000000000000000000000000000000000000001' as Address, votes: 700n },
          { gauge: '0x0000000000000000000000000000000000000002' as Address, votes: 300n },
        ],
        totalVotingPower: 500n, // Doesn't match sum
        lastVotedTimestamp: 100,
        lastVotedBlock: 10,
        txHash: `0x${'a'.repeat(64)}`,
      };

      expect(validateVoterState(voterState)).toBe(false);
    });
  });
});

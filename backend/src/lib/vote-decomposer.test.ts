// Tests for vote decomposer

import { describe, it, expect } from 'vitest';
import {
  aggregateByDelegator,
  aggregateByGauge,
  aggregateByDelegate,
  validateContributionSum,
} from './vote-decomposer.js';
import type { DelegatorContribution, VoterState, Address } from '../types.js';

const createContribution = (
  delegator: Address,
  delegate: Address,
  gauge: Address,
  votingPower: bigint,
  contribution: bigint
): DelegatorContribution => ({
  epochId: 1,
  delegator,
  delegate,
  gauge,
  delegatorVotingPower: votingPower,
  contribution,
  percentage: Number((votingPower * 100n) / contribution) || 0,
});

describe('Vote Decomposer', () => {
  describe('aggregateByDelegator', () => {
    it('should aggregate contributions by delegator', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const contributions = [
        createContribution(alice, bob, gauge1, 500n, 350n),
        createContribution(alice, bob, gauge2, 500n, 150n),
      ];

      const result = aggregateByDelegator(contributions);

      expect(result.size).toBe(1);
      expect(result.has(alice)).toBe(true);

      const aliceData = result.get(alice)!;
      expect(aliceData.totalContribution).toBe(500n);
      expect(aliceData.gaugeBreakdown.length).toBe(2);
    });

    it('should handle multiple delegators', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const contributions = [
        createContribution(alice, carol, gauge, 500n, 350n),
        createContribution(bob, carol, gauge, 200n, 140n),
      ];

      const result = aggregateByDelegator(contributions);

      expect(result.size).toBe(2);
      expect(result.get(alice)!.totalContribution).toBe(350n);
      expect(result.get(bob)!.totalContribution).toBe(140n);
    });
  });

  describe('aggregateByGauge', () => {
    it('should aggregate contributions by gauge', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const contributions = [
        createContribution(alice, bob, gauge1, 500n, 350n),
        createContribution(alice, bob, gauge2, 500n, 150n),
      ];

      const result = aggregateByGauge(contributions);

      expect(result.size).toBe(2);
      expect(result.get(gauge1)!.totalVotes).toBe(350n);
      expect(result.get(gauge2)!.totalVotes).toBe(150n);
    });

    it('should count unique contributors', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const contributions = [
        createContribution(alice, carol, gauge, 500n, 350n),
        createContribution(bob, carol, gauge, 200n, 140n),
      ];

      const result = aggregateByGauge(contributions);

      expect(result.get(gauge)!.uniqueContributors.size).toBe(2);
    });
  });

  describe('aggregateByDelegate', () => {
    it('should aggregate contributions by delegate', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const contributions = [
        createContribution(alice, carol, gauge1, 500n, 350n),
        createContribution(alice, carol, gauge2, 500n, 150n),
        createContribution(bob, carol, gauge1, 200n, 140n),
      ];

      const result = aggregateByDelegate(contributions);

      expect(result.size).toBe(1);
      expect(result.has(carol)).toBe(true);

      const carolData = result.get(carol)!;
      expect(carolData.delegatorCount).toBe(2);
      expect(carolData.gaugesVotedFor.size).toBe(2);
      expect(carolData.totalVotingPower).toBe(700n);
    });
  });

  describe('validateContributionSum', () => {
    it('should validate matching sums', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const voterState: VoterState = {
        voter: bob,
        gaugesVotedFor: [
          { gauge: gauge1, votes: 700n },
          { gauge: gauge2, votes: 300n },
        ],
        totalVotingPower: 1000n,
        lastVotedTimestamp: 100,
        lastVotedBlock: 10,
        txHash: `0x${'a'.repeat(64)}`,
      };

      const contributions = [
        createContribution(alice, bob, gauge1, 500n, 350n),
        createContribution(bob, bob, gauge1, 500n, 350n),
        createContribution(alice, bob, gauge2, 500n, 150n),
        createContribution(bob, bob, gauge2, 500n, 150n),
      ];

      const result = validateContributionSum(contributions, voterState);

      expect(result.isValid).toBe(true);
    });

    it('should detect mismatched sums', () => {
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;

      const voterState: VoterState = {
        voter: bob,
        gaugesVotedFor: [
          { gauge: gauge1, votes: 1000n },
        ],
        totalVotingPower: 1000n,
        lastVotedTimestamp: 100,
        lastVotedBlock: 10,
        txHash: `0x${'a'.repeat(64)}`,
      };

      const contributions = [
        createContribution(bob, bob, gauge1, 500n, 500n), // Only half
      ];

      const result = validateContributionSum(contributions, voterState);

      expect(result.isValid).toBe(false);
      expect(result.gaugeResults.get(gauge1)!.expected).toBe(1000n);
      expect(result.gaugeResults.get(gauge1)!.actual).toBe(500n);
    });
  });
});

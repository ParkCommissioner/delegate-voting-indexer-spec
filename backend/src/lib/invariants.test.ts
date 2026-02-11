// Tests for invariant checker

import { describe, it, expect } from 'vitest';
import {
  checkAttributionSumConsistency,
  checkNoDoubleCounting,
  checkNonVoterExclusion,
  summarizeResults,
} from './invariants.js';
import type { DelegatorContribution, Address } from '../types.js';

const createContribution = (
  delegator: Address,
  delegate: Address,
  gauge: Address,
  contribution: bigint,
  epochId: number = 1
): DelegatorContribution => ({
  epochId,
  delegator,
  delegate,
  gauge,
  delegatorVotingPower: contribution,
  contribution,
  percentage: 100,
});

describe('Invariants', () => {
  describe('checkAttributionSumConsistency', () => {
    it('should pass when contributions match expected votes', () => {
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const contributions = [
        createContribution(alice, bob, gauge, 500n),
        createContribution(bob, bob, gauge, 500n),
      ];

      const result = checkAttributionSumConsistency(bob, gauge, 1000n, contributions);

      expect(result.passed).toBe(true);
      expect(result.expected).toBe('1000');
      expect(result.actual).toBe('1000');
    });

    it('should fail when contributions do not match', () => {
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const contributions = [
        createContribution(bob, bob, gauge, 500n),
      ];

      const result = checkAttributionSumConsistency(bob, gauge, 1000n, contributions);

      expect(result.passed).toBe(false);
    });

    it('should allow small rounding errors', () => {
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      // 3 contributors, expected 1000, but due to rounding we get 999
      const contributions = [
        createContribution(alice, bob, gauge, 333n),
        createContribution(bob, bob, gauge, 333n),
        createContribution(carol, bob, gauge, 333n),
      ];

      const result = checkAttributionSumConsistency(bob, gauge, 1000n, contributions);

      // Should pass because 1000 - 999 = 1 <= 3 (number of contributors)
      expect(result.passed).toBe(true);
    });
  });

  describe('checkNoDoubleCounting', () => {
    it('should pass when no duplicates exist', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge1 = '0x0000000000000000000000000000000000000001' as Address;
      const gauge2 = '0x0000000000000000000000000000000000000002' as Address;

      const contributions = [
        createContribution(alice, bob, gauge1, 500n),
        createContribution(alice, bob, gauge2, 500n),
        createContribution(bob, bob, gauge1, 500n),
      ];

      const result = checkNoDoubleCounting(1, contributions);

      expect(result.passed).toBe(true);
    });

    it('should fail when duplicates exist', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const contributions = [
        createContribution(alice, bob, gauge, 500n),
        createContribution(alice, bob, gauge, 500n), // Duplicate!
      ];

      const result = checkNoDoubleCounting(1, contributions);

      expect(result.passed).toBe(false);
      expect(result.details).toContain('Duplicates found');
    });
  });

  describe('checkNonVoterExclusion', () => {
    it('should pass when reset voters have no contributions', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const resetVoters = new Set<Address>([alice]);

      const contributions = [
        createContribution(bob, carol, gauge, 500n),
      ];

      const result = checkNonVoterExclusion(resetVoters, contributions);

      expect(result.passed).toBe(true);
    });

    it('should fail when reset voters have contributions as delegates', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const gauge = '0x0000000000000000000000000000000000000001' as Address;

      const resetVoters = new Set<Address>([alice]);

      const contributions = [
        createContribution(bob, alice, gauge, 500n), // Alice is the delegate who was reset
      ];

      const result = checkNonVoterExclusion(resetVoters, contributions);

      expect(result.passed).toBe(false);
    });
  });

  describe('summarizeResults', () => {
    it('should correctly count passed and failed invariants', () => {
      const results = [
        { name: 'Test 1', passed: true },
        { name: 'Test 2', passed: true },
        { name: 'Test 3', passed: false },
        { name: 'Test 4', passed: true },
        { name: 'Test 5', passed: false },
      ];

      const summary = summarizeResults(results);

      expect(summary.passed).toBe(3);
      expect(summary.failed).toBe(2);
      expect(summary.all.length).toBe(5);
    });
  });
});

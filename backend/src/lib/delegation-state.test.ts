// Tests for delegation state reconstruction

import { describe, it, expect } from 'vitest';
import {
  reconstructDelegationState,
  getDelegatorsFor,
  getDelegateFor,
  getDelegatedTokens,
  wasTokenDelegatedTo,
  getActiveDelegates,
} from './delegation-state.js';
import type { Address, DelegateChangedEvent, TokensDelegatedEvent, TokensUndelegatedEvent } from '../types.js';

const createDelegateChangedEvent = (
  delegator: Address,
  fromDelegate: Address,
  toDelegate: Address,
  timestamp: number,
  blockNumber: number,
  logIndex: number
): DelegateChangedEvent => ({
  delegator,
  fromDelegate,
  toDelegate,
  timestamp,
  blockNumber,
  logIndex,
  txHash: `0x${'a'.repeat(64)}`,
});

const createTokensDelegatedEvent = (
  sender: Address,
  delegatee: Address,
  tokenIds: number[],
  timestamp: number,
  blockNumber: number,
  logIndex: number
): TokensDelegatedEvent => ({
  sender,
  delegatee,
  tokenIds,
  timestamp,
  blockNumber,
  logIndex,
  txHash: `0x${'b'.repeat(64)}`,
});

const createTokensUndelegatedEvent = (
  sender: Address,
  delegatee: Address,
  tokenIds: number[],
  timestamp: number,
  blockNumber: number,
  logIndex: number
): TokensUndelegatedEvent => ({
  sender,
  delegatee,
  tokenIds,
  timestamp,
  blockNumber,
  logIndex,
  txHash: `0x${'c'.repeat(64)}`,
});

describe('Delegation State', () => {
  describe('reconstructDelegationState', () => {
    it('should return empty state for no events', () => {
      const state = reconstructDelegationState([], [], [], 1000);

      expect(state.delegatorToDelegate.size).toBe(0);
      expect(state.tokenDelegation.size).toBe(0);
      expect(state.delegateToDelegators.size).toBe(0);
    });

    it('should track delegate changes', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const zeroAddr = '0x0000000000000000000000000000000000000000' as Address;

      const events = [
        createDelegateChangedEvent(alice, zeroAddr, bob, 100, 10, 0),
      ];

      const state = reconstructDelegationState(events, [], [], 1000);

      expect(getDelegateFor(state, alice)).toBe(bob);
      expect(getDelegatorsFor(state, bob)).toContain(alice);
    });

    it('should handle re-delegation', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const zeroAddr = '0x0000000000000000000000000000000000000000' as Address;

      const events = [
        createDelegateChangedEvent(alice, zeroAddr, bob, 100, 10, 0),
        createDelegateChangedEvent(alice, bob, carol, 200, 20, 0),
      ];

      const state = reconstructDelegationState(events, [], [], 1000);

      expect(getDelegateFor(state, alice)).toBe(carol);
      expect(getDelegatorsFor(state, bob)).not.toContain(alice);
      expect(getDelegatorsFor(state, carol)).toContain(alice);
    });

    it('should track token delegation', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;

      const events = [
        createTokensDelegatedEvent(alice, bob, [1, 2, 3], 100, 10, 0),
      ];

      const state = reconstructDelegationState([], events, [], 1000);

      expect(wasTokenDelegatedTo(state, 1, bob)).toBe(true);
      expect(wasTokenDelegatedTo(state, 2, bob)).toBe(true);
      expect(wasTokenDelegatedTo(state, 3, bob)).toBe(true);
      expect(getDelegatedTokens(state, alice, bob)).toEqual([1, 2, 3]);
    });

    it('should handle token undelegation', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;

      const delegatedEvents = [
        createTokensDelegatedEvent(alice, bob, [1, 2, 3], 100, 10, 0),
      ];
      const undelegatedEvents = [
        createTokensUndelegatedEvent(alice, bob, [2], 200, 20, 0),
      ];

      const state = reconstructDelegationState([], delegatedEvents, undelegatedEvents, 1000);

      expect(wasTokenDelegatedTo(state, 1, bob)).toBe(true);
      expect(wasTokenDelegatedTo(state, 2, bob)).toBe(false);
      expect(wasTokenDelegatedTo(state, 3, bob)).toBe(true);
      expect(getDelegatedTokens(state, alice, bob)).toEqual([1, 3]);
    });

    it('should filter events by snapshot timestamp', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const zeroAddr = '0x0000000000000000000000000000000000000000' as Address;

      const events = [
        createDelegateChangedEvent(alice, zeroAddr, bob, 100, 10, 0),
      ];

      // Snapshot before the event
      const stateBefore = reconstructDelegationState(events, [], [], 50);
      expect(getDelegateFor(stateBefore, alice)).toBeUndefined();

      // Snapshot after the event
      const stateAfter = reconstructDelegationState(events, [], [], 150);
      expect(getDelegateFor(stateAfter, alice)).toBe(bob);
    });

    it('should handle self-delegation', () => {
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const zeroAddr = '0x0000000000000000000000000000000000000000' as Address;

      const events = [
        createDelegateChangedEvent(bob, zeroAddr, bob, 100, 10, 0),
      ];

      const state = reconstructDelegationState(events, [], [], 1000);

      expect(getDelegateFor(state, bob)).toBe(bob);
      expect(getDelegatorsFor(state, bob)).toContain(bob);
    });
  });

  describe('getActiveDelegates', () => {
    it('should return all delegates with at least one delegator', () => {
      const alice = '0xAlice0000000000000000000000000000000000' as Address;
      const bob = '0xBob00000000000000000000000000000000000000' as Address;
      const carol = '0xCarol000000000000000000000000000000000000' as Address;
      const zeroAddr = '0x0000000000000000000000000000000000000000' as Address;

      const events = [
        createDelegateChangedEvent(alice, zeroAddr, bob, 100, 10, 0),
        createDelegateChangedEvent(carol, zeroAddr, bob, 100, 10, 1),
      ];

      const state = reconstructDelegationState(events, [], [], 1000);
      const activeDelegates = getActiveDelegates(state);

      expect(activeDelegates).toContain(bob);
      expect(activeDelegates.length).toBe(1);
    });
  });
});

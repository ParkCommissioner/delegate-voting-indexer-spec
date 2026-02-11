// Tests for snapshot resolver

import { describe, it, expect } from 'vitest';
import { computeEpochTimestamps } from './snapshot-resolver.js';
import { TIMING } from '../types.js';

describe('Snapshot Resolver', () => {
  describe('computeEpochTimestamps', () => {
    it('should compute correct timestamps for epoch 0', () => {
      const timestamps = computeEpochTimestamps(0);

      expect(timestamps.epochId).toBe(0);
      expect(timestamps.startTimestamp).toBe(0);
      expect(timestamps.voteStartTimestamp).toBe(TIMING.VOTE_WINDOW_BUFFER);
      expect(timestamps.voteEndTimestamp).toBe(TIMING.VOTE_DURATION - TIMING.VOTE_WINDOW_BUFFER);
      expect(timestamps.votingPowerSnapshotTimestamp).toBe(0);
    });

    it('should compute correct timestamps for epoch 1', () => {
      const timestamps = computeEpochTimestamps(1);

      expect(timestamps.epochId).toBe(1);
      expect(timestamps.startTimestamp).toBe(TIMING.EPOCH_DURATION);
      expect(timestamps.voteStartTimestamp).toBe(TIMING.EPOCH_DURATION + TIMING.VOTE_WINDOW_BUFFER);
      expect(timestamps.voteEndTimestamp).toBe(TIMING.EPOCH_DURATION + TIMING.VOTE_DURATION - TIMING.VOTE_WINDOW_BUFFER);
      expect(timestamps.votingPowerSnapshotTimestamp).toBe(TIMING.EPOCH_DURATION);
    });

    it('should compute correct timestamps for a later epoch', () => {
      const epochId = 52; // One year
      const timestamps = computeEpochTimestamps(epochId);

      expect(timestamps.epochId).toBe(epochId);
      expect(timestamps.startTimestamp).toBe(epochId * TIMING.EPOCH_DURATION);
      expect(timestamps.votingPowerSnapshotTimestamp).toBe(epochId * TIMING.EPOCH_DURATION);
    });

    it('should have voting window within epoch bounds', () => {
      for (let epochId = 0; epochId < 10; epochId++) {
        const timestamps = computeEpochTimestamps(epochId);
        const epochEnd = (epochId + 1) * TIMING.EPOCH_DURATION;

        expect(timestamps.voteStartTimestamp).toBeGreaterThan(timestamps.startTimestamp);
        expect(timestamps.voteEndTimestamp).toBeGreaterThan(timestamps.voteStartTimestamp);
        expect(timestamps.voteEndTimestamp).toBeLessThan(epochEnd);
      }
    });
  });
});

// Snapshot resolver: computes epoch timestamps via Clock contract

import { getClockContract, getBlockAtTimestamp } from './provider.js';
import { TIMING, type EpochId } from '../types.js';

export interface EpochTimestamps {
  epochId: EpochId;
  startTimestamp: number;
  voteStartTimestamp: number;
  voteEndTimestamp: number;
  votingPowerSnapshotTimestamp: number; // epoch start when hook=false
}

export interface BlockRange {
  fromBlock: number;
  toBlock: number;
}

// Get current epoch from Clock contract
export async function getCurrentEpoch(): Promise<EpochId> {
  const clock = getClockContract();
  const epoch = await clock.currentEpoch();
  return Number(epoch);
}

// Resolve epoch ID for a given timestamp
export async function resolveEpoch(timestamp: number): Promise<EpochId> {
  const clock = getClockContract();
  const epoch = await clock.resolveEpoch(timestamp);
  return Number(epoch);
}

// Compute epoch timestamps using Clock constants
export function computeEpochTimestamps(epochId: EpochId): EpochTimestamps {
  const startTimestamp = epochId * TIMING.EPOCH_DURATION;
  const voteStartTimestamp = startTimestamp + TIMING.VOTE_WINDOW_BUFFER;
  const voteEndTimestamp = startTimestamp + TIMING.VOTE_DURATION - TIMING.VOTE_WINDOW_BUFFER;

  return {
    epochId,
    startTimestamp,
    voteStartTimestamp,
    voteEndTimestamp,
    votingPowerSnapshotTimestamp: startTimestamp, // When hook=false, VP is snapshot at epoch start
  };
}

// Get epoch timestamps from Clock contract (more accurate)
export async function getEpochTimestampsFromContract(epochId: EpochId): Promise<EpochTimestamps> {
  const clock = getClockContract();

  // Calculate a timestamp within the epoch to query
  const epochMidpoint = epochId * TIMING.EPOCH_DURATION + TIMING.EPOCH_DURATION / 2;

  try {
    const [startTs, voteStartTs, voteEndTs] = await Promise.all([
      clock.resolveEpochStart(epochId),
      clock.resolveEpochVoteStartTs(epochMidpoint),
      clock.resolveEpochVoteEndTs(epochMidpoint),
    ]);

    return {
      epochId,
      startTimestamp: Number(startTs),
      voteStartTimestamp: Number(voteStartTs),
      voteEndTimestamp: Number(voteEndTs),
      votingPowerSnapshotTimestamp: Number(startTs),
    };
  } catch {
    // Fallback to computed values if contract calls fail
    console.warn(`Could not query timestamps for epoch ${epochId}, using computed values`);
    return computeEpochTimestamps(epochId);
  }
}

// Get block range for an epoch's voting window
export async function getBlockRangeForEpoch(epochId: EpochId): Promise<BlockRange> {
  const timestamps = computeEpochTimestamps(epochId);

  const [fromBlock, toBlock] = await Promise.all([
    getBlockAtTimestamp(timestamps.voteStartTimestamp),
    getBlockAtTimestamp(timestamps.voteEndTimestamp),
  ]);

  return { fromBlock, toBlock };
}

// Get block range from epoch start to vote end (for delegation events)
export async function getBlockRangeFromEpochStart(epochId: EpochId): Promise<BlockRange> {
  const timestamps = computeEpochTimestamps(epochId);

  const [fromBlock, toBlock] = await Promise.all([
    getBlockAtTimestamp(timestamps.startTimestamp),
    getBlockAtTimestamp(timestamps.voteEndTimestamp),
  ]);

  return { fromBlock, toBlock };
}

// Check if an epoch is finalized (voting window has ended)
export async function isEpochFinalized(epochId: EpochId): Promise<boolean> {
  const timestamps = computeEpochTimestamps(epochId);
  const now = Math.floor(Date.now() / 1000);
  return now > timestamps.voteEndTimestamp;
}

// Get all finalized epochs up to the current one
export async function getFinalizedEpochs(): Promise<EpochId[]> {
  const currentEpoch = await getCurrentEpoch();
  const epochs: EpochId[] = [];

  for (let i = 0; i < currentEpoch; i++) {
    if (await isEpochFinalized(i)) {
      epochs.push(i);
    }
  }

  return epochs;
}

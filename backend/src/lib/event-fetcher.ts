// Event fetcher: pulls Voted, Reset, and delegation events from contracts

import { getProvider } from './provider.js';
import { CONTRACTS, type Address, type EventData, type VotedEvent, type ResetEvent, type DelegateChangedEvent, type TokensDelegatedEvent, type TokensUndelegatedEvent, type EpochId, type TokenId } from '../types.js';
import { GAUGE_VOTER_ABI, ESCROW_IVOTES_ADAPTER_ABI } from './abis.js';
import { Contract, EventLog, Log } from 'ethers';

const BATCH_SIZE = 2000; // Max blocks per query to avoid RPC limits

// Fetch events in batches to handle large block ranges
async function fetchEventsInBatches(
  contract: Contract,
  eventName: string,
  fromBlock: number,
  toBlock: number
): Promise<(EventLog | Log)[]> {
  const allEvents: (EventLog | Log)[] = [];

  for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, toBlock);
    const events = await contract.queryFilter(contract.filters[eventName](), start, end);
    allEvents.push(...events);
  }

  return allEvents;
}

// Get block timestamp (with caching to reduce RPC calls)
const blockTimestampCache = new Map<number, number>();

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  if (blockTimestampCache.has(blockNumber)) {
    return blockTimestampCache.get(blockNumber)!;
  }

  const provider = getProvider();
  const block = await provider.getBlock(blockNumber);
  if (!block) throw new Error(`Could not fetch block ${blockNumber}`);

  blockTimestampCache.set(blockNumber, Number(block.timestamp));
  return Number(block.timestamp);
}

// Parse Voted events
async function parseVotedEvents(events: (EventLog | Log)[]): Promise<VotedEvent[]> {
  const parsed: VotedEvent[] = [];

  for (const event of events) {
    if (!('args' in event) || !event.args) continue;

    parsed.push({
      voter: event.args[0] as Address,
      gauge: event.args[1] as Address,
      epoch: Number(event.args[2]),
      votingPowerCastForGauge: BigInt(event.args[3]),
      totalVotingPowerInGauge: BigInt(event.args[4]),
      totalVotingPowerInContract: BigInt(event.args[5]),
      timestamp: Number(event.args[6]),
      blockNumber: event.blockNumber,
      logIndex: event.index,
      txHash: event.transactionHash,
    });
  }

  return parsed.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

// Parse Reset events
async function parseResetEvents(events: (EventLog | Log)[]): Promise<ResetEvent[]> {
  const parsed: ResetEvent[] = [];

  for (const event of events) {
    if (!('args' in event) || !event.args) continue;

    parsed.push({
      voter: event.args[0] as Address,
      gauge: event.args[1] as Address,
      epoch: Number(event.args[2]),
      votingPowerRemovedFromGauge: BigInt(event.args[3]),
      totalVotingPowerInGauge: BigInt(event.args[4]),
      totalVotingPowerInContract: BigInt(event.args[5]),
      timestamp: Number(event.args[6]),
      blockNumber: event.blockNumber,
      logIndex: event.index,
      txHash: event.transactionHash,
    });
  }

  return parsed.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

// Parse DelegateChanged events
async function parseDelegateChangedEvents(events: (EventLog | Log)[]): Promise<DelegateChangedEvent[]> {
  const parsed: DelegateChangedEvent[] = [];

  for (const event of events) {
    if (!('args' in event) || !event.args) continue;

    const timestamp = await getBlockTimestamp(event.blockNumber);
    parsed.push({
      delegator: event.args[0] as Address,
      fromDelegate: event.args[1] as Address,
      toDelegate: event.args[2] as Address,
      timestamp,
      blockNumber: event.blockNumber,
      logIndex: event.index,
      txHash: event.transactionHash,
    });
  }

  return parsed.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

// Parse TokensDelegated events
async function parseTokensDelegatedEvents(events: (EventLog | Log)[]): Promise<TokensDelegatedEvent[]> {
  const parsed: TokensDelegatedEvent[] = [];

  for (const event of events) {
    if (!('args' in event) || !event.args) continue;

    const timestamp = await getBlockTimestamp(event.blockNumber);
    const tokenIds = (event.args[2] as bigint[]).map((id: bigint) => Number(id));

    parsed.push({
      sender: event.args[0] as Address,
      delegatee: event.args[1] as Address,
      tokenIds: tokenIds as TokenId[],
      timestamp,
      blockNumber: event.blockNumber,
      logIndex: event.index,
      txHash: event.transactionHash,
    });
  }

  return parsed.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

// Parse TokensUndelegated events
async function parseTokensUndelegatedEvents(events: (EventLog | Log)[]): Promise<TokensUndelegatedEvent[]> {
  const parsed: TokensUndelegatedEvent[] = [];

  for (const event of events) {
    if (!('args' in event) || !event.args) continue;

    const timestamp = await getBlockTimestamp(event.blockNumber);
    const tokenIds = (event.args[2] as bigint[]).map((id: bigint) => Number(id));

    parsed.push({
      sender: event.args[0] as Address,
      delegatee: event.args[1] as Address,
      tokenIds: tokenIds as TokenId[],
      timestamp,
      blockNumber: event.blockNumber,
      logIndex: event.index,
      txHash: event.transactionHash,
    });
  }

  return parsed.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

// Main function to fetch all events for an epoch
export async function fetchEventsForEpoch(
  epochId: EpochId,
  fromBlock: number,
  toBlock: number
): Promise<EventData> {
  const provider = getProvider();

  const gaugeVoter = new Contract(CONTRACTS.GAUGE_VOTER, GAUGE_VOTER_ABI, provider);
  const escrowAdapter = new Contract(CONTRACTS.ESCROW_IVOTES_ADAPTER, ESCROW_IVOTES_ADAPTER_ABI, provider);

  // Fetch all events in parallel
  const [votedRaw, resetRaw, delegateChangedRaw, tokensDelegatedRaw, tokensUndelegatedRaw] = await Promise.all([
    fetchEventsInBatches(gaugeVoter, 'Voted', fromBlock, toBlock),
    fetchEventsInBatches(gaugeVoter, 'Reset', fromBlock, toBlock),
    fetchEventsInBatches(escrowAdapter, 'DelegateChanged', fromBlock, toBlock),
    fetchEventsInBatches(escrowAdapter, 'TokensDelegated', fromBlock, toBlock),
    fetchEventsInBatches(escrowAdapter, 'TokensUndelegated', fromBlock, toBlock),
  ]);

  // Parse all events
  const [voted, reset, delegateChanged, tokensDelegated, tokensUndelegated] = await Promise.all([
    parseVotedEvents(votedRaw),
    parseResetEvents(resetRaw),
    parseDelegateChangedEvents(delegateChangedRaw),
    parseTokensDelegatedEvents(tokensDelegatedRaw),
    parseTokensUndelegatedEvents(tokensUndelegatedRaw),
  ]);

  // Filter events to only include those for the target epoch
  const epochVoted = voted.filter(e => e.epoch === epochId);
  const epochReset = reset.filter(e => e.epoch === epochId);

  return {
    voted: epochVoted,
    reset: epochReset,
    tokensDelegated,
    tokensUndelegated,
    delegateChanged,
  };
}

// Fetch historical delegation events up to a specific timestamp
export async function fetchDelegationEventsUpTo(
  snapshotTimestamp: number,
  fromBlock: number = 0
): Promise<Pick<EventData, 'delegateChanged' | 'tokensDelegated' | 'tokensUndelegated'>> {
  const provider = getProvider();
  const escrowAdapter = new Contract(CONTRACTS.ESCROW_IVOTES_ADAPTER, ESCROW_IVOTES_ADAPTER_ABI, provider);

  // Get the block at the snapshot timestamp
  const latestBlock = await provider.getBlock('latest');
  if (!latestBlock) throw new Error('Could not fetch latest block');

  // Find the block at or before the snapshot timestamp
  let toBlock = latestBlock.number;
  if (latestBlock.timestamp > snapshotTimestamp) {
    // Binary search for the block
    let lo = fromBlock;
    let hi = latestBlock.number;

    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const block = await provider.getBlock(mid);
      if (!block) throw new Error(`Could not fetch block ${mid}`);

      if (Number(block.timestamp) <= snapshotTimestamp) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    toBlock = lo;
  }

  // Fetch delegation events
  const [delegateChangedRaw, tokensDelegatedRaw, tokensUndelegatedRaw] = await Promise.all([
    fetchEventsInBatches(escrowAdapter, 'DelegateChanged', fromBlock, toBlock),
    fetchEventsInBatches(escrowAdapter, 'TokensDelegated', fromBlock, toBlock),
    fetchEventsInBatches(escrowAdapter, 'TokensUndelegated', fromBlock, toBlock),
  ]);

  const [delegateChanged, tokensDelegated, tokensUndelegated] = await Promise.all([
    parseDelegateChangedEvents(delegateChangedRaw),
    parseTokensDelegatedEvents(tokensDelegatedRaw),
    parseTokensUndelegatedEvents(tokensUndelegatedRaw),
  ]);

  // Filter to only include events up to the snapshot timestamp
  return {
    delegateChanged: delegateChanged.filter(e => e.timestamp <= snapshotTimestamp),
    tokensDelegated: tokensDelegated.filter(e => e.timestamp <= snapshotTimestamp),
    tokensUndelegated: tokensUndelegated.filter(e => e.timestamp <= snapshotTimestamp),
  };
}

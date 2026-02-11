// Core types for the delegate voting indexer

export type Address = `0x${string}`;
export type TokenId = number;
export type EpochId = number;

// Contract addresses for Katana network
export const CONTRACTS = {
  DAO: '0x545A4657eefb4E5e3C3D016e5b4ff2E18b17C042' as Address,
  TOKEN: '0xC194b4424123275745547B1b7D7203C29A886733' as Address,
  GAUGE_VOTER: '0x454318a35bCC04496CC206dc66C735f488067ca3' as Address,
  VOTING_ESCROW: '0x33fb4429d67b2d022B9d40751d44A9DA9A84d02b' as Address,
  CLOCK: '0x3A2c796c7Fca5EB0eB182D575Fe5645c5A08ad00' as Address,
  NFT_LOCK: '0x0Cd7A09151FA46dAd895102654e8879375d1D647' as Address,
  ESCROW_IVOTES_ADAPTER: '0x156eA9a93cDE71a62FA929Ebeff656064e3C8D69' as Address,
  CURVE: '0xDD94d7D4B3c2771e00C6d700B755405a7Aa91B68' as Address,
} as const;

export const GAUGES = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
] as const;

// Timing constants from Clock contract
export const TIMING = {
  EPOCH_DURATION: 1_209_600, // 2 weeks in seconds
  CHECKPOINT_INTERVAL: 604_800, // 1 week in seconds
  VOTE_DURATION: 604_800, // 1 week in seconds
  VOTE_WINDOW_BUFFER: 3_600, // 1 hour in seconds
} as const;

// Event types
export interface VotedEvent {
  voter: Address;
  gauge: Address;
  epoch: EpochId;
  votingPowerCastForGauge: bigint;
  totalVotingPowerInGauge: bigint;
  totalVotingPowerInContract: bigint;
  timestamp: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface ResetEvent {
  voter: Address;
  gauge: Address;
  epoch: EpochId;
  votingPowerRemovedFromGauge: bigint;
  totalVotingPowerInGauge: bigint;
  totalVotingPowerInContract: bigint;
  timestamp: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface DelegateChangedEvent {
  delegator: Address;
  fromDelegate: Address;
  toDelegate: Address;
  timestamp: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface TokensDelegatedEvent {
  sender: Address;
  delegatee: Address;
  tokenIds: TokenId[];
  timestamp: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface TokensUndelegatedEvent {
  sender: Address;
  delegatee: Address;
  tokenIds: TokenId[];
  timestamp: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface EventData {
  voted: VotedEvent[];
  reset: ResetEvent[];
  tokensDelegated: TokensDelegatedEvent[];
  tokensUndelegated: TokensUndelegatedEvent[];
  delegateChanged: DelegateChangedEvent[];
}

// Processing stage types
export interface VoterState {
  voter: Address;
  gaugesVotedFor: { gauge: Address; votes: bigint }[];
  totalVotingPower: bigint;
  lastVotedTimestamp: number;
  lastVotedBlock: number;
  txHash: string;
}

export interface DelegationState {
  delegatorToDelegate: Map<Address, Address>;
  tokenDelegation: Map<TokenId, {
    owner: Address;
    delegate: Address;
    isDelegated: boolean;
  }>;
  delegateToDelegators: Map<Address, Set<Address>>;
}

export interface DelegateVotingPower {
  delegate: Address;
  totalVotingPower: bigint;
  breakdown: {
    delegator: Address;
    tokenIds: TokenId[];
    votingPower: bigint;
  }[];
}

export interface DelegatorContribution {
  epochId: EpochId;
  delegator: Address;
  delegate: Address;
  gauge: Address;
  delegatorVotingPower: bigint;
  contribution: bigint;
  percentage: number;
}

// Database models
export interface Epoch {
  epochId: EpochId;
  startTimestamp: number;
  voteStartTimestamp: number;
  voteEndTimestamp: number;
  snapshotTimestamp: number;
  totalVotes: bigint;
  isFinalized: boolean;
  createdAt: Date;
}

export interface Gauge {
  address: Address;
  isActive: boolean;
  createdAt: number;
  metadataUri?: string;
}

export interface Vote {
  epochId: EpochId;
  delegateAddress: Address;
  gaugeAddress: Address;
  votingPowerUsed: bigint;
  votesCast: bigint;
  weightPercentage: number;
  votedAtTimestamp: number;
  votedAtBlock: number;
  txHash: string;
}

export interface Delegation {
  epochId: EpochId;
  delegatorAddress: Address;
  delegateAddress: Address;
  tokenIds: TokenId[];
  totalVotingPower: bigint;
  snapshotTimestamp: number;
}

export interface Contribution {
  epochId: EpochId;
  delegatorAddress: Address;
  delegateAddress: Address;
  gaugeAddress: Address;
  delegatorVotingPower: bigint;
  contributionAmount: bigint;
  contributionPercentage: number;
}

export interface EpochGaugeTotal {
  epochId: EpochId;
  gaugeAddress: Address;
  totalVotes: bigint;
  uniqueVoters: number;
  uniqueContributors: number;
}

export interface DelegateRanking {
  epochId: EpochId;
  delegateAddress: Address;
  totalVotingPower: bigint;
  delegatorCount: number;
  gaugesVotedFor: number;
  rank: number;
}

// Epoch summary for API responses
export interface EpochSummary {
  epoch: Epoch;
  gauges: (EpochGaugeTotal & { percentage: number })[];
  summary: {
    totalDelegates: number;
    totalContributors: number;
    totalGaugesVotedFor: number;
  };
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

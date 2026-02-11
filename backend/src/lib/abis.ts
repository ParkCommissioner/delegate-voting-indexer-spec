// Contract ABIs for ve-governance system

export const CLOCK_ABI = [
  'function currentEpoch() view returns (uint256)',
  'function resolveEpoch(uint256 timestamp) view returns (uint256)',
  'function votingActive() view returns (bool)',
  'function epochVoteEndTs() view returns (uint256)',
  'function epochVoteStartTs() view returns (uint256)',
  'function resolveEpochVoteEndTs(uint256 timestamp) view returns (uint256)',
  'function resolveEpochVoteStartTs(uint256 timestamp) view returns (uint256)',
  'function currentEpochStart() view returns (uint256)',
  'function resolveEpochStart(uint256 epochId) view returns (uint256)',
] as const;

export const GAUGE_VOTER_ABI = [
  'function enableUpdateVotingPowerHook() view returns (bool)',
  'function epochTotalVotingPowerCast(uint256 epoch) view returns (uint256)',
  'function epochGaugeVotes(uint256 epoch, address gauge) view returns (uint256)',
  'function isVoting(address account) view returns (bool)',
  'function usedVotingPower(address account) view returns (uint256)',
  'function gaugesVotedFor(address account) view returns (address[])',
  'function getWriteEpochId() view returns (uint256)',
  'function epochVoteData(uint256 epoch, address voter) view returns (uint256 usedVotingPower, uint256 lastVoted)',
  'event Voted(address indexed voter, address indexed gauge, uint256 indexed epoch, uint256 votingPowerCastForGauge, uint256 totalVotingPowerInGauge, uint256 totalVotingPowerInContract, uint256 timestamp)',
  'event Reset(address indexed voter, address indexed gauge, uint256 indexed epoch, uint256 votingPowerRemovedFromGauge, uint256 totalVotingPowerInGauge, uint256 totalVotingPowerInContract, uint256 timestamp)',
] as const;

export const ESCROW_IVOTES_ADAPTER_ABI = [
  'function getVotes(address account) view returns (uint256)',
  'function getPastVotes(address account, uint256 timestamp) view returns (uint256)',
  'function delegates(address account) view returns (address)',
  'function tokenIsDelegated(uint256 tokenId) view returns (bool)',
  'event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)',
  'event TokensDelegated(address indexed sender, address indexed delegatee, uint256[] tokenIds)',
  'event TokensUndelegated(address indexed sender, address indexed delegatee, uint256[] tokenIds)',
] as const;

export const VOTING_ESCROW_ABI = [
  'function ownedTokens(address owner) view returns (uint256[])',
  'function votingPowerAt(uint256 tokenId, uint256 timestamp) view returns (uint256)',
  'function locked(uint256 tokenId) view returns (uint256 amount, uint256 start)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
] as const;

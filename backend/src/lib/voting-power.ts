// Voting power calculation: queries and calculates voting power for delegates and delegators

import { getVotingEscrowContract, getEscrowIVotesAdapterContract } from './provider.js';
import type { Address, TokenId, DelegationState, DelegateVotingPower } from '../types.js';
import { getDelegatorsFor, getDelegatedTokens } from './delegation-state.js';

// Get voting power for a delegate at a specific timestamp
export async function getDelegateVotingPower(
  delegate: Address,
  timestamp: number
): Promise<bigint> {
  const adapter = getEscrowIVotesAdapterContract();
  return adapter.getPastVotes(delegate, timestamp);
}

// Get current voting power for a delegate
export async function getCurrentDelegateVotingPower(delegate: Address): Promise<bigint> {
  const adapter = getEscrowIVotesAdapterContract();
  return adapter.getVotes(delegate);
}

// Get voting power for a specific token at a timestamp
export async function getTokenVotingPower(
  tokenId: TokenId,
  timestamp: number
): Promise<bigint> {
  const votingEscrow = getVotingEscrowContract();
  try {
    return await votingEscrow.votingPowerAt(tokenId, timestamp);
  } catch {
    // Token might not exist at this timestamp
    return 0n;
  }
}

// Get all tokens owned by an address
export async function getOwnedTokens(owner: Address): Promise<TokenId[]> {
  const votingEscrow = getVotingEscrowContract();
  try {
    const tokens = await votingEscrow.ownedTokens(owner);
    return tokens.map((t: bigint) => Number(t));
  } catch {
    // Fallback: enumerate tokens
    try {
      const balance = await votingEscrow.balanceOf(owner);
      const tokens: TokenId[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await votingEscrow.tokenOfOwnerByIndex(owner, i);
        tokens.push(Number(tokenId));
      }
      return tokens;
    } catch {
      return [];
    }
  }
}

// Calculate voting power breakdown for a delegate
export async function calculateDelegateVotingPowerBreakdown(
  delegate: Address,
  delegationState: DelegationState,
  snapshotTimestamp: number
): Promise<DelegateVotingPower> {
  const delegators = getDelegatorsFor(delegationState, delegate);
  const breakdown: DelegateVotingPower['breakdown'] = [];
  let totalVotingPower = 0n;

  for (const delegator of delegators) {
    const delegatedTokens = getDelegatedTokens(delegationState, delegator, delegate);

    if (delegatedTokens.length === 0) continue;

    // Get voting power for each token
    let delegatorVP = 0n;
    for (const tokenId of delegatedTokens) {
      const tokenVP = await getTokenVotingPower(tokenId, snapshotTimestamp);
      delegatorVP += tokenVP;
    }

    if (delegatorVP > 0n) {
      breakdown.push({
        delegator,
        tokenIds: delegatedTokens,
        votingPower: delegatorVP,
      });
      totalVotingPower += delegatorVP;
    }
  }

  return {
    delegate,
    totalVotingPower,
    breakdown,
  };
}

// Calculate voting power for a single delegator's contribution to a delegate
export async function calculateDelegatorVotingPower(
  delegator: Address,
  delegate: Address,
  delegationState: DelegationState,
  snapshotTimestamp: number
): Promise<{ tokenIds: TokenId[]; votingPower: bigint }> {
  const delegatedTokens = getDelegatedTokens(delegationState, delegator, delegate);

  if (delegatedTokens.length === 0) {
    return { tokenIds: [], votingPower: 0n };
  }

  let votingPower = 0n;
  for (const tokenId of delegatedTokens) {
    const tokenVP = await getTokenVotingPower(tokenId, snapshotTimestamp);
    votingPower += tokenVP;
  }

  return { tokenIds: delegatedTokens, votingPower };
}

// Verify that the sum of delegators' voting power equals the delegate's getPastVotes
export async function verifyDelegationPowerConsistency(
  delegate: Address,
  delegationState: DelegationState,
  snapshotTimestamp: number
): Promise<{ isConsistent: boolean; expected: bigint; calculated: bigint }> {
  const [expected, breakdown] = await Promise.all([
    getDelegateVotingPower(delegate, snapshotTimestamp),
    calculateDelegateVotingPowerBreakdown(delegate, delegationState, snapshotTimestamp),
  ]);

  return {
    isConsistent: expected === breakdown.totalVotingPower,
    expected,
    calculated: breakdown.totalVotingPower,
  };
}

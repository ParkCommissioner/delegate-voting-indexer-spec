// Delegation state reconstruction: builds delegation state at a specific timestamp

import type {
  Address,
  TokenId,
  DelegationState,
  DelegateChangedEvent,
  TokensDelegatedEvent,
  TokensUndelegatedEvent,
} from '../types.js';

type DelegationEvent =
  | { type: 'delegateChanged'; event: DelegateChangedEvent }
  | { type: 'tokensDelegated'; event: TokensDelegatedEvent }
  | { type: 'tokensUndelegated'; event: TokensUndelegatedEvent };

// Reconstruct delegation state at a specific timestamp by replaying events
export function reconstructDelegationState(
  delegateChangedEvents: DelegateChangedEvent[],
  tokensDelegatedEvents: TokensDelegatedEvent[],
  tokensUndelegatedEvents: TokensUndelegatedEvent[],
  snapshotTimestamp: number
): DelegationState {
  // Filter events up to the snapshot timestamp
  const filteredDelegateChanged = delegateChangedEvents.filter(
    e => e.timestamp <= snapshotTimestamp
  );
  const filteredTokensDelegated = tokensDelegatedEvents.filter(
    e => e.timestamp <= snapshotTimestamp
  );
  const filteredTokensUndelegated = tokensUndelegatedEvents.filter(
    e => e.timestamp <= snapshotTimestamp
  );

  // Combine and sort chronologically
  const allEvents: DelegationEvent[] = [
    ...filteredDelegateChanged.map(e => ({ type: 'delegateChanged' as const, event: e })),
    ...filteredTokensDelegated.map(e => ({ type: 'tokensDelegated' as const, event: e })),
    ...filteredTokensUndelegated.map(e => ({ type: 'tokensUndelegated' as const, event: e })),
  ].sort((a, b) => {
    if (a.event.blockNumber !== b.event.blockNumber) {
      return a.event.blockNumber - b.event.blockNumber;
    }
    return a.event.logIndex - b.event.logIndex;
  });

  // Initialize state
  const delegatorToDelegate = new Map<Address, Address>();
  const tokenDelegation = new Map<TokenId, { owner: Address; delegate: Address; isDelegated: boolean }>();
  const delegateToDelegators = new Map<Address, Set<Address>>();

  // Helper to update delegate-to-delegators mapping
  const addDelegator = (delegate: Address, delegator: Address) => {
    if (!delegateToDelegators.has(delegate)) {
      delegateToDelegators.set(delegate, new Set());
    }
    delegateToDelegators.get(delegate)!.add(delegator);
  };

  const removeDelegator = (delegate: Address, delegator: Address) => {
    const delegators = delegateToDelegators.get(delegate);
    if (delegators) {
      delegators.delete(delegator);
      if (delegators.size === 0) {
        delegateToDelegators.delete(delegate);
      }
    }
  };

  // Replay events chronologically
  for (const event of allEvents) {
    switch (event.type) {
      case 'delegateChanged': {
        const { delegator, toDelegate } = event.event;

        // Update delegator -> delegate mapping
        const previousDelegate = delegatorToDelegate.get(delegator);
        if (previousDelegate) {
          removeDelegator(previousDelegate, delegator);
        }

        delegatorToDelegate.set(delegator, toDelegate);
        addDelegator(toDelegate, delegator);
        break;
      }

      case 'tokensDelegated': {
        const { sender, delegatee, tokenIds } = event.event;

        for (const tokenId of tokenIds) {
          tokenDelegation.set(tokenId, {
            owner: sender,
            delegate: delegatee,
            isDelegated: true,
          });
        }
        break;
      }

      case 'tokensUndelegated': {
        const { tokenIds } = event.event;

        for (const tokenId of tokenIds) {
          const existing = tokenDelegation.get(tokenId);
          if (existing) {
            tokenDelegation.set(tokenId, {
              ...existing,
              isDelegated: false,
            });
          }
        }
        break;
      }
    }
  }

  return {
    delegatorToDelegate,
    tokenDelegation,
    delegateToDelegators,
  };
}

// Get all delegators for a specific delegate at the snapshot
export function getDelegatorsFor(state: DelegationState, delegate: Address): Address[] {
  const delegators = state.delegateToDelegators.get(delegate);
  return delegators ? Array.from(delegators) : [];
}

// Get the delegate for a specific delegator at the snapshot
export function getDelegateFor(state: DelegationState, delegator: Address): Address | undefined {
  return state.delegatorToDelegate.get(delegator);
}

// Get all delegated tokens for a specific owner to a specific delegate
export function getDelegatedTokens(
  state: DelegationState,
  owner: Address,
  delegate: Address
): TokenId[] {
  const tokens: TokenId[] = [];

  for (const [tokenId, info] of state.tokenDelegation) {
    if (info.owner === owner && info.delegate === delegate && info.isDelegated) {
      tokens.push(tokenId);
    }
  }

  return tokens;
}

// Check if a token was delegated to a specific delegate at the snapshot
export function wasTokenDelegatedTo(
  state: DelegationState,
  tokenId: TokenId,
  delegate: Address
): boolean {
  const info = state.tokenDelegation.get(tokenId);
  return info !== undefined && info.delegate === delegate && info.isDelegated;
}

// Get all active delegates (those with at least one delegator)
export function getActiveDelegates(state: DelegationState): Address[] {
  return Array.from(state.delegateToDelegators.keys());
}

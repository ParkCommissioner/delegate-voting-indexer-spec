# Delegate Voting Indexer Specification

## Overview

This specification describes an indexing service for Aragon's ve-governance system that decomposes delegate voting into per-delegator contributions. When a delegate votes on a gauge, their voting power may include delegated power from multiple token holders. This indexer attributes each vote back to the original token holders, enabling accurate reward distribution where "owner gets rewards" — regardless of who actually casts the vote.

---

## Table of Contents

1. [Terminology](#terminology)
2. [System Architecture](#system-architecture)
3. [Delegation and Voting Flow](#delegation-and-voting-flow)
4. [Epoch and Timing](#epoch-and-timing)
5. [Vote Decomposition Algorithm](#vote-decomposition-algorithm)
6. [Edge Cases](#edge-cases)
7. [Processing Stages](#processing-stages)
8. [Invariants](#invariants)
9. [Data Model](#data-model)
10. [API Shape](#api-shape)
11. [Contract Reference](#contract-reference)

---

## Terminology

| Term | Definition |
|------|------------|
| **veNFT** | A non-fungible token representing locked tokens in the VotingEscrow contract. Each veNFT has voting power that increases over time. |
| **Voting Power** | The weight a veNFT carries for gauge voting. Calculated as `amount * (1 + elapsed_time / MAX_TIME)` where MAX_TIME is 52 epochs (2 years). |
| **Delegate** | An address that votes on behalf of one or more token holders. A delegate's voting power is the sum of all veNFTs delegated to them. |
| **Delegator** | A token holder who has delegated their veNFT(s) to a delegate. |
| **Self-delegation** | When a token holder delegates to themselves. They are both the delegator and delegate. |
| **Gauge** | A target that receives votes. Gauges compete for a share of rewards based on votes received. |
| **Epoch** | A 2-week period that structures the voting cycle. Each epoch has a voting window and a non-voting period. |
| **Voting Window** | The period within an epoch when votes can be cast. Runs from 1 hour after epoch start to 1 week minus 1 hour. |
| **Snapshot Timestamp** | See [Critical Timestamps](#critical-timestamps) — there are two distinct snapshots with different purposes. |
| **Voting Power Snapshot** | The timestamp at which delegate voting power is determined. When `enableUpdateVotingPowerHook = false`, this is **epoch start**. |
| **Vote Finalization Timestamp** | The end of the voting window — the point at which final vote tallies are locked and no more votes can be cast. |

---

## Critical Configuration: `enableUpdateVotingPowerHook`

The AddressGaugeVoter contract has a critical configuration flag that fundamentally changes how voting power is determined and how votes persist:

```solidity
bool public enableUpdateVotingPowerHook;  // AddressGaugeVoter.sol:60
```

### Mode Comparison

| Behavior | `enableUpdateVotingPowerHook = false` | `enableUpdateVotingPowerHook = true` |
|----------|--------------------------------------|-------------------------------------|
| **Voting Power Source** | `getPastVotes(account, epochStart)` — snapshot at epoch start | `getVotes(account)` — live balance |
| **Vote Storage** | Per-epoch: `epochVoteData[epochId][account]` | Global: `epochVoteData[0][account]` |
| **Vote Persistence** | Votes do NOT persist across epochs | Votes persist until reset |
| **Double-Vote Protection** | Built-in (VP locked at epoch start) | Requires `updateVotingPower` hook |
| **Late Delegation Effect** | No effect (VP already locked) | No auto-update; delegate must re-vote |

**Contract source**: `AddressGaugeVoter.sol:119-146` (detailed comment explaining the security rationale)

### Which Mode to Use

**`enableUpdateVotingPowerHook = false`** (RECOMMENDED for security):
- Prevents double-voting attacks where tokens are transferred mid-epoch
- Voting power is deterministic at epoch start
- Simpler indexer logic — just query `getPastVotes` at epoch start

**`enableUpdateVotingPowerHook = true`**:
- Required if the underlying token cannot call `updateVotingPower` on transfers
- Allows votes to persist across epochs without re-voting
- More complex, requires careful handling of delegation changes

**For indexer**: Query the on-chain value of `enableUpdateVotingPowerHook` at startup and use the appropriate logic. The algorithms in this spec support both modes.

---

## System Architecture

The ve-governance system consists of several interconnected contracts:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VE-GOVERNANCE SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────────────────────┐ │
│  │    Token     │───▶│  VotingEscrow     │───▶│  QuadraticIncreasingCurve│ │
│  │   (ERC20)    │    │  (Lock & veNFT)   │    │  (Voting Power Calc)     │ │
│  └──────────────┘    └─────────┬─────────┘    └──────────────────────────┘ │
│                                │                                            │
│                                ▼                                            │
│                      ┌──────────────────────┐                               │
│                      │  EscrowIVotesAdapter │                               │
│                      │  (Delegation Logic)  │                               │
│                      └──────────┬───────────┘                               │
│                                 │                                           │
│                                 ▼                                           │
│  ┌──────────────┐    ┌──────────────────────┐    ┌──────────────────────┐  │
│  │    Clock     │───▶│  AddressGaugeVoter   │───▶│      Gauges          │  │
│  │   (Timing)   │    │   (Vote Casting)     │    │  (Vote Targets)      │  │
│  └──────────────┘    └──────────────────────┘    └──────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Contract Addresses (Katana Network)

| Contract | Address |
|----------|---------|
| DAO | `0x545A4657eefb4E5e3C3D016e5b4ff2E18b17C042` |
| Token | `0xC194b4424123275745547B1b7D7203C29A886733` |
| Gauge Voter Plugin | `0x454318a35bCC04496CC206dc66C735f488067ca3` |
| Voting Escrow | `0x33fb4429d67b2d022B9d40751d44A9DA9A84d02b` |
| Clock | `0x3A2c796c7Fca5EB0eB182D575Fe5645c5A08ad00` |
| NFT Lock | `0x0Cd7A09151FA46dAd895102654e8879375d1D647` |
| Escrow IVotes Adapter | `0x156eA9a93cDE71a62FA929Ebeff656064e3C8D69` |
| Curve | `0xDD94d7D4B3c2771e00C6d700B755405a7Aa91B68` |

### Active Gauges

- `0x0000000000000000000000000000000000000001`
- `0x0000000000000000000000000000000000000002`
- `0x0000000000000000000000000000000000000003`

---

## Delegation and Voting Flow

### Step 1: Token Locking

Users lock ERC20 tokens in the VotingEscrow contract to mint veNFTs.

```
User locks 1000 tokens → VotingEscrow.createLock(1000)
                       → veNFT #42 minted to user
                       → Initial voting power = 1000 (1x multiplier)
```

**Source**: `VotingEscrowIncreasing_v1_2_0.sol:339-378` — `_createLockFor()` function.

### Step 2: Voting Power Growth

Voting power increases linearly from 1x to 2x over 52 epochs (2 years):

```
votingPower = amount * (1 + elapsed / MAX_TIME)

Where:
- amount = locked token amount
- elapsed = time since lock start (capped at MAX_TIME)
- MAX_TIME = 52 epochs * 2 weeks = 63,072,000 seconds
```

**Example**:
- Lock 1000 tokens at epoch 0
- At epoch 0: voting power = 1000 * 1.0 = 1000
- At epoch 26 (1 year): voting power = 1000 * 1.5 = 1500
- At epoch 52 (2 years): voting power = 1000 * 2.0 = 2000

**Source**: `CurveConstantLib.sol:14-26` and `QuadraticIncreasingCurve.sol:143-170`.

### Step 3: Delegation

Token holders delegate their veNFTs to a delegate (which can be themselves):

```
┌─────────────┐         ┌────────────────────────┐
│ Token Owner │────────▶│ EscrowIVotesAdapter    │
│   (Alice)   │         │ delegate(delegatee)    │
└─────────────┘         └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │ Delegation recorded:   │
                        │ Alice → delegatee      │
                        │ tokenIsDelegated[42]=1 │
                        └────────────────────────┘
```

**Key delegation functions**:

1. **`delegate(address _delegatee)`** — Delegates all owned tokens to a new delegatee. If tokens were previously delegated, they are first undelegated.
   - Source: `EscrowIVotesAdapter.sol:170-191`

2. **`delegate(uint256[] _tokenIds)`** — Delegates specific tokens to the current delegatee.
   - Source: `EscrowIVotesAdapter.sol:150-165`

3. **`undelegate(uint256[] _tokenIds)`** — Removes specific tokens from delegation.
   - Source: `EscrowIVotesAdapter.sol:195-209`

**Delegation tracking**:
- `delegates(address)` — Returns the delegatee for an address.
- `tokenIsDelegated(uint256)` — Returns whether a specific token is delegated.
- `getVotes(address)` / `getPastVotes(address, timestamp)` — Returns voting power for a delegate.

### Step 4: Voting

Delegates vote on gauges during the voting window:

```
┌──────────────┐      ┌─────────────────────────┐
│   Delegate   │─────▶│   AddressGaugeVoter     │
│    (Bob)     │      │   vote(GaugeVote[])     │
└──────────────┘      └───────────┬─────────────┘
                                  │
                                  ▼
                      ┌─────────────────────────┐
                      │ For each gauge:         │
                      │ 1. Get voting power     │
                      │ 2. Calculate votes      │
                      │ 3. Emit Voted event     │
                      └─────────────────────────┘
```

**Voting mechanics**:

1. **Voting power source**: Determined by `enableUpdateVotingPowerHook` flag:
   - If `true`: Uses `IVotes(ivotesAdapter).getVotes(_account)` — live balance
   - If `false`: Uses `IVotes(ivotesAdapter).getPastVotes(_account, currentEpochStart())` — snapshot at epoch start

2. **Vote allocation**: Votes are distributed across gauges proportionally by weight:
   ```
   votesForGauge = (weight * votingPower) / totalWeight
   ```
   Source: `AddressGaugeVoter.sol:143-178`

3. **Vote persistence**: Votes from previous epochs remain active unless reset.

4. **Re-voting**: Calling `vote()` again first calls `_reset()` to clear existing votes, then casts new votes.

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DELEGATION → VOTING FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LOCK PHASE                                                                 │
│  ──────────                                                                 │
│  Alice: Lock 500 tokens  ──▶ veNFT #1 (VP: 500)                            │
│  Bob:   Lock 1000 tokens ──▶ veNFT #2 (VP: 1000)                           │
│  Carol: Lock 200 tokens  ──▶ veNFT #3 (VP: 200)                            │
│                                                                             │
│  DELEGATION PHASE                                                           │
│  ────────────────                                                           │
│  Alice: delegate(Bob)  ──▶ Alice's VP now counts for Bob                   │
│  Bob:   delegate(Bob)  ──▶ Self-delegation (Bob votes for himself)         │
│  Carol: delegate(Bob)  ──▶ Carol's VP now counts for Bob                   │
│                                                                             │
│  Bob's total voting power = 500 + 1000 + 200 = 1700                        │
│                                                                             │
│  VOTING PHASE (during voting window)                                        │
│  ────────────                                                               │
│  Bob: vote([{gauge: 0x01, weight: 70}, {gauge: 0x02, weight: 30}])         │
│                                                                             │
│  Result:                                                                    │
│  ├── Gauge 0x01: 1700 * 70 / 100 = 1190 votes                              │
│  └── Gauge 0x02: 1700 * 30 / 100 = 510 votes                               │
│                                                                             │
│  ATTRIBUTION (what the indexer computes)                                    │
│  ───────────                                                                │
│  Gauge 0x01 (1190 votes):                                                  │
│  ├── Alice: 500 * 70/100 = 350 (delegated via Bob)                         │
│  ├── Bob:   1000 * 70/100 = 700 (self-delegated)                           │
│  └── Carol: 200 * 70/100 = 140 (delegated via Bob)                         │
│                                                                             │
│  Gauge 0x02 (510 votes):                                                   │
│  ├── Alice: 500 * 30/100 = 150 (delegated via Bob)                         │
│  ├── Bob:   1000 * 30/100 = 300 (self-delegated)                           │
│  └── Carol: 200 * 30/100 = 60 (delegated via Bob)                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Epoch and Timing

### Epoch Structure

The Clock contract (`Clock_v1_2_0.sol`) defines the timing:

```
EPOCH_DURATION      = 2 weeks (1,209,600 seconds)
CHECKPOINT_INTERVAL = 1 week  (604,800 seconds)
VOTE_DURATION       = 1 week  (604,800 seconds)
VOTE_WINDOW_BUFFER  = 1 hour  (3,600 seconds)
```

**Epoch ID calculation**:
```
epochId = timestamp / EPOCH_DURATION
```
Source: `Clock_v1_2_0.sol:73-77`

### Voting Window

Within each epoch:

```
┌──────────────────────── EPOCH (2 weeks) ────────────────────────┐
│                                                                 │
│  ◀── 1 hour ──▶◀─────── VOTING WINDOW ──────▶◀──── 1 week ────▶│
│      buffer          (1 week - 2 hours)         non-voting      │
│                                                                 │
│  ├────────────────────────────────────────────────────────────┤ │
│  0                                                        2 weeks│
│                                                                 │
│  Vote Start = 1 hour after epoch start                          │
│  Vote End   = 1 week - 1 hour after epoch start                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key functions**:
- `resolveVotingActive(timestamp)` — Returns true if within voting window
- `resolveEpochVoteStartTs(timestamp)` — Voting window start timestamp
- `resolveEpochVoteEndTs(timestamp)` — Voting window end timestamp

Source: `Clock_v1_2_0.sol:117-187`

### Critical Timestamps

There are **two distinct timestamps** that serve different purposes:

#### 1. Voting Power Snapshot Timestamp

The timestamp at which delegate voting power is determined for the epoch.

**When `enableUpdateVotingPowerHook = false`** (secure mode):
```
votingPowerSnapshotTs = epochStart
```

**When `enableUpdateVotingPowerHook = true`**:
```
votingPowerSnapshotTs = block.timestamp (at time of vote)
```

**Contract source**: `AddressGaugeVoter.sol:144-146`
```solidity
uint256 votingPower = enableUpdateVotingPowerHook
    ? IVotes(ivotesAdapter).getVotes(_account)
    : IVotes(ivotesAdapter).getPastVotes(_account, currentEpochStart());
```

#### 2. Vote Finalization Timestamp

The timestamp at which no more votes can be cast for the epoch:

```
voteFinalizationTs = epochStart + VOTE_DURATION - VOTE_WINDOW_BUFFER
                   = epochStart + 604800 - 3600
                   = epochStart + 601200 seconds
```

At this point:
1. No more votes can be cast for the epoch
2. All vote events have been emitted
3. Final vote tallies are locked

#### Summary Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           EPOCH TIMELINE                                    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  EPOCH START                                      VOTE WINDOW END          │
│  (VP Snapshot when hook=false)                    (Vote Finalization)      │
│       │                                                  │                 │
│       ▼                                                  ▼                 │
│  ─────●───────────┬─────────────────────────────────────●──────────────── │
│       │           │                                      │                 │
│       │     1 hour buffer                                │                 │
│       │           │                                      │                 │
│       │           ▼                                      │                 │
│       │    ┌──────────────────────────────────────┐     │                 │
│       │    │         VOTING WINDOW                │     │                 │
│       │    │   (can cast votes during this time)  │     │                 │
│       │    └──────────────────────────────────────┘     │                 │
│       │                                                  │                 │
│       ●─────────────────────────────────────────────────●                 │
│    epochStart                                    epochStart + 601200       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**For indexer**:
- When `enableUpdateVotingPowerHook = false`: Query voting power at **epoch start**
- Always collect events up to **vote finalization timestamp**

---

## Vote Decomposition Algorithm

### Overview

Given a delegate's vote on a gauge, decompose it into per-delegator contributions:

```
Input:
- delegate: address
- gauge: address
- epoch: uint256
- totalVotesForGauge: uint256 (from Voted event)

Output:
- Array of { delegator, contribution, percentage }
```

### Algorithm Steps

#### Step 1: Get Delegate's Total Voting Power

Query the EscrowIVotesAdapter at the **voting power snapshot timestamp**:

```solidity
// Determine the correct timestamp based on contract configuration
uint256 vpSnapshotTs;
if (enableUpdateVotingPowerHook) {
    // Live mode: use the delegate's usedVotingPower from their vote event
    vpSnapshotTs = voteTimestamp;  // timestamp when vote was cast
} else {
    // Secure mode: voting power is fixed at epoch start
    vpSnapshotTs = epochStart;
}

uint256 delegateVP = IEscrowIVotesAdapter(adapter).getPastVotes(delegate, vpSnapshotTs);
```

**Important**: When `enableUpdateVotingPowerHook = false`, the voting power for decomposition is the delegate's `usedVotingPower` stored in the `Voted` event, which was determined by `getPastVotes(delegate, epochStart)` at vote time.

#### Step 2: Identify All Delegators

Collect all addresses that have delegated to this delegate at the **voting power snapshot timestamp**:

```
For each DelegateChanged(delegator, fromDelegate, toDelegate) event:
  If toDelegate == delegate AND timestamp <= vpSnapshotTs:
    Update delegator → delegate mapping
  If fromDelegate == delegate AND timestamp <= vpSnapshotTs:
    Remove delegator → delegate mapping

For each TokensDelegated(sender, delegatee, tokenIds) event:
  If delegatee == delegate AND timestamp <= vpSnapshotTs:
    Mark each tokenId as delegated by sender

For each TokensUndelegated(sender, delegatee, tokenIds) event:
  If delegatee == delegate AND timestamp <= vpSnapshotTs:
    Remove tokenIds from sender's delegated set
```

**Note on event ordering**: The `DelegateChanged` event updates the address-level mapping (who someone is delegating to), while `TokensDelegated`/`TokensUndelegated` events update the token-level state. Both must be processed to correctly reconstruct delegation state.

#### Step 3: Calculate Each Delegator's Voting Power

For each delegator at the snapshot:

```solidity
function getDelegatorVotingPower(delegator, delegate, snapshotTs) {
    uint256 totalVP = 0;

    // Get all veNFTs owned by delegator
    uint256[] memory ownedTokens = VotingEscrow.ownedTokens(delegator);

    for each tokenId in ownedTokens:
        // Check if this token was delegated to this delegate at snapshot
        if (wasDelegatedTo(tokenId, delegate, snapshotTs)):
            totalVP += VotingEscrow.votingPowerAt(tokenId, snapshotTs);

    return totalVP;
}
```

#### Step 4: Compute Proportional Contribution

For each delegator:

```
contribution = (delegatorVP / delegateTotalVP) * votesForGauge
```

**Example**:
```
Delegate Bob voted 1000 for Gauge A

Delegators to Bob:
- Alice: 300 VP
- Bob (self): 500 VP
- Carol: 200 VP
- Total: 1000 VP

Contributions:
- Alice: (300/1000) * 1000 = 300
- Bob:   (500/1000) * 1000 = 500
- Carol: (200/1000) * 1000 = 200
```

### Pseudocode

```python
def decompose_vote(delegate, gauge, epoch, votes_for_gauge, enable_hook):
    """
    Decompose a delegate's vote into per-delegator contributions.

    Args:
        delegate: Address of the delegate who voted
        gauge: Address of the gauge voted for
        epoch: Epoch ID
        votes_for_gauge: Total votes cast for this gauge (from Voted event)
        enable_hook: Value of enableUpdateVotingPowerHook on-chain
    """

    # Step 1: Determine the correct timestamp for voting power snapshot
    if enable_hook:
        # When hook is enabled, votes use live balance at vote time
        # The delegate's usedVotingPower in the Voted event is authoritative
        vp_snapshot_ts = get_vote_timestamp(delegate, epoch)
    else:
        # When hook is disabled, voting power is fixed at epoch start
        vp_snapshot_ts = get_epoch_start(epoch)

    # Get delegate's total VP at the snapshot
    delegate_total_vp = get_past_votes(delegate, vp_snapshot_ts)

    if delegate_total_vp == 0:
        return []  # No voting power means no contributions

    # Step 2: Find all delegators at the snapshot timestamp
    delegators = get_delegators_at_timestamp(delegate, vp_snapshot_ts)

    # Step 3 & 4: Calculate each delegator's contribution
    contributions = []
    for delegator in delegators:
        delegator_vp = get_delegator_voting_power(delegator, delegate, vp_snapshot_ts)

        if delegator_vp > 0:
            contribution = (delegator_vp * votes_for_gauge) // delegate_total_vp
            contributions.append({
                'delegator': delegator,
                'voting_power': delegator_vp,
                'contribution': contribution,
                'percentage': (delegator_vp * 100) // delegate_total_vp,
                'delegate': delegate,
                'gauge': gauge,
                'epoch': epoch
            })

    return contributions
```

---

## Edge Cases

### 1. Self-Delegation

**Scenario**: Owner delegates to themselves.

```
Alice owns veNFT #1 (VP: 1000)
Alice calls: delegate(Alice)  // Self-delegation
Alice calls: vote([{gauge: 0x01, weight: 100}])
```

**Expected behavior**:
- Alice's voting power counts as her own
- Attribution: Alice: 1000 (100%)

**Contract behavior**: `EscrowIVotesAdapter.delegate(address)` accepts the sender's own address as delegatee. The `tokenIsDelegated` bitmap is set, and voting power is checkpointed to the sender.

Source: `EscrowIVotesAdapter.sol:170-191`

---

### 2. Undelegation

**Scenario**: Delegator removes their delegation before vote snapshot.

```
Timeline:
- T0: Alice delegates to Bob (VP: 500)
- T1: Bob votes for Gauge A (total VP: 1500)
- T2: Alice undelegates
- T3: Snapshot timestamp

At T1: Bob's vote = 1500
At T3: Bob's VP = 1000 (Alice's 500 removed)
```

**Expected behavior**:
- Alice's power should NOT be counted in the final attribution
- Bob's vote was cast with 1500, but at snapshot Bob only has 1000
- Attribution should be based on snapshot state

**Contract behavior**: When `enableUpdateVotingPowerHook` is false (the default for new deployments), voting power is determined by `getPastVotes` at epoch start, not at vote time. This means:
1. If Alice undelegates after epoch start but before vote, her power still counts for Bob's vote
2. The snapshot for voting power is **epoch start**, not vote end

**Critical note**: The contract uses `getPastVotes(_account, currentEpochStart())` to prevent double-voting attacks. See `AddressGaugeVoter.sol:119-146`.

**For indexer**: Track delegation state at **epoch start** when `enableUpdateVotingPowerHook` is false.

---

### 3. Re-delegation

**Scenario**: Delegator changes their delegate mid-epoch.

```
Timeline:
- T0: Alice delegates to Bob
- T1: Bob votes for Gauge A (with Alice's VP)
- T2: Alice re-delegates to Carol
- T3: Carol votes for Gauge B (with Alice's VP?)
- T4: Snapshot
```

**Expected behavior with `enableUpdateVotingPowerHook = false`**:
- Alice's VP is locked to whoever she was delegating to at epoch start
- If Alice was delegating to Bob at epoch start:
  - Bob's vote includes Alice's VP
  - Carol's vote does NOT include Alice's VP (Alice wasn't delegating to Carol at epoch start)

**Contract behavior**: The `delegate(address)` function undelegates from the old delegatee and delegates to the new one. But since voting power is snapshot at epoch start, the change only affects future epochs.

Source: `EscrowIVotesAdapter.sol:170-191`

---

### 4. Late Delegation

**Scenario**: Someone delegates AFTER the delegate has already voted.

```
Timeline:
- T1: Bob votes for Gauge A (Bob's VP: 1000)
- T2: Alice delegates to Bob (Alice's VP: 500)
- T3: Snapshot
```

**Key question**: Does Alice's late delegation retroactively increase Bob's vote?

**Contract behavior**: **NO**, late delegation does NOT retroactively increment votes.

The vote was already cast with Bob's voting power at T1. When Alice delegates at T2:
1. The delegation is recorded in `EscrowIVotesAdapter`
2. `updateVotingPower` is called on the voter contract
3. BUT `_updateVotingPower` only adjusts if voting power *decreased*, not increased

From `AddressGaugeVoter.sol:279-332`:
```solidity
// If a user's voting power increases (e.g., 100 → 150),
// we *don't* auto-recast—doing so would inflate gauge power post-window.
// So: decrease → auto-adjust gauges; increase → ignored
if (voteData.usedVotingPower < votingPower) return;
```

**Expected behavior**:
- Alice's late delegation is NOT counted in Bob's existing vote
- Bob would need to call `vote()` again to include Alice's power
- If Bob doesn't re-vote, Alice's contribution = 0 for this epoch

**For indexer**: Late delegators whose power wasn't included in the delegate's vote must be recorded as "not having voted" for that epoch.

---

### 5. Reset Without Re-vote

**Scenario**: Delegate resets their votes but doesn't vote again.

```
Timeline:
- T1: Bob votes for Gauge A
- T2: Bob calls reset()
- T3: Snapshot
```

**Expected behavior**:
- Bob is NOT a voter for this epoch
- All delegators to Bob are NOT voters for this epoch
- Their contributions = 0

**Contract behavior**: `reset()` sets `lastVoted = 0` and `usedVotingPower = 0`, and emits `Reset` events for each gauge.

Source: `AddressGaugeVoter.sol:240-277`

**For indexer**: Check that the delegate's latest event is NOT a `Reset`. If latest is `Reset`, exclude from voters.

---

### 6. Reset Then Re-vote

**Scenario**: Delegate resets and then votes again.

```
Timeline:
- T1: Bob votes for Gauge A (1000 VP)
- T2: Bob calls reset()
- T3: Bob's VP increases to 1200
- T4: Bob votes for Gauge B (1200 VP)
- T5: Snapshot
```

**Expected behavior**:
- Bob's final vote is for Gauge B with 1200 VP
- Gauge A has 0 votes from Bob
- Attribution is based on the final state

**Contract behavior**: The `vote()` function automatically calls `_reset()` if the voter has existing votes, so even without explicit reset, re-voting clears previous votes.

Source: `AddressGaugeVoter.sol:143-178`

---

### 7. Multiple Votes in One Epoch

**Scenario**: Delegate votes multiple times.

```
Timeline:
- T1: Bob votes for [Gauge A: 60%, Gauge B: 40%] with 1000 VP
- T2: Bob votes for [Gauge A: 30%, Gauge C: 70%] with 1000 VP
- T3: Snapshot
```

**Expected behavior**:
- Only the LAST vote counts
- Gauge A: 300 VP (30%)
- Gauge B: 0 VP (reset by re-vote)
- Gauge C: 700 VP (70%)

**Contract behavior**: As noted above, `vote()` calls `_reset()` first if already voting, then casts new votes.

---

### 8. Vote Persistence Across Epochs

**Scenario**: Do votes from previous epochs carry forward?

```
Epoch N:
- Bob votes for Gauge A with 1000 VP

Epoch N+1:
- Bob does NOT vote
- Bob's VP has grown to 1100
```

**The answer depends on `enableUpdateVotingPowerHook`**:

#### When `enableUpdateVotingPowerHook = false` (Secure Mode)

**Votes do NOT persist across epochs.**

```
Epoch N:
- Bob votes → stored in epochVoteData[N][Bob]
- Bob's contribution for epoch N = 1000

Epoch N+1:
- epochVoteData[N+1][Bob] is empty
- Bob has NOT voted for epoch N+1
- Bob's contribution for epoch N+1 = 0
```

**Contract behavior**: Votes are stored per-epoch via `getWriteEpochId()`:
```solidity
function getWriteEpochId() public view returns (uint256) {
    return enableUpdateVotingPowerHook ? 0 : epochId();  // Returns current epoch
}
```

**For indexer**: When processing epoch N+1, do NOT assume previous votes carry over. Check `epochVoteData[N+1]` independently.

#### When `enableUpdateVotingPowerHook = true` (Legacy Mode)

**Votes DO persist across epochs.**

```
Epoch N:
- Bob votes → stored in epochVoteData[0][Bob] (global)
- Bob's contribution for epoch N = 1000

Epoch N+1:
- epochVoteData[0][Bob] still has Bob's vote
- Bob's contribution for epoch N+1 = 1000 (same as before)
```

**Contract behavior**: Votes use epoch 0 as global storage:
```solidity
function getWriteEpochId() public view returns (uint256) {
    return enableUpdateVotingPowerHook ? 0 : epochId();  // Returns 0
}
```

**For indexer**: When processing epoch N+1, check if the delegate has voted in epoch 0 storage. Their `usedVotingPower` remains fixed until they re-vote or reset.

---

### 9. Delegation Persistence Across Epochs

**Scenario**: Delegation persists unless explicitly changed.

```
Epoch N:
- Alice delegates to Bob

Epoch N+1, N+2, N+3...:
- Alice's delegation to Bob remains active
- No new delegation transaction needed
```

**Expected behavior**:
- Alice's voting power continues to count for Bob in subsequent epochs
- Only a new `delegate()` call or `undelegate()` changes this

---

### 10. Partial Delegation

**Scenario**: Owner delegates only some tokens.

```
Alice owns veNFT #1 (VP: 500) and veNFT #2 (VP: 300)
Alice calls: delegate([#1])  // Only delegate token #1
```

**Expected behavior**:
- Token #1's VP (500) counts for the delegate
- Token #2 is NOT delegated — its VP doesn't count for anyone
- If Alice wants token #2 to count, she must either:
  - Delegate it to someone, or
  - Vote directly (not possible in AddressGaugeVoter; only delegates can vote)

**Contract behavior**: The `delegate(uint256[])` function only delegates specified token IDs. Token #2's `tokenIsDelegated` bit remains false.

Source: `EscrowIVotesAdapter.sol:150-165`

**Important**: In the AddressGaugeVoter system, voting power only counts if the tokens are delegated (including self-delegation). Undelegated tokens have zero effective voting power for gauge voting.

---

### 11. NFT Transfer

**Scenario**: A veNFT is transferred between accounts.

```
Timeline:
- T0: Alice owns veNFT #1 (VP: 500), delegated to Bob
- T1: Alice transfers veNFT #1 to Carol
- T2: Snapshot
```

**Expected behavior**:
- The token is automatically undelegated from Bob
- If Carol has a delegatee set, the token is auto-delegated to Carol's delegatee
- If Carol has `autoDelegationDisabled = true` or no delegatee, the token becomes undelegated

**Contract behavior**: The VotingEscrow contract calls `moveDelegateVotes()` on NFT transfer:

```solidity
// VotingEscrowIncreasing_v1_2_0.sol:676-680
function moveDelegateVotes(address _from, address _to, uint256 _tokenId) public whenNotPaused {
    if (msg.sender != lockNFT) revert OnlyLockNFT();
    LockedBalance memory locked_ = _locked[_tokenId];
    _moveDelegateVotes(_from, _to, _tokenId, locked_);
}
```

This triggers `EscrowIVotesAdapter.moveDelegateVotes()` which:
1. Undelegates the token from the old owner's delegatee (emits `TokensUndelegated`)
2. If the new owner has a delegatee and `autoDelegationDisabled = false`, delegates to the new owner's delegatee (emits `TokensDelegated`)

**Source**: `DelegationHelper.sol:127-168`

**For indexer**:
- Listen for `TokensUndelegated` and `TokensDelegated` events triggered by transfers
- These events will have the same `tokenId` but different `sender` (old owner) and `delegatee` values
- Update delegation state accordingly

---

## Processing Stages

The indexer processes data in discrete stages with clear inputs and outputs:

### Stage 1: Event Collection

**Input**: Block range for the epoch

**Process**:
1. Query `Voted` events from AddressGaugeVoter
2. Query `Reset` events from AddressGaugeVoter
3. Query `TokensDelegated` events from EscrowIVotesAdapter
4. Query `TokensUndelegated` events from EscrowIVotesAdapter
5. Query `DelegateChanged` events from EscrowIVotesAdapter

**Output**: Raw event data indexed by block and log index

```typescript
interface EventData {
  voted: VotedEvent[];
  reset: ResetEvent[];
  tokensDelegated: TokensDelegatedEvent[];
  tokensUndelegated: TokensUndelegatedEvent[];
  delegateChanged: DelegateChangedEvent[];
}
```

### Stage 2: Voter Identification

**Input**: Event data from Stage 1

**Process**:
1. For each address that has `Voted` events:
   - Check if their latest event is `Voted` (not `Reset`)
   - If yes, add to active voters set
2. Record the final vote state for each active voter

**Output**: Map of active voters to their final vote state

```typescript
interface VoterState {
  voter: address;
  gaugesVotedFor: { gauge: address; votes: bigint }[];
  totalVotingPower: bigint;
  lastVotedTimestamp: number;
}

type ActiveVoters = Map<address, VoterState>;
```

**Invariant check**: Sum of all `votes` in `gaugesVotedFor` must equal `totalVotingPower`.

### Stage 3: Delegation State Reconstruction

**Input**:
- Event data from Stage 1
- Snapshot timestamp for the epoch

**Process**:
1. Replay delegation events chronologically up to snapshot
2. Build final delegation state: delegator → delegate mapping
3. Build token delegation state: tokenId → { owner, delegate, delegated }

**Output**: Delegation state at snapshot

```typescript
interface DelegationState {
  delegatorToDelegate: Map<address, address>;
  tokenDelegation: Map<tokenId, {
    owner: address;
    delegate: address;
    isDelegated: boolean;
  }>;
  delegateToDelegators: Map<address, address[]>;
}
```

**Invariant check**: For each delegate, sum of delegators' voting power must equal delegate's `getPastVotes()`.

### Stage 4: Voting Power Calculation

**Input**:
- Delegation state from Stage 3
- Snapshot timestamp

**Process**:
1. For each delegator, query voting power of their delegated tokens at snapshot
2. Aggregate by delegate

**Output**: Voting power breakdown per delegate

```typescript
interface DelegateVotingPower {
  delegate: address;
  totalVotingPower: bigint;
  breakdown: {
    delegator: address;
    tokenIds: number[];
    votingPower: bigint;
  }[];
}
```

### Stage 5: Vote Decomposition

**Input**:
- Active voters from Stage 2
- Delegation state from Stage 3
- Voting power from Stage 4

**Process**:
1. For each active voter (delegate):
   - Get their vote allocation across gauges
   - Get their delegators and their voting power
   - Calculate proportional contribution per delegator per gauge

**Output**: Per-delegator contributions

```typescript
interface DelegatorContribution {
  epoch: number;
  delegator: address;
  delegate: address;
  gauge: address;
  votingPower: bigint;
  contribution: bigint;
  percentage: number;
}
```

### Stage 6: Aggregation

**Input**: Contributions from Stage 5

**Process**:
1. Aggregate by gauge: total votes per gauge
2. Aggregate by delegate: total votes per delegate
3. Aggregate by delegator: total contribution per delegator

**Output**: Aggregated metrics

```typescript
interface EpochSummary {
  epoch: number;
  snapshotTimestamp: number;
  totalVotes: bigint;
  gauges: {
    gauge: address;
    totalVotes: bigint;
    voterCount: number;
  }[];
  topDelegates: {
    delegate: address;
    totalVotingPower: bigint;
    gaugesVotedFor: number;
  }[];
  topContributors: {
    delegator: address;
    totalContribution: bigint;
    delegatedTo: address;
  }[];
}
```

---

## Invariants

The following invariants must hold and should be verified at each stage:

### Invariant 1: Total Vote Power Consistency

**Statement**: The sum of all `Voted` event power (after removing users whose latest event is `Reset`) must equal the total votes recorded in the voter contract.

**Verification**:
```solidity
// On-chain check at snapshot timestamp
uint256 contractTotal = AddressGaugeVoter.epochTotalVotingPowerCast(epoch);

// Indexed sum
uint256 indexedTotal = 0;
for each voter in activeVoters:
    for each gaugeVote in voter.gaugesVotedFor:
        indexedTotal += gaugeVote.votes;

assert(contractTotal == indexedTotal);
```

### Invariant 2: Per-Gauge Vote Consistency

**Statement**: For each gauge, the sum of votes from all voters must equal the gauge's total in the contract.

**Verification**:
```solidity
for each gauge in allGauges:
    uint256 contractGaugeTotal = AddressGaugeVoter.epochGaugeVotes(epoch, gauge);

    uint256 indexedGaugeTotal = 0;
    for each voter in activeVoters:
        indexedGaugeTotal += voter.votesForGauge(gauge);

    assert(contractGaugeTotal == indexedGaugeTotal);
```

### Invariant 3: Delegation Power Consistency

**Statement**: The sum of delegated voting power at snapshot must equal the delegate's voting power from the adapter.

**Verification**:
```solidity
for each delegate in allDelegates:
    uint256 adapterPower = EscrowIVotesAdapter.getPastVotes(delegate, snapshotTs);

    uint256 calculatedPower = 0;
    for each delegator in delegatorsTo(delegate):
        for each tokenId in delegator.delegatedTokens:
            calculatedPower += VotingEscrow.votingPowerAt(tokenId, snapshotTs);

    assert(adapterPower == calculatedPower);
```

### Invariant 4: Attribution Sum Consistency

**Statement**: For each delegate's vote on a gauge, the sum of all delegator contributions must equal the delegate's total vote.

**Verification**:
```solidity
for each (delegate, gauge) in allVotes:
    uint256 delegateVote = getVoteFor(delegate, gauge);

    uint256 contributionSum = 0;
    for each contribution in getContributions(delegate, gauge):
        contributionSum += contribution.amount;

    assert(delegateVote == contributionSum);
```

### Invariant 5: No Double Counting

**Statement**: Each veNFT's voting power must be attributed to exactly one delegator-delegate pair per epoch.

**Verification**:
```solidity
Set<(tokenId, epoch)> seen = {};
for each contribution in allContributions:
    for each tokenId in contribution.tokenIds:
        key = (tokenId, contribution.epoch);
        assert(!seen.contains(key));
        seen.add(key);
```

### Invariant 6: Non-voter Exclusion

**Statement**: Users whose latest action is `Reset` must have zero contribution.

**Verification**:
```solidity
for each voter in allAddressesWithVoteActivity:
    if latestEvent(voter) == Reset:
        assert(getTotalContribution(voter) == 0);
```

---

## Data Model

### Database Schema

```sql
-- Epochs table
CREATE TABLE epochs (
    epoch_id INTEGER PRIMARY KEY,
    start_timestamp BIGINT NOT NULL,
    vote_start_timestamp BIGINT NOT NULL,
    vote_end_timestamp BIGINT NOT NULL,
    snapshot_timestamp BIGINT NOT NULL,
    total_votes NUMERIC(78, 0) NOT NULL,
    is_finalized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Gauges table
CREATE TABLE gauges (
    gauge_address VARCHAR(42) PRIMARY KEY,
    is_active BOOLEAN NOT NULL,
    created_at BIGINT NOT NULL,
    metadata_uri TEXT
);

-- Votes table (per delegate per gauge per epoch)
CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    epoch_id INTEGER REFERENCES epochs(epoch_id),
    delegate_address VARCHAR(42) NOT NULL,
    gauge_address VARCHAR(42) REFERENCES gauges(gauge_address),
    voting_power_used NUMERIC(78, 0) NOT NULL,
    votes_cast NUMERIC(78, 0) NOT NULL,
    weight_percentage NUMERIC(5, 2) NOT NULL,
    voted_at_timestamp BIGINT NOT NULL,
    voted_at_block BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    UNIQUE(epoch_id, delegate_address, gauge_address)
);

-- Delegations table (state at each epoch snapshot)
CREATE TABLE delegations (
    id SERIAL PRIMARY KEY,
    epoch_id INTEGER REFERENCES epochs(epoch_id),
    delegator_address VARCHAR(42) NOT NULL,
    delegate_address VARCHAR(42) NOT NULL,
    token_ids INTEGER[] NOT NULL,
    total_voting_power NUMERIC(78, 0) NOT NULL,
    snapshot_timestamp BIGINT NOT NULL,
    UNIQUE(epoch_id, delegator_address)
);

-- Contributions table (the main output)
CREATE TABLE contributions (
    id SERIAL PRIMARY KEY,
    epoch_id INTEGER REFERENCES epochs(epoch_id),
    delegator_address VARCHAR(42) NOT NULL,
    delegate_address VARCHAR(42) NOT NULL,
    gauge_address VARCHAR(42) REFERENCES gauges(gauge_address),
    delegator_voting_power NUMERIC(78, 0) NOT NULL,
    contribution_amount NUMERIC(78, 0) NOT NULL,
    contribution_percentage NUMERIC(10, 6) NOT NULL,
    UNIQUE(epoch_id, delegator_address, gauge_address)
);

-- Aggregate views
CREATE TABLE epoch_gauge_totals (
    epoch_id INTEGER REFERENCES epochs(epoch_id),
    gauge_address VARCHAR(42) REFERENCES gauges(gauge_address),
    total_votes NUMERIC(78, 0) NOT NULL,
    unique_voters INTEGER NOT NULL,
    unique_contributors INTEGER NOT NULL,
    PRIMARY KEY(epoch_id, gauge_address)
);

CREATE TABLE delegate_rankings (
    epoch_id INTEGER REFERENCES epochs(epoch_id),
    delegate_address VARCHAR(42) NOT NULL,
    total_voting_power NUMERIC(78, 0) NOT NULL,
    delegator_count INTEGER NOT NULL,
    gauges_voted_for INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY(epoch_id, delegate_address)
);

-- Indexes
CREATE INDEX idx_contributions_epoch ON contributions(epoch_id);
CREATE INDEX idx_contributions_delegator ON contributions(delegator_address);
CREATE INDEX idx_contributions_delegate ON contributions(delegate_address);
CREATE INDEX idx_contributions_gauge ON contributions(gauge_address);
CREATE INDEX idx_votes_epoch ON votes(epoch_id);
CREATE INDEX idx_delegations_epoch ON delegations(epoch_id);
```

### TypeScript Types

```typescript
// Core types
type Address = `0x${string}`;
type TokenId = number;
type EpochId = number;

interface Epoch {
  epochId: EpochId;
  startTimestamp: number;
  voteStartTimestamp: number;
  voteEndTimestamp: number;
  snapshotTimestamp: number;
  totalVotes: bigint;
  isFinalized: boolean;
}

interface Gauge {
  address: Address;
  isActive: boolean;
  createdAt: number;
  metadataUri?: string;
}

interface Vote {
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

interface Delegation {
  epochId: EpochId;
  delegatorAddress: Address;
  delegateAddress: Address;
  tokenIds: TokenId[];
  totalVotingPower: bigint;
  snapshotTimestamp: number;
}

interface Contribution {
  epochId: EpochId;
  delegatorAddress: Address;
  delegateAddress: Address;
  gaugeAddress: Address;
  delegatorVotingPower: bigint;
  contributionAmount: bigint;
  contributionPercentage: number;
}

// Aggregates
interface EpochGaugeTotal {
  epochId: EpochId;
  gaugeAddress: Address;
  totalVotes: bigint;
  uniqueVoters: number;
  uniqueContributors: number;
}

interface DelegateRanking {
  epochId: EpochId;
  delegateAddress: Address;
  totalVotingPower: bigint;
  delegatorCount: number;
  gaugesVotedFor: number;
  rank: number;
}
```

---

## API Shape

### Base URL

```
https://api.ve-governance-indexer.example.com/v1
```

### Endpoints

#### GET /epochs

List all indexed epochs.

**Query Parameters**:
- `limit` (optional, default: 20): Number of epochs to return
- `offset` (optional, default: 0): Pagination offset
- `finalized` (optional): Filter by finalization status

**Response**:
```json
{
  "epochs": [
    {
      "epochId": 1234,
      "startTimestamp": 1700000000,
      "voteStartTimestamp": 1700003600,
      "voteEndTimestamp": 1700601200,
      "snapshotTimestamp": 1700601200,
      "totalVotes": "1500000000000000000000000",
      "isFinalized": true
    }
  ],
  "pagination": {
    "total": 52,
    "limit": 20,
    "offset": 0
  }
}
```

#### GET /epochs/:epochId

Get details for a specific epoch.

**Response**:
```json
{
  "epoch": {
    "epochId": 1234,
    "startTimestamp": 1700000000,
    "voteStartTimestamp": 1700003600,
    "voteEndTimestamp": 1700601200,
    "snapshotTimestamp": 1700601200,
    "totalVotes": "1500000000000000000000000",
    "isFinalized": true
  },
  "gauges": [
    {
      "gaugeAddress": "0x0000000000000000000000000000000000000001",
      "totalVotes": "800000000000000000000000",
      "uniqueVoters": 15,
      "uniqueContributors": 42,
      "percentage": 53.33
    }
  ],
  "summary": {
    "totalDelegates": 15,
    "totalContributors": 42,
    "totalGaugesVotedFor": 3
  }
}
```

#### GET /epochs/:epochId/contributions

Get all contributions for an epoch.

**Query Parameters**:
- `delegator` (optional): Filter by delegator address
- `delegate` (optional): Filter by delegate address
- `gauge` (optional): Filter by gauge address
- `limit` (optional, default: 100)
- `offset` (optional, default: 0)

**Response**:
```json
{
  "contributions": [
    {
      "epochId": 1234,
      "delegatorAddress": "0xAlice...",
      "delegateAddress": "0xBob...",
      "gaugeAddress": "0x0000...0001",
      "delegatorVotingPower": "500000000000000000000",
      "contributionAmount": "350000000000000000000",
      "contributionPercentage": 23.33
    }
  ],
  "pagination": {
    "total": 126,
    "limit": 100,
    "offset": 0
  }
}
```

#### GET /epochs/:epochId/delegates

Get all delegates who voted in an epoch.

**Query Parameters**:
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)
- `orderBy` (optional): `votingPower` | `delegatorCount` | `gaugesVotedFor`

**Response**:
```json
{
  "delegates": [
    {
      "delegateAddress": "0xBob...",
      "totalVotingPower": "1500000000000000000000",
      "delegatorCount": 5,
      "gaugesVotedFor": 2,
      "rank": 1,
      "votes": [
        {
          "gaugeAddress": "0x0000...0001",
          "votesCast": "1050000000000000000000",
          "weightPercentage": 70
        }
      ]
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

#### GET /epochs/:epochId/delegators/:address

Get a specific delegator's contribution for an epoch.

**Response**:
```json
{
  "delegator": {
    "address": "0xAlice...",
    "delegateAddress": "0xBob...",
    "tokenIds": [42, 57],
    "totalVotingPower": "500000000000000000000",
    "contributions": [
      {
        "gaugeAddress": "0x0000...0001",
        "contributionAmount": "350000000000000000000",
        "contributionPercentage": 23.33
      },
      {
        "gaugeAddress": "0x0000...0002",
        "contributionAmount": "150000000000000000000",
        "contributionPercentage": 10.00
      }
    ],
    "totalContribution": "500000000000000000000"
  }
}
```

#### GET /gauges

List all gauges.

**Response**:
```json
{
  "gauges": [
    {
      "address": "0x0000000000000000000000000000000000000001",
      "isActive": true,
      "createdAt": 1699000000,
      "metadataUri": "ipfs://..."
    }
  ]
}
```

#### GET /gauges/:address/epochs/:epochId

Get gauge voting details for a specific epoch.

**Response**:
```json
{
  "gauge": {
    "address": "0x0000000000000000000000000000000000000001",
    "epochId": 1234,
    "totalVotes": "800000000000000000000000",
    "percentageOfTotal": 53.33,
    "voters": [
      {
        "delegateAddress": "0xBob...",
        "votesCast": "500000000000000000000000",
        "percentageOfGauge": 62.5
      }
    ],
    "topContributors": [
      {
        "delegatorAddress": "0xAlice...",
        "contribution": "300000000000000000000000",
        "percentage": 37.5
      }
    ]
  }
}
```

#### GET /delegates/:address

Get historical data for a delegate.

**Query Parameters**:
- `fromEpoch` (optional)
- `toEpoch` (optional)
- `limit` (optional, default: 10)

**Response**:
```json
{
  "delegate": {
    "address": "0xBob...",
    "currentDelegatorCount": 5,
    "currentVotingPower": "1500000000000000000000",
    "history": [
      {
        "epochId": 1234,
        "votingPower": "1500000000000000000000",
        "delegatorCount": 5,
        "gaugesVotedFor": 2
      }
    ]
  }
}
```

#### GET /delegators/:address

Get historical data for a delegator.

**Query Parameters**:
- `fromEpoch` (optional)
- `toEpoch` (optional)

**Response**:
```json
{
  "delegator": {
    "address": "0xAlice...",
    "currentDelegate": "0xBob...",
    "tokenIds": [42, 57],
    "currentVotingPower": "500000000000000000000",
    "history": [
      {
        "epochId": 1234,
        "delegateAddress": "0xBob...",
        "votingPower": "500000000000000000000",
        "totalContribution": "500000000000000000000"
      }
    ]
  }
}
```

### Error Responses

```json
{
  "error": {
    "code": "EPOCH_NOT_FOUND",
    "message": "Epoch 9999 has not been indexed yet",
    "details": {
      "latestIndexedEpoch": 1234
    }
  }
}
```

Error codes:
- `EPOCH_NOT_FOUND`: Requested epoch doesn't exist or isn't indexed
- `INVALID_ADDRESS`: Provided address is not a valid Ethereum address
- `EPOCH_NOT_FINALIZED`: Requested epoch is still in progress
- `RATE_LIMITED`: Too many requests
- `INTERNAL_ERROR`: Server-side error

---

## Contract Reference

### Key Contract Functions

#### Clock_v1_2_0

| Function | Returns | Description |
|----------|---------|-------------|
| `currentEpoch()` | `uint256` | Current epoch ID |
| `resolveEpoch(uint256 timestamp)` | `uint256` | Epoch ID for a given timestamp |
| `votingActive()` | `bool` | Whether voting is currently active |
| `epochVoteEndTs()` | `uint256` | End timestamp of current voting window |

#### AddressGaugeVoter

| Function | Returns | Description |
|----------|---------|-------------|
| `epochTotalVotingPowerCast(uint256 epoch)` | `uint256` | Total votes cast in an epoch |
| `epochGaugeVotes(uint256 epoch, address gauge)` | `uint256` | Votes for a gauge in an epoch |
| `isVoting(address account)` | `bool` | Whether an address has active votes |
| `usedVotingPower(address account)` | `uint256` | Voting power used by an address |
| `gaugesVotedFor(address account)` | `address[]` | Gauges an address voted for |

#### EscrowIVotesAdapter

| Function | Returns | Description |
|----------|---------|-------------|
| `getVotes(address account)` | `uint256` | Current voting power of a delegate |
| `getPastVotes(address account, uint256 timestamp)` | `uint256` | Historical voting power |
| `delegates(address account)` | `address` | Current delegatee for an account |
| `tokenIsDelegated(uint256 tokenId)` | `bool` | Whether a token is delegated |

#### VotingEscrow

| Function | Returns | Description |
|----------|---------|-------------|
| `ownedTokens(address owner)` | `uint256[]` | All veNFT IDs owned by an address |
| `votingPowerAt(uint256 tokenId, uint256 timestamp)` | `uint256` | Voting power of a veNFT at a time |
| `locked(uint256 tokenId)` | `LockedBalance` | Lock details (amount, start) |

### Key Events

#### AddressGaugeVoter Events

```solidity
event Voted(
    address indexed voter,
    address indexed gauge,
    uint256 indexed epoch,
    uint256 votingPowerCastForGauge,
    uint256 totalVotingPowerInGauge,
    uint256 totalVotingPowerInContract,
    uint256 timestamp
);

event Reset(
    address indexed voter,
    address indexed gauge,
    uint256 indexed epoch,
    uint256 votingPowerRemovedFromGauge,
    uint256 totalVotingPowerInGauge,
    uint256 totalVotingPowerInContract,
    uint256 timestamp
);
```

#### EscrowIVotesAdapter Events

```solidity
event DelegateChanged(
    address indexed delegator,
    address indexed fromDelegate,
    address indexed toDelegate
);

event TokensDelegated(
    address indexed sender,
    address indexed delegatee,
    uint256[] tokenIds
);

event TokensUndelegated(
    address indexed sender,
    address indexed delegatee,
    uint256[] tokenIds
);
```

---

## Appendix: Example Calculations

### Example 1: Simple Delegation

**Setup**:
- Alice locks 1000 tokens → veNFT #1
- Bob locks 2000 tokens → veNFT #2
- Both delegate to Bob (Alice delegates, Bob self-delegates)

**At epoch N, snapshot time**:
- veNFT #1 VP: 1000 (just created)
- veNFT #2 VP: 2000 (just created)
- Bob's total delegate VP: 3000

**Bob votes**:
- Gauge A: 60% weight (1800 votes)
- Gauge B: 40% weight (1200 votes)

**Attribution**:

| Delegator | VP | Gauge A Contribution | Gauge B Contribution |
|-----------|-----|---------------------|---------------------|
| Alice | 1000 | 1000 * 60% = 600 | 1000 * 40% = 400 |
| Bob | 2000 | 2000 * 60% = 1200 | 2000 * 40% = 800 |
| **Total** | 3000 | 1800 | 1200 |

### Example 2: Late Delegation

**Timeline**:
- T0 (epoch start): Bob has 2000 VP (self-delegated)
- T1: Bob votes for Gauge A (2000 VP)
- T2: Alice (1000 VP) delegates to Bob
- T3 (snapshot): Bob's getPastVotes = 2000 (Alice wasn't delegated at epoch start)

**Attribution**:
- Bob: 2000 (100%)
- Alice: 0 (delegation was too late)

### Example 3: Undelegation After Vote

**Timeline**:
- T0 (epoch start): Alice (1000 VP) delegated to Bob
- T1: Bob votes for Gauge A with 3000 VP (his 2000 + Alice's 1000)
- T2: Alice undelegates
- T3 (snapshot): Bob's getPastVotes at T0 = 3000

**Attribution** (when `enableUpdateVotingPowerHook = false`):
- Alice: 1000 * (1000/3000) * 3000 = 1000 ✓
- Bob: 2000 * (2000/3000) * 3000 = 2000 ✓

The snapshot for voting power determination is epoch START, not snapshot end. Undelegating mid-epoch doesn't remove the vote.

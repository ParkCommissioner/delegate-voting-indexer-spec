// Supabase client for database operations

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type {
  Address,
  EpochId,
  Epoch,
  Vote,
  Delegation,
  Contribution,
  EpochGaugeTotal,
  DelegateRanking,
} from '../types.js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('Supabase URL and key must be configured');
    }
    supabaseInstance = createClient(config.supabaseUrl, config.supabaseKey);
  }
  return supabaseInstance;
}

// Check if an epoch is already cached
export async function isEpochCached(epochId: EpochId): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('epochs')
    .select('epoch_id')
    .eq('epoch_id', epochId)
    .eq('is_finalized', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking epoch cache:', error);
  }

  return data !== null;
}

// Save epoch data to database
export async function saveEpochData(
  epoch: Epoch,
  votes: Vote[],
  delegations: Delegation[],
  contributions: Contribution[],
  gaugeTotals: EpochGaugeTotal[],
  delegateRankings: DelegateRanking[]
): Promise<void> {
  const supabase = getSupabase();

  // Insert epoch
  const { error: epochError } = await supabase
    .from('epochs')
    .upsert({
      epoch_id: epoch.epochId,
      start_timestamp: epoch.startTimestamp,
      vote_start_timestamp: epoch.voteStartTimestamp,
      vote_end_timestamp: epoch.voteEndTimestamp,
      snapshot_timestamp: epoch.snapshotTimestamp,
      total_votes: epoch.totalVotes.toString(),
      is_finalized: epoch.isFinalized,
    });

  if (epochError) throw new Error(`Failed to save epoch: ${epochError.message}`);

  // Insert votes
  if (votes.length > 0) {
    const voteRecords = votes.map(v => ({
      epoch_id: v.epochId,
      delegate_address: v.delegateAddress,
      gauge_address: v.gaugeAddress,
      voting_power_used: v.votingPowerUsed.toString(),
      votes_cast: v.votesCast.toString(),
      weight_percentage: v.weightPercentage,
      voted_at_timestamp: v.votedAtTimestamp,
      voted_at_block: v.votedAtBlock,
      tx_hash: v.txHash,
    }));

    const { error: votesError } = await supabase
      .from('votes')
      .upsert(voteRecords, { onConflict: 'epoch_id,delegate_address,gauge_address' });

    if (votesError) throw new Error(`Failed to save votes: ${votesError.message}`);
  }

  // Insert delegations
  if (delegations.length > 0) {
    const delegationRecords = delegations.map(d => ({
      epoch_id: d.epochId,
      delegator_address: d.delegatorAddress,
      delegate_address: d.delegateAddress,
      token_ids: d.tokenIds,
      total_voting_power: d.totalVotingPower.toString(),
      snapshot_timestamp: d.snapshotTimestamp,
    }));

    const { error: delegationsError } = await supabase
      .from('delegations')
      .upsert(delegationRecords, { onConflict: 'epoch_id,delegator_address' });

    if (delegationsError) throw new Error(`Failed to save delegations: ${delegationsError.message}`);
  }

  // Insert contributions
  if (contributions.length > 0) {
    const contributionRecords = contributions.map(c => ({
      epoch_id: c.epochId,
      delegator_address: c.delegatorAddress,
      delegate_address: c.delegateAddress,
      gauge_address: c.gaugeAddress,
      delegator_voting_power: c.delegatorVotingPower.toString(),
      contribution_amount: c.contributionAmount.toString(),
      contribution_percentage: c.contributionPercentage,
    }));

    const { error: contribError } = await supabase
      .from('contributions')
      .upsert(contributionRecords, { onConflict: 'epoch_id,delegator_address,gauge_address' });

    if (contribError) throw new Error(`Failed to save contributions: ${contribError.message}`);
  }

  // Insert gauge totals
  if (gaugeTotals.length > 0) {
    const gaugeTotalRecords = gaugeTotals.map(g => ({
      epoch_id: g.epochId,
      gauge_address: g.gaugeAddress,
      total_votes: g.totalVotes.toString(),
      unique_voters: g.uniqueVoters,
      unique_contributors: g.uniqueContributors,
    }));

    const { error: gaugeError } = await supabase
      .from('epoch_gauge_totals')
      .upsert(gaugeTotalRecords, { onConflict: 'epoch_id,gauge_address' });

    if (gaugeError) throw new Error(`Failed to save gauge totals: ${gaugeError.message}`);
  }

  // Insert delegate rankings
  if (delegateRankings.length > 0) {
    const rankingRecords = delegateRankings.map(r => ({
      epoch_id: r.epochId,
      delegate_address: r.delegateAddress,
      total_voting_power: r.totalVotingPower.toString(),
      delegator_count: r.delegatorCount,
      gauges_voted_for: r.gaugesVotedFor,
      rank: r.rank,
    }));

    const { error: rankingError } = await supabase
      .from('delegate_rankings')
      .upsert(rankingRecords, { onConflict: 'epoch_id,delegate_address' });

    if (rankingError) throw new Error(`Failed to save rankings: ${rankingError.message}`);
  }
}

// Get epoch by ID
export async function getEpoch(epochId: EpochId): Promise<Epoch | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('epochs')
    .select('*')
    .eq('epoch_id', epochId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get epoch: ${error.message}`);
  }

  return {
    epochId: data.epoch_id,
    startTimestamp: data.start_timestamp,
    voteStartTimestamp: data.vote_start_timestamp,
    voteEndTimestamp: data.vote_end_timestamp,
    snapshotTimestamp: data.snapshot_timestamp,
    totalVotes: BigInt(data.total_votes),
    isFinalized: data.is_finalized,
    createdAt: new Date(data.created_at),
  };
}

// Get all epochs with pagination
export async function getEpochs(limit = 20, offset = 0, finalized?: boolean): Promise<{
  epochs: Epoch[];
  total: number;
}> {
  const supabase = getSupabase();

  let query = supabase
    .from('epochs')
    .select('*', { count: 'exact' })
    .order('epoch_id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (finalized !== undefined) {
    query = query.eq('is_finalized', finalized);
  }

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to get epochs: ${error.message}`);

  const epochs = (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    startTimestamp: d.start_timestamp as number,
    voteStartTimestamp: d.vote_start_timestamp as number,
    voteEndTimestamp: d.vote_end_timestamp as number,
    snapshotTimestamp: d.snapshot_timestamp as number,
    totalVotes: BigInt(d.total_votes as string),
    isFinalized: d.is_finalized as boolean,
    createdAt: new Date(d.created_at as string),
  }));

  return { epochs, total: count || 0 };
}

// Get contributions for an epoch with optional filters
export async function getContributions(
  epochId: EpochId,
  options: {
    delegator?: Address;
    delegate?: Address;
    gauge?: Address;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ contributions: Contribution[]; total: number }> {
  const supabase = getSupabase();
  const { limit = 100, offset = 0, delegator, delegate, gauge } = options;

  let query = supabase
    .from('contributions')
    .select('*', { count: 'exact' })
    .eq('epoch_id', epochId)
    .range(offset, offset + limit - 1);

  if (delegator) query = query.eq('delegator_address', delegator);
  if (delegate) query = query.eq('delegate_address', delegate);
  if (gauge) query = query.eq('gauge_address', gauge);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to get contributions: ${error.message}`);

  const contributions = (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    delegatorAddress: d.delegator_address as Address,
    delegateAddress: d.delegate_address as Address,
    gaugeAddress: d.gauge_address as Address,
    delegatorVotingPower: BigInt(d.delegator_voting_power as string),
    contributionAmount: BigInt(d.contribution_amount as string),
    contributionPercentage: d.contribution_percentage as number,
  }));

  return { contributions, total: count || 0 };
}

// Get gauge totals for an epoch
export async function getGaugeTotals(epochId: EpochId): Promise<EpochGaugeTotal[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('epoch_gauge_totals')
    .select('*')
    .eq('epoch_id', epochId);

  if (error) throw new Error(`Failed to get gauge totals: ${error.message}`);

  return (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    gaugeAddress: d.gauge_address as Address,
    totalVotes: BigInt(d.total_votes as string),
    uniqueVoters: d.unique_voters as number,
    uniqueContributors: d.unique_contributors as number,
  }));
}

// Get delegate rankings for an epoch
export async function getDelegateRankings(
  epochId: EpochId,
  limit = 50,
  offset = 0
): Promise<{ rankings: DelegateRanking[]; total: number }> {
  const supabase = getSupabase();
  const { data, error, count } = await supabase
    .from('delegate_rankings')
    .select('*', { count: 'exact' })
    .eq('epoch_id', epochId)
    .order('rank', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to get rankings: ${error.message}`);

  const rankings = (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    delegateAddress: d.delegate_address as Address,
    totalVotingPower: BigInt(d.total_voting_power as string),
    delegatorCount: d.delegator_count as number,
    gaugesVotedFor: d.gauges_voted_for as number,
    rank: d.rank as number,
  }));

  return { rankings, total: count || 0 };
}

// Get votes for an epoch
export async function getVotes(
  epochId: EpochId,
  options: { delegate?: Address; gauge?: Address } = {}
): Promise<Vote[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('votes')
    .select('*')
    .eq('epoch_id', epochId);

  if (options.delegate) query = query.eq('delegate_address', options.delegate);
  if (options.gauge) query = query.eq('gauge_address', options.gauge);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get votes: ${error.message}`);

  return (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    delegateAddress: d.delegate_address as Address,
    gaugeAddress: d.gauge_address as Address,
    votingPowerUsed: BigInt(d.voting_power_used as string),
    votesCast: BigInt(d.votes_cast as string),
    weightPercentage: d.weight_percentage as number,
    votedAtTimestamp: d.voted_at_timestamp as number,
    votedAtBlock: d.voted_at_block as number,
    txHash: d.tx_hash as string,
  }));
}

// Get delegations for an epoch
export async function getDelegations(
  epochId: EpochId,
  options: { delegator?: Address; delegate?: Address } = {}
): Promise<Delegation[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('delegations')
    .select('*')
    .eq('epoch_id', epochId);

  if (options.delegator) query = query.eq('delegator_address', options.delegator);
  if (options.delegate) query = query.eq('delegate_address', options.delegate);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get delegations: ${error.message}`);

  return (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    delegatorAddress: d.delegator_address as Address,
    delegateAddress: d.delegate_address as Address,
    tokenIds: d.token_ids as number[],
    totalVotingPower: BigInt(d.total_voting_power as string),
    snapshotTimestamp: d.snapshot_timestamp as number,
  }));
}

// Get delegate history across epochs
export async function getDelegateHistory(
  delegateAddress: Address,
  options: { fromEpoch?: EpochId; toEpoch?: EpochId; limit?: number } = {}
): Promise<DelegateRanking[]> {
  const supabase = getSupabase();
  const { limit = 10, fromEpoch, toEpoch } = options;

  let query = supabase
    .from('delegate_rankings')
    .select('*')
    .eq('delegate_address', delegateAddress)
    .order('epoch_id', { ascending: false })
    .limit(limit);

  if (fromEpoch !== undefined) query = query.gte('epoch_id', fromEpoch);
  if (toEpoch !== undefined) query = query.lte('epoch_id', toEpoch);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get delegate history: ${error.message}`);

  return (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    delegateAddress: d.delegate_address as Address,
    totalVotingPower: BigInt(d.total_voting_power as string),
    delegatorCount: d.delegator_count as number,
    gaugesVotedFor: d.gauges_voted_for as number,
    rank: d.rank as number,
  }));
}

// Get delegator history across epochs
export async function getDelegatorHistory(
  delegatorAddress: Address,
  options: { fromEpoch?: EpochId; toEpoch?: EpochId } = {}
): Promise<Delegation[]> {
  const supabase = getSupabase();
  const { fromEpoch, toEpoch } = options;

  let query = supabase
    .from('delegations')
    .select('*')
    .eq('delegator_address', delegatorAddress)
    .order('epoch_id', { ascending: false });

  if (fromEpoch !== undefined) query = query.gte('epoch_id', fromEpoch);
  if (toEpoch !== undefined) query = query.lte('epoch_id', toEpoch);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get delegator history: ${error.message}`);

  return (data || []).map((d: Record<string, unknown>) => ({
    epochId: d.epoch_id as number,
    delegatorAddress: d.delegator_address as Address,
    delegateAddress: d.delegate_address as Address,
    tokenIds: d.token_ids as number[],
    totalVotingPower: BigInt(d.total_voting_power as string),
    snapshotTimestamp: d.snapshot_timestamp as number,
  }));
}

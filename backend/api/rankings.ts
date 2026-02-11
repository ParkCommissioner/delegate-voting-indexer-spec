// GET /api/rankings - Top delegates, voters, gauges

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDelegateRankings, getGaugeTotals, getEpochs, getContributions } from '../src/db/client.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  setCorsHeaders,
  handleOptions,
  serializeBigInts,
} from '../src/api/utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }, 405);
  }

  try {
    let epochId = parseIntParam(req.query.epoch, -1);
    const limit = parseIntParam(req.query.limit, 10);

    // If no epoch specified, use the latest
    if (epochId < 0) {
      const { epochs } = await getEpochs(1, 0, true);
      if (epochs.length === 0) {
        return sendSuccess(res, {
          epochId: null,
          topDelegates: [],
          topGauges: [],
          topVoters: [],
        });
      }
      epochId = epochs[0].epochId;
    }

    const [{ rankings: delegates }, gauges, { contributions }] = await Promise.all([
      getDelegateRankings(epochId, limit, 0),
      getGaugeTotals(epochId),
      getContributions(epochId, { limit: 1000 }),
    ]);

    // Sort gauges by total votes
    const sortedGauges = gauges
      .sort((a, b) => (b.totalVotes > a.totalVotes ? 1 : -1))
      .slice(0, limit)
      .map((g, i) => ({
        rank: i + 1,
        gaugeAddress: g.gaugeAddress,
        totalVotes: g.totalVotes,
        uniqueVoters: g.uniqueVoters,
        uniqueContributors: g.uniqueContributors,
      }));

    // Aggregate contributions by delegator to find top voters
    const voterContributions = new Map<string, { votingPower: bigint; contribution: bigint }>();
    for (const c of contributions) {
      const current = voterContributions.get(c.delegatorAddress) || { votingPower: 0n, contribution: 0n };
      voterContributions.set(c.delegatorAddress, {
        votingPower: c.delegatorVotingPower > current.votingPower ? c.delegatorVotingPower : current.votingPower,
        contribution: current.contribution + c.contributionAmount,
      });
    }

    const topVoters = Array.from(voterContributions.entries())
      .sort((a, b) => (b[1].contribution > a[1].contribution ? 1 : -1))
      .slice(0, limit)
      .map(([address, data], i) => ({
        rank: i + 1,
        voterAddress: address,
        votingPower: data.votingPower,
        totalContribution: data.contribution,
      }));

    return sendSuccess(res, {
      epochId,
      topDelegates: serializeBigInts(delegates.map(d => ({
        rank: d.rank,
        delegateAddress: d.delegateAddress,
        totalVotingPower: d.totalVotingPower,
        delegatorCount: d.delegatorCount,
        gaugesVotedFor: d.gaugesVotedFor,
      }))),
      topGauges: serializeBigInts(sortedGauges),
      topVoters: serializeBigInts(topVoters),
    });
  } catch (error) {
    console.error('Error fetching rankings:', error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch rankings' },
      500
    );
  }
}

// GET /api/epochs/:epochId/delegates - Get all delegates who voted in an epoch

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDelegateRankings, getVotes, isEpochCached } from '../../../src/db/client.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  setCorsHeaders,
  handleOptions,
  serializeBigInts,
} from '../../../src/api/utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }, 405);
  }

  const epochId = parseIntParam(req.query.epochId, -1);
  if (epochId < 0) {
    return sendError(res, { code: 'INVALID_EPOCH', message: 'Invalid epoch ID' }, 400);
  }

  try {
    // Check if epoch is cached
    const cached = await isEpochCached(epochId);
    if (!cached) {
      return sendError(
        res,
        {
          code: 'EPOCH_NOT_FOUND',
          message: `Epoch ${epochId} has not been indexed yet`,
        },
        404
      );
    }

    const limit = parseIntParam(req.query.limit, 50);
    const offset = parseIntParam(req.query.offset, 0);

    const [{ rankings, total }, votes] = await Promise.all([
      getDelegateRankings(epochId, limit, offset),
      getVotes(epochId),
    ]);

    // Group votes by delegate
    const votesByDelegate = new Map<string, typeof votes>();
    for (const vote of votes) {
      if (!votesByDelegate.has(vote.delegateAddress)) {
        votesByDelegate.set(vote.delegateAddress, []);
      }
      votesByDelegate.get(vote.delegateAddress)!.push(vote);
    }

    // Enrich rankings with vote details
    const delegates = rankings.map(r => ({
      delegateAddress: r.delegateAddress,
      totalVotingPower: r.totalVotingPower,
      delegatorCount: r.delegatorCount,
      gaugesVotedFor: r.gaugesVotedFor,
      rank: r.rank,
      votes: (votesByDelegate.get(r.delegateAddress) || []).map(v => ({
        gaugeAddress: v.gaugeAddress,
        votesCast: v.votesCast,
        weightPercentage: v.weightPercentage,
      })),
    }));

    return sendSuccess(res, {
      delegates: serializeBigInts(delegates),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error(`Error fetching delegates for epoch ${epochId}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch delegates' },
      500
    );
  }
}

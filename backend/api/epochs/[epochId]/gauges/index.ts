// GET /api/epochs/:epochId/gauges - Breakdown by gauge

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEpoch, getGaugeTotals, isEpochCached } from '../../../../src/db/client.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  setCorsHeaders,
  handleOptions,
  serializeBigInts,
} from '../../../../src/api/utils.js';

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

    const [epoch, gaugeTotals] = await Promise.all([
      getEpoch(epochId),
      getGaugeTotals(epochId),
    ]);

    if (!epoch) {
      return sendError(
        res,
        { code: 'EPOCH_NOT_FOUND', message: `Epoch ${epochId} not found` },
        404
      );
    }

    // Calculate percentages
    const totalVotes = epoch.totalVotes || 1n;
    const gaugesWithPercentage = gaugeTotals.map(g => ({
      gaugeAddress: g.gaugeAddress,
      totalVotes: g.totalVotes,
      uniqueVoters: g.uniqueVoters,
      uniqueContributors: g.uniqueContributors,
      percentageOfTotal: Number((g.totalVotes * 10000n) / totalVotes) / 100,
    }));

    return sendSuccess(res, {
      epochId,
      gauges: serializeBigInts(gaugesWithPercentage),
    });
  } catch (error) {
    console.error(`Error fetching gauges for epoch ${epochId}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch gauges' },
      500
    );
  }
}

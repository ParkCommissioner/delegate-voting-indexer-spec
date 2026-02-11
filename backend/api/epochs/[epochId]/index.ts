// GET /api/epochs/:epochId - Get details for a specific epoch

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEpoch, getGaugeTotals, getVotes, getContributions } from '../../../src/db/client.js';
import { processEpoch } from '../../../src/lib/epoch-processor.js';
import { isEpochCached, saveEpochData } from '../../../src/db/client.js';
import { isEpochFinalized } from '../../../src/lib/snapshot-resolver.js';
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
    let epoch = await getEpoch(epochId);

    // If not cached and finalized, compute it
    if (!epoch) {
      const finalized = await isEpochFinalized(epochId);
      if (!finalized) {
        return sendError(
          res,
          {
            code: 'EPOCH_NOT_FINALIZED',
            message: `Epoch ${epochId} is still in progress`,
          },
          400
        );
      }

      // Process and cache the epoch
      const result = await processEpoch(epochId);
      await saveEpochData(
        result.epoch,
        result.votes,
        result.delegations,
        result.contributions,
        result.gaugeTotals,
        result.delegateRankings
      );
      epoch = result.epoch;
    }

    // Fetch related data
    const [gaugeTotals, votes, { contributions, total: contribTotal }] = await Promise.all([
      getGaugeTotals(epochId),
      getVotes(epochId),
      getContributions(epochId, { limit: 1000 }),
    ]);

    // Calculate summary stats
    const uniqueDelegates = new Set(votes.map(v => v.delegateAddress)).size;
    const uniqueContributors = new Set(contributions.map(c => c.delegatorAddress)).size;
    const uniqueGauges = new Set(votes.map(v => v.gaugeAddress)).size;

    // Calculate percentages for gauges
    const totalVotes = epoch.totalVotes || 1n;
    const gaugesWithPercentage = gaugeTotals.map(g => ({
      ...g,
      percentage: Number((g.totalVotes * 10000n) / totalVotes) / 100,
    }));

    return sendSuccess(res, {
      epoch: serializeBigInts(epoch),
      gauges: serializeBigInts(gaugesWithPercentage),
      summary: {
        totalDelegates: uniqueDelegates,
        totalContributors: uniqueContributors,
        totalGaugesVotedFor: uniqueGauges,
      },
    });
  } catch (error) {
    console.error(`Error fetching epoch ${epochId}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: `Failed to fetch epoch ${epochId}` },
      500
    );
  }
}

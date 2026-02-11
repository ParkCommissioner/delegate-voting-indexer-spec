// GET /api/epochs/:epochId/gauges/:gauge - Voters for a specific gauge

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getVotes, getContributions, isEpochCached } from '../../../../src/db/client.js';
import type { Address } from '../../../../src/types.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  parseAddressParam,
  isValidAddress,
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

  const gaugeParam = req.query.gauge;
  if (!gaugeParam || Array.isArray(gaugeParam) || !isValidAddress(gaugeParam)) {
    return sendError(res, { code: 'INVALID_ADDRESS', message: 'Invalid gauge address' }, 400);
  }
  const gauge = gaugeParam as Address;

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

    const [votes, { contributions }] = await Promise.all([
      getVotes(epochId, { gauge }),
      getContributions(epochId, { gauge, limit: 1000 }),
    ]);

    // Calculate total votes for this gauge
    const totalVotes = votes.reduce((sum, v) => sum + v.votesCast, 0n);

    // Build voter list with percentages
    const voters = votes.map(v => ({
      delegateAddress: v.delegateAddress,
      votesCast: v.votesCast,
      weightPercentage: v.weightPercentage,
      percentageOfGauge: totalVotes > 0n
        ? Number((v.votesCast * 10000n) / totalVotes) / 100
        : 0,
    }));

    // Build top contributors list
    const contributorMap = new Map<string, bigint>();
    for (const c of contributions) {
      const current = contributorMap.get(c.delegatorAddress) || 0n;
      contributorMap.set(c.delegatorAddress, current + c.contributionAmount);
    }

    const topContributors = Array.from(contributorMap.entries())
      .map(([address, contribution]) => ({
        delegatorAddress: address,
        contribution,
        percentage: totalVotes > 0n
          ? Number((contribution * 10000n) / totalVotes) / 100
          : 0,
      }))
      .sort((a, b) => (b.contribution > a.contribution ? 1 : -1))
      .slice(0, 20);

    return sendSuccess(res, {
      gauge: {
        address: gauge,
        epochId,
        totalVotes,
        percentageOfTotal: 0, // Would need epoch total to calculate
        voters: serializeBigInts(voters),
        topContributors: serializeBigInts(topContributors),
      },
    });
  } catch (error) {
    console.error(`Error fetching gauge ${gauge} for epoch ${epochId}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch gauge data' },
      500
    );
  }
}

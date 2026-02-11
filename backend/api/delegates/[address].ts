// GET /api/delegates/:address - Historical data for a delegate

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDelegateHistory, getDelegations } from '../../src/db/client.js';
import type { Address } from '../../src/types.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  isValidAddress,
  setCorsHeaders,
  handleOptions,
  serializeBigInts,
} from '../../src/api/utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }, 405);
  }

  const addressParam = req.query.address;
  if (!addressParam || Array.isArray(addressParam) || !isValidAddress(addressParam)) {
    return sendError(res, { code: 'INVALID_ADDRESS', message: 'Invalid delegate address' }, 400);
  }
  const address = addressParam as Address;

  try {
    const fromEpoch = parseIntParam(req.query.fromEpoch, undefined as unknown as number);
    const toEpoch = parseIntParam(req.query.toEpoch, undefined as unknown as number);
    const limit = parseIntParam(req.query.limit, 10);

    const history = await getDelegateHistory(address, {
      fromEpoch: fromEpoch >= 0 ? fromEpoch : undefined,
      toEpoch: toEpoch >= 0 ? toEpoch : undefined,
      limit,
    });

    // Get current stats from most recent epoch
    const currentStats = history.length > 0 ? history[0] : null;

    return sendSuccess(res, {
      delegate: {
        address,
        currentDelegatorCount: currentStats?.delegatorCount || 0,
        currentVotingPower: currentStats?.totalVotingPower || 0n,
        history: serializeBigInts(history.map(h => ({
          epochId: h.epochId,
          votingPower: h.totalVotingPower,
          delegatorCount: h.delegatorCount,
          gaugesVotedFor: h.gaugesVotedFor,
          rank: h.rank,
        }))),
      },
    });
  } catch (error) {
    console.error(`Error fetching delegate ${address}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch delegate data' },
      500
    );
  }
}

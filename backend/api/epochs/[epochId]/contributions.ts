// GET /api/epochs/:epochId/contributions - Get all contributions for an epoch

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getContributions, isEpochCached } from '../../../src/db/client.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  parseAddressParam,
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

    const limit = parseIntParam(req.query.limit, 100);
    const offset = parseIntParam(req.query.offset, 0);
    const delegator = parseAddressParam(req.query.delegator);
    const delegate = parseAddressParam(req.query.delegate);
    const gauge = parseAddressParam(req.query.gauge);

    const { contributions, total } = await getContributions(epochId, {
      limit,
      offset,
      delegator,
      delegate,
      gauge,
    });

    return sendSuccess(res, {
      contributions: serializeBigInts(contributions),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error(`Error fetching contributions for epoch ${epochId}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch contributions' },
      500
    );
  }
}

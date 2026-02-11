// GET /api/epochs - List all indexed epochs

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEpochs } from '../../src/db/client.js';
import {
  sendSuccess,
  sendError,
  parseIntParam,
  parseBooleanParam,
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

  try {
    const limit = parseIntParam(req.query.limit, 20);
    const offset = parseIntParam(req.query.offset, 0);
    const finalized = parseBooleanParam(req.query.finalized);

    const { epochs, total } = await getEpochs(limit, offset, finalized);

    return sendSuccess(res, {
      epochs: serializeBigInts(epochs),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching epochs:', error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch epochs' },
      500
    );
  }
}

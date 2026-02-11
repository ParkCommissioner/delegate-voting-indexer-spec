// GET /api/gauges - List all gauges

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GAUGES } from '../src/types.js';
import {
  sendSuccess,
  sendError,
  setCorsHeaders,
  handleOptions,
} from '../src/api/utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }, 405);
  }

  try {
    // Return the known gauges
    const gauges = GAUGES.map((address, index) => ({
      address,
      isActive: true,
      createdAt: 0,
      metadataUri: null,
      index: index + 1,
    }));

    return sendSuccess(res, { gauges });
  } catch (error) {
    console.error('Error fetching gauges:', error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch gauges' },
      500
    );
  }
}

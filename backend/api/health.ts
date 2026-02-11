// GET /api/health - Health check endpoint

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProvider } from '../src/lib/provider.js';
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
    const provider = getProvider();
    const blockNumber = await provider.getBlockNumber();

    return sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      blockNumber,
      version: '1.0.0',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return sendError(
      res,
      { code: 'UNHEALTHY', message: 'Service unhealthy' },
      503
    );
  }
}

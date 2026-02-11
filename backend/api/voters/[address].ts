// GET /api/voters/:address - Historical data for a voter/delegator

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDelegatorHistory, getContributions } from '../../src/db/client.js';
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
    return sendError(res, { code: 'INVALID_ADDRESS', message: 'Invalid voter address' }, 400);
  }
  const address = addressParam as Address;

  try {
    const fromEpoch = parseIntParam(req.query.fromEpoch, undefined as unknown as number);
    const toEpoch = parseIntParam(req.query.toEpoch, undefined as unknown as number);

    const delegations = await getDelegatorHistory(address, {
      fromEpoch: fromEpoch >= 0 ? fromEpoch : undefined,
      toEpoch: toEpoch >= 0 ? toEpoch : undefined,
    });

    // Get current stats from most recent delegation
    const currentDelegation = delegations.length > 0 ? delegations[0] : null;

    // Build history with total contributions
    const history = await Promise.all(delegations.map(async d => {
      const { contributions } = await getContributions(d.epochId, {
        delegator: address,
        limit: 100,
      });
      const totalContribution = contributions.reduce((sum, c) => sum + c.contributionAmount, 0n);

      return {
        epochId: d.epochId,
        delegateAddress: d.delegateAddress,
        votingPower: d.totalVotingPower,
        totalContribution,
      };
    }));

    return sendSuccess(res, {
      delegator: {
        address,
        currentDelegate: currentDelegation?.delegateAddress || null,
        tokenIds: currentDelegation?.tokenIds || [],
        currentVotingPower: currentDelegation?.totalVotingPower || 0n,
        history: serializeBigInts(history),
      },
    });
  } catch (error) {
    console.error(`Error fetching voter ${address}:`, error);
    return sendError(
      res,
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch voter data' },
      500
    );
  }
}

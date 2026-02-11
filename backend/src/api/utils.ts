// API utility functions

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Address, ApiError } from '../types.js';

export function sendSuccess(res: VercelResponse, data: unknown, status = 200): void {
  res.status(status).json(data);
}

export function sendError(res: VercelResponse, error: ApiError, status = 400): void {
  res.status(status).json({ error });
}

export function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function parseIntParam(value: string | string[] | undefined, defaultValue: number): number {
  if (!value || Array.isArray(value)) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseAddressParam(value: string | string[] | undefined): Address | undefined {
  if (!value || Array.isArray(value)) return undefined;
  return isValidAddress(value) ? value : undefined;
}

export function parseBooleanParam(value: string | string[] | undefined): boolean | undefined {
  if (!value || Array.isArray(value)) return undefined;
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}

// Serialize bigints to strings for JSON
export function serializeBigInts<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString() as unknown as T;
  if (Array.isArray(obj)) return obj.map(serializeBigInts) as unknown as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInts(value);
    }
    return result as T;
  }
  return obj;
}

// API client for backend endpoints

const API_BASE = import.meta.env.DEV
  ? '/api'
  : 'https://backend-seven-hazel-85.vercel.app/api';

class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.message || 'An error occurred',
        data.error?.details
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', `Failed to connect: ${error.message}`);
  }
}

// Health check
export async function getHealth() {
  return fetchApi('/health');
}

// Epochs
export async function getEpochs(params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit);
  if (params.offset) query.set('offset', params.offset);
  if (params.finalized !== undefined) query.set('finalized', params.finalized);

  const queryStr = query.toString();
  return fetchApi(`/epochs${queryStr ? `?${queryStr}` : ''}`);
}

export async function getEpoch(epochId) {
  return fetchApi(`/epochs/${epochId}`);
}

export async function getEpochContributions(epochId, params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit);
  if (params.offset) query.set('offset', params.offset);
  if (params.delegator) query.set('delegator', params.delegator);
  if (params.delegate) query.set('delegate', params.delegate);
  if (params.gauge) query.set('gauge', params.gauge);

  const queryStr = query.toString();
  return fetchApi(`/epochs/${epochId}/contributions${queryStr ? `?${queryStr}` : ''}`);
}

export async function getEpochDelegates(epochId, params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit);
  if (params.offset) query.set('offset', params.offset);

  const queryStr = query.toString();
  return fetchApi(`/epochs/${epochId}/delegates${queryStr ? `?${queryStr}` : ''}`);
}

// Gauges
export async function getGauges() {
  return fetchApi('/gauges');
}

export async function getGaugeEpoch(gaugeAddress, epochId) {
  return fetchApi(`/epochs/${epochId}/gauges/${gaugeAddress}`);
}

// Rankings
export async function getRankings(params = {}) {
  const query = new URLSearchParams();
  if (params.epoch) query.set('epoch', params.epoch);
  if (params.limit) query.set('limit', params.limit);

  const queryStr = query.toString();
  return fetchApi(`/rankings${queryStr ? `?${queryStr}` : ''}`);
}

// Delegates
export async function getDelegate(address, params = {}) {
  const query = new URLSearchParams();
  if (params.fromEpoch) query.set('fromEpoch', params.fromEpoch);
  if (params.toEpoch) query.set('toEpoch', params.toEpoch);
  if (params.limit) query.set('limit', params.limit);

  const queryStr = query.toString();
  return fetchApi(`/delegates/${address}${queryStr ? `?${queryStr}` : ''}`);
}

// Voters/Delegators
export async function getVoter(address, params = {}) {
  const query = new URLSearchParams();
  if (params.fromEpoch) query.set('fromEpoch', params.fromEpoch);
  if (params.toEpoch) query.set('toEpoch', params.toEpoch);

  const queryStr = query.toString();
  return fetchApi(`/voters/${address}${queryStr ? `?${queryStr}` : ''}`);
}

export { ApiError };

// Ethereum provider utilities

import { JsonRpcProvider, Contract } from 'ethers';
import { config } from '../config.js';
import { CONTRACTS, type Address } from '../types.js';
import {
  CLOCK_ABI,
  GAUGE_VOTER_ABI,
  ESCROW_IVOTES_ADAPTER_ABI,
  VOTING_ESCROW_ABI,
} from './abis.js';

let providerInstance: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new JsonRpcProvider(config.rpcUrl);
  }
  return providerInstance;
}

export function getClockContract(): Contract {
  return new Contract(CONTRACTS.CLOCK, CLOCK_ABI, getProvider());
}

export function getGaugeVoterContract(): Contract {
  return new Contract(CONTRACTS.GAUGE_VOTER, GAUGE_VOTER_ABI, getProvider());
}

export function getEscrowIVotesAdapterContract(): Contract {
  return new Contract(CONTRACTS.ESCROW_IVOTES_ADAPTER, ESCROW_IVOTES_ADAPTER_ABI, getProvider());
}

export function getVotingEscrowContract(): Contract {
  return new Contract(CONTRACTS.VOTING_ESCROW, VOTING_ESCROW_ABI, getProvider());
}

export function getContractAt(address: Address, abi: readonly string[]): Contract {
  return new Contract(address, abi, getProvider());
}

// Query the on-chain state of enableUpdateVotingPowerHook
export async function checkEnableUpdateVotingPowerHook(): Promise<boolean> {
  const gaugeVoter = getGaugeVoterContract();
  try {
    return await gaugeVoter.enableUpdateVotingPowerHook();
  } catch {
    // Default to false (secure mode) if we can't query it
    console.warn('Could not query enableUpdateVotingPowerHook, defaulting to false');
    return false;
  }
}

// Get block number at a specific timestamp
export async function getBlockAtTimestamp(timestamp: number): Promise<number> {
  const provider = getProvider();
  const latestBlock = await provider.getBlock('latest');
  if (!latestBlock) throw new Error('Could not fetch latest block');

  // Binary search for block at timestamp
  let lo = 0;
  let hi = latestBlock.number;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const block = await provider.getBlock(mid);
    if (!block) throw new Error(`Could not fetch block ${mid}`);

    if (block.timestamp < timestamp) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

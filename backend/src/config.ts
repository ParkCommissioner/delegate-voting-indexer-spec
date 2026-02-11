// Configuration for the delegate voting indexer

export interface Config {
  rpcUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  enableUpdateVotingPowerHook: boolean;
}

export function getConfig(): Config {
  const rpcUrl = process.env.KATANA_RPC_URL || 'https://rpc.katana.cartridge.gg';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

  // Default to false (secure mode) - should be verified on-chain at startup
  const enableUpdateVotingPowerHook = process.env.ENABLE_UPDATE_VOTING_POWER_HOOK === 'true';

  return {
    rpcUrl,
    supabaseUrl,
    supabaseKey,
    enableUpdateVotingPowerHook,
  };
}

export const config = getConfig();

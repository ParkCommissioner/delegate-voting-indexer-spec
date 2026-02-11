// Main entry point for the delegate voting indexer

export * from './types.js';
export * from './config.js';
export * from './lib/provider.js';
export * from './lib/abis.js';
export * from './lib/snapshot-resolver.js';
export * from './lib/event-fetcher.js';
export * from './lib/voter-identifier.js';
export * from './lib/delegation-state.js';
export * from './lib/voting-power.js';
export * from './lib/vote-decomposer.js';
export * from './lib/invariants.js';
export * from './lib/epoch-processor.js';
export * from './db/client.js';

// CLI entry point for manual processing
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Delegate Voting Indexer

Usage:
  npm start -- --process-epoch <epochId>   Process a specific epoch
  npm start -- --process-all               Process all finalized epochs
  npm start -- --check-hook                Check enableUpdateVotingPowerHook value
  npm start -- --help                      Show this help message

Environment variables:
  KATANA_RPC_URL          RPC URL for Katana network
  SUPABASE_URL            Supabase project URL
  SUPABASE_ANON_KEY       Supabase anonymous key
    `);
    return;
  }

  const { processEpoch } = await import('./lib/epoch-processor.js');
  const { getCurrentEpoch, isEpochFinalized } = await import('./lib/snapshot-resolver.js');
  const { checkEnableUpdateVotingPowerHook } = await import('./lib/provider.js');
  const { saveEpochData, isEpochCached } = await import('./db/client.js');

  if (args.includes('--check-hook')) {
    console.log('Checking enableUpdateVotingPowerHook value...');
    const hookEnabled = await checkEnableUpdateVotingPowerHook();
    console.log(`enableUpdateVotingPowerHook = ${hookEnabled}`);
    return;
  }

  if (args.includes('--process-epoch')) {
    const epochIndex = args.indexOf('--process-epoch') + 1;
    const epochId = parseInt(args[epochIndex], 10);

    if (isNaN(epochId)) {
      console.error('Invalid epoch ID');
      process.exit(1);
    }

    console.log(`Processing epoch ${epochId}...`);
    const result = await processEpoch(epochId);

    console.log('\nSaving to database...');
    await saveEpochData(
      result.epoch,
      result.votes,
      result.delegations,
      result.contributions,
      result.gaugeTotals,
      result.delegateRankings
    );

    console.log('Done!');
    return;
  }

  if (args.includes('--process-all')) {
    console.log('Processing all finalized epochs...');
    const currentEpoch = await getCurrentEpoch();

    for (let epochId = 0; epochId < currentEpoch; epochId++) {
      const cached = await isEpochCached(epochId);
      if (cached) {
        console.log(`Epoch ${epochId} already cached, skipping`);
        continue;
      }

      const finalized = await isEpochFinalized(epochId);
      if (!finalized) {
        console.log(`Epoch ${epochId} not finalized, skipping`);
        continue;
      }

      console.log(`\nProcessing epoch ${epochId}...`);
      const result = await processEpoch(epochId);

      console.log('Saving to database...');
      await saveEpochData(
        result.epoch,
        result.votes,
        result.delegations,
        result.contributions,
        result.gaugeTotals,
        result.delegateRankings
      );
    }

    console.log('\nAll epochs processed!');
    return;
  }

  console.log('No action specified. Use --help for usage information.');
}

// Run if executed directly
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

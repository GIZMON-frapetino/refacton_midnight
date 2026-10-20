import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export default defineConfig({
  resolve: {
    alias: {
      '@midnight-ntwrk/compact-runtime': require.resolve('@midnight-ntwrk/compact-runtime'),
      '@midnight-ntwrk/onchain-runtime-v3': require.resolve('@midnight-ntwrk/onchain-runtime-v3'),
      '@midnight-ntwrk/ledger-v8': require.resolve('@midnight-ntwrk/ledger-v8'),
    },
    dedupe: ['@midnight-ntwrk/ledger-v8', '@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3'],
  },
  test: { environment: 'node', include: ['scripts/entry-points.test.ts'], pool: 'forks', maxWorkers: 1 },
});

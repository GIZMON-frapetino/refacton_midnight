import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');
const require = createRequire(import.meta.url);
const ledgerBrowserEntry = path.join(path.dirname(require.resolve('@midnight-ntwrk/ledger-v8')), 'midnight_ledger_wasm.js');
const runtimeEntry = require.resolve('@midnight-ntwrk/compact-runtime');
const onchainBrowserEntry = path.join(
  path.dirname(require.resolve('@midnight-ntwrk/onchain-runtime-v3')),
  'midnight_onchain_runtime_wasm.js'
);

export default defineConfig({
  plugins: [react(), wasm()],
  build: {
    outDir: 'dist',
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  base: process.env.VITE_BASE || './',
  resolve: {
    dedupe: ['@midnight-ntwrk/ledger-v8', '@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3'],
    alias: {
      '@contract': path.resolve(repoRoot, 'compiled/contract/index.js'),
      '@midnight-ntwrk/ledger-v8': ledgerBrowserEntry,
      '@midnight-ntwrk/compact-runtime': runtimeEntry,
      '@midnight-ntwrk/onchain-runtime-v3': onchainBrowserEntry,
      'isomorphic-ws': path.resolve(rootDir, 'src/lib/browser-websocket.js'),
      'assert': require.resolve('assert/'),
    },
    conditions: ['browser', 'import', 'module', 'default'],
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});

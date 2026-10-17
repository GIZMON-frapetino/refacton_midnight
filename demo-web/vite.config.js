import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');

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
    alias: {
      '@contract': path.resolve(repoRoot, 'compiled/contract/index.js'),
      '@midnight-ntwrk/compact-runtime': path.resolve(
        repoRoot,
        'node_modules/@midnight-ntwrk/compact-runtime'
      ),
      '@midnight-ntwrk/onchain-runtime-v3': path.resolve(
        repoRoot,
        'node_modules/@midnight-ntwrk/onchain-runtime-v3'
      ),
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

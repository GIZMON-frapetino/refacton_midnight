import { register, createRequire } from 'node:module';

const require = createRequire(import.meta.url);

register('./runtime-loader.mjs', import.meta.url, {
  data: {
    '@midnight-ntwrk/compact-runtime': require.resolve('@midnight-ntwrk/compact-runtime'),
    '@midnight-ntwrk/onchain-runtime-v3': require.resolve('@midnight-ntwrk/onchain-runtime-v3'),
  },
});

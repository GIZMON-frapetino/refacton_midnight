import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

register('@midnight-ntwrk/compact-runtime', pathToFileURL(
  path.join(repoRoot, 'node_modules/@midnight-ntwrk/compact-runtime/dist/index.js')
));

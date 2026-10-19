import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(demoRoot, '../compiled');
const target = path.resolve(demoRoot, 'dist/contract-assets');
const metadata = JSON.parse(await readFile(path.join(source, 'compiler/contract-info.json'), 'utf8'));
await mkdir(path.join(target, 'keys'), { recursive: true });
await mkdir(path.join(target, 'zkir'), { recursive: true });
for (const circuit of metadata.circuits.filter((entry) => entry.proof === true)) {
  if (!/^[A-Za-z0-9_]+$/.test(circuit.name)) throw new Error('Invalid generated circuit name');
  for (const [folder, extension] of [['keys', 'prover'], ['keys', 'verifier'], ['zkir', 'zkir']]) {
    const name = `${circuit.name}.${extension}`;
    await copyFile(path.join(source, folder, name), path.join(target, folder, name));
  }
}
console.log('Copied public circuit assets for draft wallet integration. No deployment performed.');

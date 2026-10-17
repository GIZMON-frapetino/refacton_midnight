/**
 * Headless smoke test mirroring the demo web seller + buyer flows.
 * Run from repo root: npm run test:demo-web
 * (Uses root node_modules compact-runtime so types match compiled/contract.)
 */
import { randomBytes } from 'node:crypto';
import {
  ContractSimulator,
  createCheckWitnesses,
  createSellerWitnesses,
  exportMaterial,
  ledgerSnapshot,
  materialFromExport,
} from '../src/lib/simulator.js';

function randomBytes32() {
  return new Uint8Array(randomBytes(32));
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Seller: recordQuest
const material = {
  questId: randomBytes32(),
  version: 1n,
  userSecret: randomBytes32(),
  localSecretKey: randomBytes32(),
  salt: randomBytes32(),
};

const sellerSim = new ContractSimulator(createSellerWitnesses(material));
sellerSim.callCircuit('recordQuest');
const ledgerAfterRecord = ledgerSnapshot(sellerSim);
assert(ledgerAfterRecord.counter === '1', `expected counter 1, got ${ledgerAfterRecord.counter}`);
assert(ledgerAfterRecord.commitments.length === 1, 'expected one commitment');
assert(ledgerAfterRecord.nullifiers.length === 1, 'expected one nullifier');

const session = { ...exportMaterial(material), recorded: true };

// Buyer: checkAttestation match
const imported = materialFromExport(session);
const rebuildSim = new ContractSimulator(createSellerWitnesses(imported));
rebuildSim.callCircuit('recordQuest');
rebuildSim.contract.witnesses = createCheckWitnesses(imported);
const challenge = randomBytes32();
const match = rebuildSim.callCircuit('checkAttestation', challenge, imported.questId);
assert(match.result instanceof Uint8Array && match.result.length === 32, 'expected 32-byte response');

// Buyer: wrong quest id -> no match
const wrongSim = new ContractSimulator(createSellerWitnesses(imported));
wrongSim.callCircuit('recordQuest');
wrongSim.contract.witnesses = createCheckWitnesses(imported);
const wrongQuestId = randomBytes32();
let threw = false;
try {
  wrongSim.callCircuit('checkAttestation', challenge, wrongQuestId);
} catch (e) {
  threw = /Attestation not found/i.test(e?.message || String(e));
}
assert(threw, 'expected Attestation not found for wrong quest id');

console.log('smoke: ok');
console.log('  questId:', bytesToHex(material.questId));
console.log('  commitment:', ledgerAfterRecord.commitments[0]);
console.log('  response:', bytesToHex(match.result));

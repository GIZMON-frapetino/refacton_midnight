import { bytesToHex, hexToBytes } from './bytes.js';
import {
  ContractSimulator,
  createCheckWitnesses,
  createSellerWitnesses,
  exportMaterial,
  ledgerSnapshot,
  materialFromExport,
} from './simulator.js';

export function simulatorFromSession(session) {
  if (!session?.recorded) {
    throw new Error('No seller record in this browser session. Complete seller flow or import a session file.');
  }
  if (!session.publicStateHex) {
    throw new Error('Session has no saved public ledger. Complete the seller flow again and export a new file.');
  }
  const material = materialFromExport(session);
  const sim = new ContractSimulator(createSellerWitnesses(material), session.publicStateHex);
  return { sim, material };
}

export function validateSession(session) {
  const material = materialFromExport(session);
  if (typeof session.recorded !== 'boolean') throw new Error('Invalid session record flag');
  if (!session.recorded) {
    return { ...exportMaterial(material), recorded: false, ledger: null, lastResponseHex: null };
  }
  const { sim } = simulatorFromSession(session);
  const snapshot = ledgerSnapshot(sim);
  if (BigInt(snapshot.counter) < 1n || !snapshot.commitments.length || !snapshot.nullifiers.length) {
    throw new Error('Session public ledger has no seller record');
  }
  return {
    ...exportMaterial(material),
    recorded: true,
    publicStateHex: session.publicStateHex,
    ledger: snapshot,
    circuitOk: true,
    lastResponseHex: null,
  };
}

export function recordSession(session) {
  const material = materialFromExport(session);
  const sim = session.recorded
    ? simulatorFromSession(session).sim
    : new ContractSimulator(createSellerWitnesses(material));
  const result = sim.callCircuit('recordQuest');
  return {
    ...exportMaterial(material),
    recorded: true,
    publicStateHex: sim.exportPublicState(),
    ledger: ledgerSnapshot(sim),
    circuitOk: Boolean(result?.context),
    lastResponseHex: null,
  };
}

export function checkSession(session, questIdHex, challengeHex, differentSecret = false) {
  const questId = hexToBytes(questIdHex.trim());
  const challenge = hexToBytes(challengeHex.trim());
  const { sim, material } = simulatorFromSession(session);
  if (differentSecret) {
    material.userSecret = new Uint8Array(material.userSecret);
    material.userSecret[0] ^= 1;
  }
  sim.contract.witnesses = createCheckWitnesses(material);
  const result = sim.callCircuit('checkAttestation', challenge, questId);
  return { responseHex: bytesToHex(result.result), ledger: ledgerSnapshot(sim) };
}

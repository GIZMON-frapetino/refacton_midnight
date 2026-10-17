import { Contract, ledger } from '../../../compiled/contract/index.js';
import { bytesToHex } from './bytes.js';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  DUMMY_ADDRESS,
} from '../../../node_modules/@midnight-ntwrk/compact-runtime/dist/index.js';

export class ContractSimulator {
  constructor(witnesses) {
    this.contract = new Contract(witnesses);
    this.privateState = {};
    this.contractAddress = dummyContractAddress();

    const initialContext = createConstructorContext(this.privateState);
    const initialResult = this.contract.initialState(initialContext);

    this.circuitContext = createCircuitContext(
      this.contractAddress,
      DUMMY_ADDRESS,
      initialResult.currentContractState,
      this.privateState
    );
  }

  callCircuit(circuitName, ...args) {
    const result = this.contract.circuits[circuitName](this.circuitContext, ...args);
    this.circuitContext = result.context;
    return result;
  }

  getLedgerState() {
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}

export function createSellerWitnesses(material) {
  const { questId, version, userSecret, localSecretKey, salt } = material;
  return {
    questId: () => [{}, questId],
    versionNum: () => [{}, version],
    userSecret: () => [{}, userSecret],
    localSecretKey: () => [{}, localSecretKey],
    saltValue: () => [{}, salt],
  };
}

export function createCheckWitnesses(material) {
  const { version, userSecret, salt } = material;
  return {
    versionNum: () => [{}, version],
    userSecret: () => [{}, userSecret],
    saltValue: () => [{}, salt],
  };
}

export function ledgerSnapshot(sim) {
  const state = sim.getLedgerState();
  const commitments = [...state.commitments].map(bytesToHexFromBytes);
  const nullifiers = [...state.nullifiers].map(bytesToHexFromBytes);
  return {
    counter: state.counter.toString(),
    commitments,
    nullifiers,
  };
}

function bytesToHexFromBytes(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function materialFromExport(obj) {
  const versionRaw = obj.versionNum ?? obj.version ?? '1';
  return {
    questId: hexToBytesImport(obj.questIdHex),
    version: BigInt(versionRaw),
    userSecret: hexToBytesImport(obj.userSecretHex),
    localSecretKey: hexToBytesImport(obj.localSecretKeyHex),
    salt: hexToBytesImport(obj.saltHex),
  };
}

function hexToBytesImport(hex) {
  const cleaned = String(hex).replace(/^0x/i, '');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function exportMaterial(material) {
  return {
    format: 'quest-attestation-demo-session-v1',
    questIdHex: bytesToHex(material.questId),
    versionNum: String(material.version),
    userSecretHex: bytesToHex(material.userSecret),
    localSecretKeyHex: bytesToHex(material.localSecretKey),
    saltHex: bytesToHex(material.salt),
  };
}

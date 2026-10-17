import { Contract, ledger } from '../../../compiled/contract/index.js';
import { bytesToHex, hexToBytes } from './bytes.js';
import {
  ContractState,
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  DUMMY_ADDRESS,
} from '@midnight-ntwrk/compact-runtime';

export class ContractSimulator {
  constructor(witnesses, publicStateHex = null) {
    this.contract = new Contract(witnesses);
    this.privateState = {};
    this.contractAddress = dummyContractAddress();

    const state = publicStateHex === null
      ? this.contract.initialState(createConstructorContext(this.privateState)).currentContractState
      : ContractState.deserialize(stateBytes(publicStateHex));

    this.circuitContext = createCircuitContext(
      this.contractAddress,
      DUMMY_ADDRESS,
      state,
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

  exportPublicState() {
    const state = new ContractState();
    state.data = this.circuitContext.currentQueryContext.state;
    return bytesToHex(state.serialize());
  }
}

function stateBytes(hex) {
  if (typeof hex !== 'string' || hex.length > 2 * 1024 * 1024 || !/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new Error('Invalid saved public ledger. Complete the seller flow again.');
  }
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => parseInt(byte, 16));
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
  return {
    counter: state.counter.toString(),
    commitments: [...state.commitments].map(bytesToHex),
    nullifiers: [...state.nullifiers].map(bytesToHex),
  };
}

export function materialFromExport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Invalid session file');
  const versionRaw = String(obj.versionNum ?? obj.version ?? '');
  if (!/^\d+$/.test(versionRaw) || BigInt(versionRaw) > 18446744073709551615n) {
    throw new Error('Invalid session version');
  }
  return {
    questId: hexToBytes(obj.questIdHex),
    version: BigInt(versionRaw),
    userSecret: hexToBytes(obj.userSecretHex),
    localSecretKey: hexToBytes(obj.localSecretKeyHex),
    salt: hexToBytes(obj.saltHex),
  };
}

export function exportMaterial(material) {
  return {
    format: 'quest-attestation-demo-session-v2',
    questIdHex: bytesToHex(material.questId),
    versionNum: String(material.version),
    userSecretHex: bytesToHex(material.userSecret),
    localSecretKeyHex: bytesToHex(material.localSecretKey),
    saltHex: bytesToHex(material.salt),
  };
}

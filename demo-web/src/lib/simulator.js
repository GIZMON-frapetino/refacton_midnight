import { Contract, ledger, pureCircuits } from '../../../compiled/contract/index.js';
import { bytesToHex, hexToBytes, randomBytes32 } from './bytes.js';
import { authorizationFor, recordWitnesses } from '../../../contract/witnesses.js';
import {
  ContractState,
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  DUMMY_ADDRESS,
} from '@midnight-ntwrk/compact-runtime';

export class ContractSimulator {
  /** @param {unknown} witnesses @param {string | null} [publicStateHex] */
  constructor(witnesses, publicStateHex = null) {
    this.contract = new Contract(witnesses);
    this.sampleAuthority = { adminSecret: randomBytes32(), issuerSecret: randomBytes32() };
    this.privateState = {};
    this.contractAddress = dummyContractAddress();

    const state = publicStateHex === null
      ? this.contract.initialState(createConstructorContext(this.privateState), pureCircuits.deriveAdminKey(this.sampleAuthority.adminSecret), randomBytes32()).currentContractState
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

  authorizeSample(material) {
    this.contract.witnesses = recordWitnesses(material, this.sampleAuthority);
    const key = pureCircuits.deriveIssuerKey(this.sampleAuthority.issuerSecret);
    if (!this.getLedgerState().issuerKeys.member(key)) this.callCircuit('registerIssuer', key);
    const marker = authorizationFor(material, this.getLedgerState().authorizationScope);
    if (!this.getLedgerState().recordAuthorizations.member(marker)) this.callCircuit('authorizeRecord');
  }
}

function stateBytes(hex) {
  if (typeof hex !== 'string' || hex.length > 2 * 1024 * 1024 || !/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new Error('Invalid saved public ledger. Complete the seller flow again.');
  }
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => parseInt(byte, 16));
}

export function createSellerWitnesses(material) {
  return recordWitnesses(material);
}

export function createCheckWitnesses(material) {
  return recordWitnesses(material);
}

export function ledgerSnapshot(sim) {
  const state = sim.getLedgerState();
  return {
    counter: state.counter.toString(),
    treeRoot: state.commitments.root().field.toString(16).padStart(64, '0'),
    commitmentCount: state.commitments.firstFree().toString(),
    nullifiers: [...state.nullifiers].map(bytesToHex),
    issuerKeys: [...state.issuerKeys].map(bytesToHex),
    authorizationCount: state.recordAuthorizations.size().toString(),
  };
}

export function materialFromExport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Invalid session file');
  const versionRaw = String(obj.versionNum ?? obj.version ?? '');
  if (!/^\d+$/.test(versionRaw) || BigInt(versionRaw) > 65535n) {
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
    format: 'quest-attestation-issuer-session-v4',
    questIdHex: bytesToHex(material.questId),
    versionNum: String(material.version),
    userSecretHex: bytesToHex(material.userSecret),
    localSecretKeyHex: bytesToHex(material.localSecretKey),
    saltHex: bytesToHex(material.salt),
  };
}

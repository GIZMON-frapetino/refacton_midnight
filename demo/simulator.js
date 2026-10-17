import { randomBytes } from 'node:crypto';
import { Contract, ledger } from '../compiled/contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  DUMMY_ADDRESS,
} from '@midnight-ntwrk/compact-runtime';

const bytes = () => new Uint8Array(randomBytes(32));
const hex = (value) => Buffer.from(value).toString('hex');

// All witness values live only in this local Node process, not in HTTP responses.
export class QuestSimulator {
  #data;
  #contract;
  #context;
  #condition = null;
  #events = [];
  #outcome = null;
  #recordOutcome = null;
  #registrationCommitment = null;
  #nextChallenge = bytes();

  constructor() {
    this.#data = {
      questId: bytes(),
      version: 1n,
      userSecret: bytes(),
      localSecretKey: bytes(),
      salt: bytes(),
    };
    this.#contract = new Contract(this.#witnesses());
    const initial = this.#contract.initialState(createConstructorContext({}));
    this.#context = createCircuitContext(
      dummyContractAddress(),
      DUMMY_ADDRESS,
      initial.currentContractState,
      {},
    );
  }

  #witnesses(wrongSecret = false) {
    const data = this.#data;
    const secret = wrongSecret ? bytes() : data.userSecret;
    return {
      questId: () => [{}, data.questId],
      versionNum: () => [{}, data.version],
      userSecret: () => [{}, secret],
      localSecretKey: () => [{}, data.localSecretKey],
      saltValue: () => [{}, data.salt],
    };
  }

  #call(name, ...args) {
    const result = this.#contract.circuits[name](this.#context, ...args);
    // Identical context chaining to the original Jest simulator.
    this.#context = result.context;
    return result.result;
  }

  #ledger() {
    return ledger(this.#context.currentQueryContext.state);
  }

  #event(circuit, status, commitment = null) {
    this.#events.unshift({
      circuit,
      status,
      time: new Date().toISOString(),
      counter: this.#ledger().counter.toString(),
      commitment,
    });
    this.#events = this.#events.slice(0, 12);
  }

  record() {
    this.#contract.witnesses = this.#witnesses();
    try {
      this.#call('recordQuest');
      // Values displayed on the page are read from the actual generated ledger.
      this.#registrationCommitment = [...this.#ledger().commitments].map(hex)[0];
      this.#recordOutcome = 'recorded';
      this.#event('recordQuest', 'recorded', this.#registrationCommitment);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Quest already recorded by this user')) {
        throw error;
      }
      this.#recordOutcome = 'duplicate';
      this.#event('recordQuest', 'duplicate');
    }
    return this.snapshot();
  }

  setCondition({ questChoice = 'recorded', challenge } = {}) {
    if (!['recorded', 'other'].includes(questChoice)) {
      throw new Error('INVALID_CONDITION');
    }
    if (typeof challenge !== 'string' || !/^[a-fA-F0-9]{64}$/.test(challenge)) {
      throw new Error('INVALID_CHALLENGE');
    }
    this.#condition = {
      questId: questChoice === 'recorded' ? this.#data.questId : bytes(),
      challenge: new Uint8Array(Buffer.from(challenge, 'hex')),
      questChoice,
    };
    this.#outcome = null;
    this.#nextChallenge = bytes();
    return this.snapshot();
  }

  respond({ wrongSecret = false } = {}) {
    if (!this.#condition) throw new Error('CONDITION_REQUIRED');
    if (typeof wrongSecret !== 'boolean') throw new Error('INVALID_INPUT');
    this.#contract.witnesses = this.#witnesses(wrongSecret);
    try {
      const response = this.#call(
        'checkAttestation',
        this.#condition.challenge,
        this.#condition.questId,
      );
      if (!(response instanceof Uint8Array) || response.length !== 32) {
        throw new Error('UNEXPECTED_RESULT');
      }
      this.#outcome = 'match';
      this.#event('checkAttestation', 'match', this.#registrationCommitment);
      // The circuit returns bytes; the requester UI gets only the match outcome.
      // The response bytes and the private transcript never cross HTTP.
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Attestation not found')) {
        throw error;
      }
      this.#outcome = 'no_match';
      this.#event('checkAttestation', 'no_match');
    } finally {
      this.#contract.witnesses = this.#witnesses();
    }
    return this.snapshot();
  }

  snapshot() {
    const state = this.#ledger();
    return {
      mode: 'local-simulator',
      counter: state.counter.toString(),
      commitments: [...state.commitments].map(hex),
      nullifiers: [...state.nullifiers].map(hex),
      condition: this.#condition ? {
        questId: hex(this.#condition.questId),
        challenge: hex(this.#condition.challenge),
        questChoice: this.#condition.questChoice,
      } : null,
      nextChallenge: hex(this.#nextChallenge),
      outcome: this.#outcome,
      recordOutcome: this.#recordOutcome,
      events: this.#events,
    };
  }
}

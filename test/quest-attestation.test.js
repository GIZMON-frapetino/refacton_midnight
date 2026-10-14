/**
 * Quest Attestation Contract Tests
 * 
 * Tests use the compiled contract with Midnight Compact runtime 0.16.0
 * Following official Midnight example pattern for state chaining
 * 
 * Requirements: Compact compiler 0.31.1, @midnight-ntwrk/compact-runtime 0.16.0
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { randomBytes } from 'crypto';
import { Contract, ledger } from '../compiled/contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  DUMMY_ADDRESS
} from '@midnight-ntwrk/compact-runtime';

/**
 * Simulator class for testing the contract
 * Manages state transitions between circuit calls using official pattern
 */
class ContractSimulator {
  constructor(witnesses) {
    this.contract = new Contract(witnesses);
    this.privateState = {};
    this.contractAddress = dummyContractAddress();
    
    // Initialize contract state
    const initialContext = createConstructorContext(this.privateState);
    const initialResult = this.contract.initialState(initialContext);
    
    // Create initial circuit context
    this.circuitContext = createCircuitContext(
      this.contractAddress,
      DUMMY_ADDRESS,
      initialResult.currentContractState,
      this.privateState
    );
  }

  /**
   * Call a circuit and update the internal context
   * Pattern: this.circuitContext = result.context
   */
  callCircuit(circuitName, ...args) {
    // Call the circuit with current context
    const result = this.contract.circuits[circuitName](this.circuitContext, ...args);

    // Update context from the result (official pattern)
    this.circuitContext = result.context;

    return result;
  }

  /**
   * Get the current ledger state
   * Pattern: ledger(this.circuitContext.currentQueryContext.state)
   */
  getLedgerState() {
    // Extract state from currentQueryContext
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}

describe('QuestAttestation Contract', () => {
  let simulator;
  let testData;

  beforeEach(() => {
    // Generate test data as Uint8Array for consistency with contract
    testData = {
      questId: new Uint8Array(randomBytes(32)),
      version: 1n,
      userSecret: new Uint8Array(randomBytes(32)),
      salt: new Uint8Array(randomBytes(32)),
      nullifier: new Uint8Array(randomBytes(32))
    };

    // Create witnesses that return test data
    const witnesses = {
      questId: (context) => [{}, testData.questId],
      versionNum: (context) => [{}, testData.version],
      userSecret: (context) => [{}, testData.userSecret],
      saltValue: (context) => [{}, testData.salt]
    };

    simulator = new ContractSimulator(witnesses);
  });

  describe('recordQuest circuit', () => {
    test('should successfully record a quest attestation', () => {
      const initialState = simulator.getLedgerState();
      expect(initialState.counter).toBe(0n);
      expect(initialState.isSet).toBe(false);

      // Record quest
      const result = simulator.callCircuit('recordQuest', testData.nullifier);
      
      // Check result structure
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('proofData');

      // Check updated state
      const newState = simulator.getLedgerState();
      expect(newState.isSet).toBe(true);
      expect(newState.counter).toBe(1n);
      expect(newState.nullifier).toEqual(testData.nullifier);
      expect(newState.commitment).toBeInstanceOf(Uint8Array);
      expect(newState.commitment.length).toBe(32);
    });

    test('should reject duplicate nullifier (double recording)', () => {
      // Record first attestation
      simulator.callCircuit('recordQuest', testData.nullifier);

      // Attempt to record again (slot already used)
      expect(() => {
        simulator.callCircuit('recordQuest', randomBytes(32));
      }).toThrow(/Slot already used/);
    });

    test('should increment counter correctly', () => {
      const initialState = simulator.getLedgerState();
      expect(initialState.counter).toBe(0n);

      // Record attestation
      simulator.callCircuit('recordQuest', testData.nullifier);

      const finalState = simulator.getLedgerState();
      expect(finalState.counter).toBe(1n);
    });
  });

  describe('checkAttestation circuit (selective disclosure)', () => {
    test('should pass check for existing attestation with correct inputs', () => {
      // Record attestation
      simulator.callCircuit('recordQuest', testData.nullifier);
      const state = simulator.getLedgerState();

      // Check attestation with correct commitment should not throw
      expect(() => {
        simulator.callCircuit('checkAttestation', state.commitment);
      }).not.toThrow();
    });

    test('should fail check with wrong commitment', () => {
      // Record attestation
      simulator.callCircuit('recordQuest', testData.nullifier);

      // Check with wrong commitment should throw
      const wrongCommitment = randomBytes(32);
      expect(() => {
        simulator.callCircuit('checkAttestation', wrongCommitment);
      }).toThrow(/Attestation check failed/);
    });

    test('should fail check with wrong secret', () => {
      // Record with original witnesses
      simulator.callCircuit('recordQuest', testData.nullifier);
      const state = simulator.getLedgerState();

      // Create new simulator with different secret
      const wrongWitnesses = {
        questId: (context) => [{}, testData.questId],
        versionNum: (context) => [{}, testData.version],
        userSecret: (context) => [{}, randomBytes(32)], // Different secret
        saltValue: (context) => [{}, testData.salt]
      };

      const wrongSimulator = new ContractSimulator(wrongWitnesses);
      // Copy the context to same state
      wrongSimulator.circuitContext = { ...simulator.circuitContext };

      // Check should fail because commitment won't match
      expect(() => {
        wrongSimulator.callCircuit('checkAttestation', state.commitment);
      }).toThrow(/Attestation check failed/);
    });
  });

  describe('hasCommitment circuit', () => {
    test('should return true for recorded commitment', () => {
      // Record attestation
      simulator.callCircuit('recordQuest', testData.nullifier);
      const state = simulator.getLedgerState();

      // Query commitment
      const result = simulator.callCircuit('hasCommitment', state.commitment);
      expect(result.result).toBe(true);
    });

    test('should return false for non-existent commitment', () => {
      const fakeCommitment = randomBytes(32);
      const result = simulator.callCircuit('hasCommitment', fakeCommitment);
      expect(result.result).toBe(false);
    });
  });

  describe('hasNullifier circuit', () => {
    test('should return true for used nullifier', () => {
      // Record attestation
      simulator.callCircuit('recordQuest', testData.nullifier);

      // Query nullifier
      const result = simulator.callCircuit('hasNullifier', testData.nullifier);
      expect(result.result).toBe(true);
    });

    test('should return false for unused nullifier', () => {
      const unusedNullifier = randomBytes(32);
      const result = simulator.callCircuit('hasNullifier', unusedNullifier);
      expect(result.result).toBe(false);
    });
  });

  describe('getCounterValue circuit', () => {
    test('should return 0 for initial state', () => {
      const result = simulator.callCircuit('getCounterValue');
      expect(result.result).toBe(0n);
    });

    test('should return 1 after recording one attestation', () => {
      simulator.callCircuit('recordQuest', testData.nullifier);
      const result = simulator.callCircuit('getCounterValue');
      expect(result.result).toBe(1n);
    });
  });

  describe('privacy model', () => {
    test('should demonstrate selective disclosure without revealing secrets', () => {
      // Record attestation
      simulator.callCircuit('recordQuest', testData.nullifier);
      const state = simulator.getLedgerState();

      // Public ledger only has commitment (hash), nullifier, and flags
      expect(state.commitment).toBeInstanceOf(Uint8Array);
      expect(state.commitment.length).toBe(32);
      expect(state.nullifier).toEqual(testData.nullifier);
      expect(state.isSet).toBe(true);
      expect(state.counter).toBe(1n);

      // Quest details (questId, userSecret, salt) are private
      // Only the user with correct witnesses can check the attestation

      // User with correct witnesses can check successfully
      expect(() => {
        simulator.callCircuit('checkAttestation', state.commitment);
      }).not.toThrow();

      // Someone without correct secret cannot check
      const wrongWitnesses = {
        questId: (context) => [{}, testData.questId],
        versionNum: (context) => [{}, testData.version],
        userSecret: (context) => [{}, randomBytes(32)],
        saltValue: (context) => [{}, testData.salt]
      };
      const wrongSimulator = new ContractSimulator(wrongWitnesses);
      wrongSimulator.circuitContext = { ...simulator.circuitContext };

      expect(() => {
        wrongSimulator.callCircuit('checkAttestation', state.commitment);
      }).toThrow();
    });
  });
});

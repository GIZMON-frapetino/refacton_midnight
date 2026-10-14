/**
 * Quest Attestation Contract Tests
 * 
 * Tests use the Midnight Compact runtime with the compiled contract
 * 
 * Requirements: Compact toolchain 0.31.1, @midnight-ntwrk/compact-runtime 0.16.0
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { randomBytes } from 'crypto';
import { Contract, ledger } from '../compiled/contract/index.js';
import { createCircuitContext, createConstructorContext } from '@midnight-ntwrk/compact-runtime';

describe('QuestAttestation Contract', () => {
  let contract;
  let privateState;
  let testData;

  beforeEach(() => {
    // Generate test data
    testData = {
      questId: randomBytes(32),
      version: 1,
      userSecret: randomBytes(32),
      salt: randomBytes(32),
      nullifier: randomBytes(32)
    };

    // Initialize private state
    privateState = {
      questId: testData.questId,
      version: testData.version,
      userSecret: testData.userSecret,
      salt: testData.salt
    };

    // Create contract instance with witnesses
    const witnesses = {
      questId: (context) => [privateState, privateState.questId],
      versionNum: (context) => [privateState, BigInt(privateState.version)],
      userSecret: (context) => [privateState, privateState.userSecret],
      saltValue: (context) => [privateState, privateState.salt]
    };

    contract = new Contract(witnesses);
  });

  describe('recordQuest', () => {
    test('should successfully record a quest attestation', () => {
      // Get initial state
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      
      // Create circuit context
      const context = createCircuitContext(privateState, initialResult.currentContractState);

      // Call recordQuest circuit
      const result = contract.circuits.recordQuest(context, testData.nullifier);
      
      // Extract ledger state
      const state = ledger(result.currentContractState);

      // Check that commitment was recorded
      expect(state.commitment).toBeInstanceOf(Uint8Array);
      expect(state.commitment.length).toBe(32);
      
      // Check that nullifier was recorded
      expect(state.nullifier).toEqual(testData.nullifier);
      
      // Check that isSet flag is true
      expect(state.isSet).toBe(true);
      
      // Check that counter was incremented
      expect(state.counter).toBe(1n);
    });

    test('should reject recording when slot already used', () => {
      // First recording
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const result1 = contract.circuits.recordQuest(context1, testData.nullifier);
      
      // Attempt second recording on same slot
      const context2 = createCircuitContext(privateState, result1.currentContractState);

      // Should fail with assertion error
      expect(() => {
        contract.circuits.recordQuest(context2, randomBytes(32));
      }).toThrow();
    });

    test('should increment counter correctly', () => {
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context = createCircuitContext(privateState, initialResult.currentContractState);

      const result = contract.circuits.recordQuest(context, testData.nullifier);
      const state = ledger(result.currentContractState);

      expect(state.counter).toBe(1n);
    });
  });

  describe('checkAttestation (selective disclosure)', () => {
    test('should pass check for existing attestation with correct inputs', () => {
      // First record the attestation
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);
      const recordedState = ledger(recordResult.currentContractState);

      // Now check attestation with the correct commitment
      const context2 = createCircuitContext(privateState, recordResult.currentContractState);
      
      // Should not throw (assertion passes)
      expect(() => {
        contract.circuits.checkAttestation(context2, recordedState.commitment);
      }).not.toThrow();
    });

    test('should fail check with wrong secret', () => {
      // Record with one set of data
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);
      const recordedState = ledger(recordResult.currentContractState);

      // Try to check with different secret
      const wrongPrivateState = {
        ...privateState,
        userSecret: randomBytes(32) // wrong secret
      };

      // Create new contract with wrong witnesses
      const wrongWitnesses = {
        questId: (context) => [wrongPrivateState, wrongPrivateState.questId],
        versionNum: (context) => [wrongPrivateState, BigInt(wrongPrivateState.version)],
        userSecret: (context) => [wrongPrivateState, wrongPrivateState.userSecret],
        saltValue: (context) => [wrongPrivateState, wrongPrivateState.salt]
      };
      const wrongContract = new Contract(wrongWitnesses);

      const context2 = createCircuitContext(wrongPrivateState, recordResult.currentContractState);

      // Should fail because commitment won't match
      expect(() => {
        wrongContract.circuits.checkAttestation(context2, recordedState.commitment);
      }).toThrow();
    });

    test('should fail check with wrong commitment', () => {
      // Record attestation
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);

      // Try to check with wrong commitment
      const context2 = createCircuitContext(privateState, recordResult.currentContractState);

      expect(() => {
        contract.circuits.checkAttestation(context2, randomBytes(32));
      }).toThrow();
    });
  });

  describe('query circuits', () => {
    test('hasCommitment should return true for recorded commitment', () => {
      // Record attestation
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);
      const recordedState = ledger(recordResult.currentContractState);

      // Query commitment
      const context2 = createCircuitContext(privateState, recordResult.currentContractState);
      const hasCommResult = contract.circuits.hasCommitment(context2, recordedState.commitment);

      expect(hasCommResult.value).toBe(true);
    });

    test('hasCommitment should return false for non-existent commitment', () => {
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context = createCircuitContext(privateState, initialResult.currentContractState);

      const result = contract.circuits.hasCommitment(context, randomBytes(32));
      expect(result.value).toBe(false);
    });

    test('hasNullifier should return true for used nullifier', () => {
      // Record attestation
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);

      // Query nullifier
      const context2 = createCircuitContext(privateState, recordResult.currentContractState);
      const hasNullResult = contract.circuits.hasNullifier(context2, testData.nullifier);

      expect(hasNullResult.value).toBe(true);
    });

    test('hasNullifier should return false for unused nullifier', () => {
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context = createCircuitContext(privateState, initialResult.currentContractState);

      const result = contract.circuits.hasNullifier(context, randomBytes(32));
      expect(result.value).toBe(false);
    });

    test('getCounterValue should return correct count', () => {
      // Initial counter
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const initialCounterResult = contract.circuits.getCounterValue(context1);
      expect(initialCounterResult.value).toBe(0n);

      // After recording
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);
      const context2 = createCircuitContext(privateState, recordResult.currentContractState);
      const afterResult = contract.circuits.getCounterValue(context2);
      expect(afterResult.value).toBe(1n);
    });
  });

  describe('privacy model', () => {
    test('should demonstrate selective disclosure', () => {
      // Record attestation
      const initialContext = createConstructorContext(privateState);
      const initialResult = contract.initialState(initialContext);
      const context1 = createCircuitContext(privateState, initialResult.currentContractState);
      const recordResult = contract.circuits.recordQuest(context1, testData.nullifier);
      const recordedState = ledger(recordResult.currentContractState);

      // Public ledger only has commitment (hash) and nullifier
      expect(recordedState.commitment).toBeInstanceOf(Uint8Array);
      expect(recordedState.nullifier).toEqual(testData.nullifier);
      expect(recordedState.isSet).toBe(true);

      // Quest details remain private (witnesses)
      // Only the user with correct inputs can check the attestation
      const context2 = createCircuitContext(privateState, recordResult.currentContractState);

      // This succeeds because we have the right private inputs
      expect(() => {
        contract.circuits.checkAttestation(context2, recordedState.commitment);
      }).not.toThrow();

      // Someone without correct secret cannot check it
      const wrongPrivateState = {
        ...privateState,
        userSecret: randomBytes(32)
      };
      const wrongWitnesses = {
        questId: (context) => [wrongPrivateState, wrongPrivateState.questId],
        versionNum: (context) => [wrongPrivateState, BigInt(wrongPrivateState.version)],
        userSecret: (context) => [wrongPrivateState, wrongPrivateState.userSecret],
        saltValue: (context) => [wrongPrivateState, wrongPrivateState.salt]
      };
      const wrongContract = new Contract(wrongWitnesses);
      const wrongContext = createCircuitContext(wrongPrivateState, recordResult.currentContractState);

      expect(() => {
        wrongContract.circuits.checkAttestation(wrongContext, recordedState.commitment);
      }).toThrow();
    });
  });
});

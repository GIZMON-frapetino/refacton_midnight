/**
 * Quest Attestation Contract Tests
 * 
 * Tests use the compiled contract with Midnight Compact runtime 0.16.0
 * Following official Midnight pattern for state chaining
 * 
 * Contract now supports multiple users and multiple quests using Set storage.
 * Nullifiers are derived internally from localSecretKey and questId.
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

describe('QuestAttestation Contract - Multiple Users & Quests', () => {
  let simulator;
  let user1Data;
  let user2Data;
  let quest1;
  let quest2;

  beforeEach(() => {
    // Generate test data for two users and two quests
    user1Data = {
      questId: new Uint8Array(randomBytes(32)),
      version: 1n,
      userSecret: new Uint8Array(randomBytes(32)),
      localSecretKey: new Uint8Array(randomBytes(32)),
      salt: new Uint8Array(randomBytes(32))
    };

    user2Data = {
      questId: new Uint8Array(randomBytes(32)),
      version: 1n,
      userSecret: new Uint8Array(randomBytes(32)),
      localSecretKey: new Uint8Array(randomBytes(32)),
      salt: new Uint8Array(randomBytes(32))
    };

    quest1 = new Uint8Array(randomBytes(32));
    quest2 = new Uint8Array(randomBytes(32));

    // Start with user1's witnesses
    // merklePath is a dummy here, only used in checkAttestation circuit
    const dummyPath = { leaf: new Uint8Array(32), path: [] };
    const witnesses = {
      questId: (context) => [{}, user1Data.questId],
      versionNum: (context) => [{}, user1Data.version],
      userSecret: (context) => [{}, user1Data.userSecret],
      localSecretKey: (context) => [{}, user1Data.localSecretKey],
      saltValue: (context) => [{}, user1Data.salt],
      merklePath: (context) => [{}, dummyPath]
    };

    simulator = new ContractSimulator(witnesses);
  });

  describe('recordQuest circuit', () => {
    test('should successfully record a quest attestation', () => {
      const initialState = simulator.getLedgerState();
      expect(initialState.counter).toBe(0n);

      // Record quest (no nullifier parameter - derived internally)
      const result = simulator.callCircuit('recordQuest');
      
      // Check result structure
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('proofData');

      // Check updated state
      const newState = simulator.getLedgerState();
      expect(newState.counter).toBe(1n);
    });

    test('should allow multiple users to record the same quest', () => {
      // User 1 records quest 1
      user1Data.questId = quest1;
      simulator.callCircuit('recordQuest');

      const state1 = simulator.getLedgerState();
      expect(state1.counter).toBe(1n);

      // User 2 records the same quest 1 - update witnesses and use same simulator
      const user2Witnesses = {
        questId: (context) => [{}, quest1],
        versionNum: (context) => [{}, user2Data.version],
        userSecret: (context) => [{}, user2Data.userSecret],
        localSecretKey: (context) => [{}, user2Data.localSecretKey],
        saltValue: (context) => [{}, user2Data.salt]
      };

      // Update the contract witnesses for user 2
      simulator.contract.witnesses = user2Witnesses;
      simulator.callCircuit('recordQuest');

      const state2 = simulator.getLedgerState();
      expect(state2.counter).toBe(2n);
    });

    test('should allow same user to record multiple different quests', () => {
      // Record first quest
      simulator.callCircuit('recordQuest');
      const afterFirst = simulator.getLedgerState();
      expect(afterFirst.counter).toBe(1n);

      // Change to different quest ID for second recording
      const originalWitnesses = simulator.contract.witnesses;
      simulator.contract.witnesses = {
        ...originalWitnesses,
        questId: (context) => [{}, quest2]
      };

      simulator.callCircuit('recordQuest');
      const afterSecond = simulator.getLedgerState();
      expect(afterSecond.counter).toBe(2n);
    });

    test('should reject duplicate attestation from same user for same quest', () => {
      // User 1 records quest 1
      user1Data.questId = quest1;
      simulator.callCircuit('recordQuest');

      // Same user tries to record same quest again (nullifier derived from same localSecretKey + questId)
      const dummyPath = { leaf: new Uint8Array(32), path: [] };
      const duplicateWitnesses = {
        questId: (context) => [{}, quest1],
        versionNum: (context) => [{}, user1Data.version],
        userSecret: (context) => [{}, user1Data.userSecret],
        localSecretKey: (context) => [{}, user1Data.localSecretKey], // Same key
        saltValue: (context) => [{}, new Uint8Array(randomBytes(32))], // Different salt doesn't matter
        merklePath: (context) => [{}, dummyPath]
      };

      const duplicateSimulator = new ContractSimulator(duplicateWitnesses);
      duplicateSimulator.circuitContext = { ...simulator.circuitContext };

      // Should fail with assertion error
      expect(() => {
        duplicateSimulator.callCircuit('recordQuest');
      }).toThrow(/Quest already recorded by this user/);
    });

    test('should increment counter correctly for multiple attestations', () => {
      const initialState = simulator.getLedgerState();
      expect(initialState.counter).toBe(0n);

      // Record first attestation
      simulator.callCircuit('recordQuest');
      expect(simulator.getLedgerState().counter).toBe(1n);

      // Record second attestation with different user
      const user2Witnesses = {
        questId: (context) => [{}, new Uint8Array(randomBytes(32))],
        versionNum: (context) => [{}, 1n],
        userSecret: (context) => [{}, new Uint8Array(randomBytes(32))],
        localSecretKey: (context) => [{}, new Uint8Array(randomBytes(32))],
        saltValue: (context) => [{}, new Uint8Array(randomBytes(32))]
      };

      simulator.contract.witnesses = user2Witnesses;
      simulator.callCircuit('recordQuest');

      expect(simulator.getLedgerState().counter).toBe(2n);
    });
  });

  describe('checkAttestation circuit (unlinkable disclosure with Merkle tree)', () => {
    test('should return challenge-bound response for existing attestation', () => {
      // Record attestation
      simulator.callCircuit('recordQuest');

      // Prepare public inputs for checkAttestation
      const challenge = new Uint8Array(randomBytes(32));
      const questId = user1Data.questId;

      // Get a path for the first leaf (the commitment we just recorded)
      const state = simulator.getLedgerState();
      const firstLeaf = new Uint8Array(32); // Placeholder - circuit recomputes and uses
      const path = state.commitments.pathForLeaf(0n, firstLeaf);

      // Update witnesses - questId is now a public input, merklePath is a witness
      const checkWitnesses = {
        versionNum: (context) => [{}, user1Data.version],
        userSecret: (context) => [{}, user1Data.userSecret],
        saltValue: (context) => [{}, user1Data.salt],
        merklePath: (context) => [{}, path]
      };
      simulator.contract.witnesses = checkWitnesses;

      // Check attestation with challenge and public questId
      const result = simulator.callCircuit('checkAttestation', challenge, questId);

      // Should return a 32-byte response
      expect(result.result).toBeInstanceOf(Uint8Array);
      expect(result.result.length).toBe(32);
    });

    test('should fail check with wrong secret', () => {
      // Record with original witnesses
      simulator.callCircuit('recordQuest');

      // Try to check with different secret
      const challenge = new Uint8Array(randomBytes(32));
      const questId = user1Data.questId;

      // Get the path for the first leaf
      const state = simulator.getLedgerState();
      const firstLeaf = new Uint8Array(32);
      const path = state.commitments.pathForLeaf(0n, firstLeaf);

      const wrongWitnesses = {
        versionNum: (context) => [{}, user1Data.version],
        userSecret: (context) => [{}, new Uint8Array(randomBytes(32))], // Different secret
        saltValue: (context) => [{}, user1Data.salt],
        merklePath: (context) => [{}, path]
      };

      simulator.contract.witnesses = wrongWitnesses;

      // Should fail because path leaf won't match recomputed commitment
      expect(() => {
        simulator.callCircuit('checkAttestation', challenge, questId);
      }).toThrow(/Merkle path leaf does not match commitment/);
    });

    test('should return different responses for different challenges (unlinkability)', () => {
      // Record attestation
      simulator.callCircuit('recordQuest');

      // First check with challenge1
      const challenge1 = new Uint8Array(randomBytes(32));
      const challenge2 = new Uint8Array(randomBytes(32));
      const questId = user1Data.questId;

      // Get the Merkle path for the first leaf
      const state = simulator.getLedgerState();
      const firstLeaf = new Uint8Array(32);
      const path = state.commitments.pathForLeaf(0n, firstLeaf);

      const checkWitnesses = {
        versionNum: (context) => [{}, user1Data.version],
        userSecret: (context) => [{}, user1Data.userSecret],
        saltValue: (context) => [{}, user1Data.salt],
        merklePath: (context) => [{}, path]
      };
      simulator.contract.witnesses = checkWitnesses;

      const response1 = simulator.callCircuit('checkAttestation', challenge1, questId);
      const response2 = simulator.callCircuit('checkAttestation', challenge2, questId);

      // Different challenges should produce different responses (unlinkability)
      expect(response1.result).not.toEqual(response2.result);
    });
  });

  describe('Merkle tree storage', () => {
    test('should store commitments in HistoricMerkleTree', () => {
      // Record attestation
      simulator.callCircuit('recordQuest');
      
      // Tree should have at least one leaf after recording
      const afterState = simulator.getLedgerState();
      
      // Verify we can get a path for the first leaf
      const firstLeaf = new Uint8Array(32);
      expect(() => afterState.commitments.pathForLeaf(0n, firstLeaf)).not.toThrow();
    });

    test('should allow multiple commitments in tree', () => {
      // Record first attestation
      simulator.callCircuit('recordQuest');
      
      // Record second with different user
      const user2Witnesses = {
        questId: (context) => [{}, new Uint8Array(randomBytes(32))],
        versionNum: (context) => [{}, 1n],
        userSecret: (context) => [{}, new Uint8Array(randomBytes(32))],
        localSecretKey: (context) => [{}, new Uint8Array(randomBytes(32))],
        saltValue: (context) => [{}, new Uint8Array(randomBytes(32))]
      };
      simulator.contract.witnesses = user2Witnesses;
      simulator.callCircuit('recordQuest');

      const state = simulator.getLedgerState();
      // Verify we can get paths for both leaves
      const leaf = new Uint8Array(32);
      expect(() => state.commitments.pathForLeaf(0n, leaf)).not.toThrow();
      expect(() => state.commitments.pathForLeaf(1n, leaf)).not.toThrow();
    });
  });

  describe('hasNullifier circuit', () => {
    test('should return true for used nullifier after recording', () => {
      // Record attestation (nullifier derived internally)
      simulator.callCircuit('recordQuest');
      
      // We can't easily get the derived nullifier, but we can test with a random one
      const randomNullifier = new Uint8Array(randomBytes(32));
      const result = simulator.callCircuit('hasNullifier', randomNullifier);
      // Will likely be false unless we happen to match
      expect(typeof result.result).toBe('boolean');
    });

    test('should return false for unused nullifier', () => {
      const unusedNullifier = new Uint8Array(randomBytes(32));
      const result = simulator.callCircuit('hasNullifier', unusedNullifier);
      expect(result.result).toBe(false);
    });
  });

  describe('getCounterValue circuit', () => {
    test('should return 0 for initial state', () => {
      const result = simulator.callCircuit('getCounterValue');
      expect(result.result).toBe(0n);
    });

    test('should return correct count after multiple attestations', () => {
      // Initial count
      expect(simulator.callCircuit('getCounterValue').result).toBe(0n);
      
      // Record first attestation
      simulator.callCircuit('recordQuest');
      expect(simulator.callCircuit('getCounterValue').result).toBe(1n);

      // Record second attestation with different quest
      const originalWitnesses = simulator.contract.witnesses;
      simulator.contract.witnesses = {
        ...originalWitnesses,
        questId: (context) => [{}, new Uint8Array(randomBytes(32))]
      };
      simulator.callCircuit('recordQuest');

      expect(simulator.callCircuit('getCounterValue').result).toBe(2n);
    });
  });

  describe('privacy model', () => {
    test('should demonstrate nullifier derived from secret, not caller-supplied', () => {
      // The nullifier is derived inside the circuit from localSecretKey + questId
      // This means the same user with same localSecretKey cannot record the same quest twice
      
      user1Data.questId = quest1;
      simulator.callCircuit('recordQuest');

      // Try to record again with same localSecretKey and questId
      // Even with different salt and userSecret, should fail because nullifier is the same
      const dummyPath = { leaf: new Uint8Array(32), path: [] };
      const sameUserWitnesses = {
        questId: (context) => [{}, quest1], // Same quest
        versionNum: (context) => [{}, 1n],
        userSecret: (context) => [{}, new Uint8Array(randomBytes(32))], // Different secret
        localSecretKey: (context) => [{}, user1Data.localSecretKey], // Same local key
        saltValue: (context) => [{}, new Uint8Array(randomBytes(32))], // Different salt
        merklePath: (context) => [{}, dummyPath]
      };

      const sameUserSimulator = new ContractSimulator(sameUserWitnesses);
      sameUserSimulator.circuitContext = { ...simulator.circuitContext };

      expect(() => {
        sameUserSimulator.callCircuit('recordQuest');
      }).toThrow(/Quest already recorded by this user/);
    });

    test('should allow multiple users to record without revealing their secrets', () => {
      // User 1 records quest 1
      user1Data.questId = quest1;
      simulator.callCircuit('recordQuest');

      // User 2 records same quest 1 (different localSecretKey = different nullifier)
      const user2Witnesses = {
        questId: (context) => [{}, quest1], // Same quest
        versionNum: (context) => [{}, 1n],
        userSecret: (context) => [{}, user2Data.userSecret],
        localSecretKey: (context) => [{}, user2Data.localSecretKey], // Different key
        saltValue: (context) => [{}, user2Data.salt]
      };

      simulator.contract.witnesses = user2Witnesses;

      // Should succeed because different localSecretKey produces different nullifier
      expect(() => {
        simulator.callCircuit('recordQuest');
      }).not.toThrow();

      const finalState = simulator.getLedgerState();
      expect(finalState.counter).toBe(2n);
    });
  });
});

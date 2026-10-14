/**
 * Quest Attestation Contract Tests
 * 
 * These tests use the Midnight simulator to test the contract locally
 * without requiring network deployment.
 * 
 * Requires: Compact toolchain 0.31.x and matching Midnight JS packages
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { randomBytes, createHash } from 'crypto';

// Note: These imports would work with actual Midnight SDK 0.31.x installation
// import { createSimulator } from '@midnight-ntwrk/midnight-js-contracts';
// import contract from '../contract/quest-attestation.compact.js';

// Mock implementation for demonstration (replace with actual SDK when toolchain is installed)
class MockSimulator {
  constructor() {
    this.state = {
      commitments: new Map(),
      nullifiers: new Map(),
      counter: 0
    };
  }

  async recordQuest(questId, version, userSecret, salt, nullifier) {
    // Compute commitment
    const commitmentData = Buffer.concat([
      Buffer.from(questId, 'hex'),
      Buffer.from(version.toString(16).padStart(4, '0'), 'hex'),
      Buffer.from(userSecret, 'hex'),
      Buffer.from(salt, 'hex')
    ]);
    const commitment = createHash('sha256').update(commitmentData).digest('hex');

    // Check nullifier
    if (this.state.nullifiers.has(nullifier)) {
      throw new Error('Nullifier already used');
    }

    // Record on ledger
    this.state.commitments.set(commitment, true);
    this.state.nullifiers.set(nullifier, true);
    this.state.counter += 1;

    return { commitment, counter: this.state.counter };
  }

  async checkAttestation(questId, version, userSecret, salt, expectedResult) {
    const commitmentData = Buffer.concat([
      Buffer.from(questId, 'hex'),
      Buffer.from(version.toString(16).padStart(4, '0'), 'hex'),
      Buffer.from(userSecret, 'hex'),
      Buffer.from(salt, 'hex')
    ]);
    const commitment = createHash('sha256').update(commitmentData).digest('hex');

    const exists = this.state.commitments.has(commitment);
    
    if (exists !== expectedResult) {
      throw new Error('Attestation check failed');
    }

    return { commitment, exists };
  }

  hasCommitment(commitment) {
    return this.state.commitments.has(commitment);
  }

  hasNullifier(nullifier) {
    return this.state.nullifiers.has(nullifier);
  }

  getCounter() {
    return this.state.counter;
  }
}

describe('QuestAttestation Contract', () => {
  let simulator;
  let testData;

  beforeEach(() => {
    // Initialize simulator with fresh state
    simulator = new MockSimulator();
    
    // Generate test data
    testData = {
      questId: randomBytes(32).toString('hex'),
      version: 1,
      userSecret: randomBytes(32).toString('hex'),
      salt: randomBytes(32).toString('hex'),
      nullifier: randomBytes(32).toString('hex')
    };
  });

  describe('recordQuest', () => {
    test('should successfully record a quest attestation', async () => {
      const initialCounter = simulator.getCounter();
      
      const result = await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // Check counter incremented
      expect(result.counter).toBe(initialCounter + 1);
      
      // Check commitment was recorded
      expect(simulator.hasCommitment(result.commitment)).toBe(true);
      
      // Check nullifier was recorded
      expect(simulator.hasNullifier(testData.nullifier)).toBe(true);
    });

    test('should reject duplicate nullifier', async () => {
      // Record first attestation
      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // Attempt to record with same nullifier should fail
      await expect(
        simulator.recordQuest(
          randomBytes(32).toString('hex'), // different quest
          testData.version,
          testData.userSecret,
          testData.salt,
          testData.nullifier // same nullifier
        )
      ).rejects.toThrow('Nullifier already used');
    });

    test('should increment counter for each attestation', async () => {
      const initialCounter = simulator.getCounter();

      // Record first attestation
      const result1 = await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );
      expect(result1.counter).toBe(initialCounter + 1);

      // Record second attestation with different nullifier
      const result2 = await simulator.recordQuest(
        randomBytes(32).toString('hex'),
        2,
        randomBytes(32).toString('hex'),
        randomBytes(32).toString('hex'),
        randomBytes(32).toString('hex') // different nullifier
      );
      expect(result2.counter).toBe(initialCounter + 2);

      // Verify final counter
      expect(simulator.getCounter()).toBe(initialCounter + 2);
    });

    test('should allow same quest by different users (different secrets)', async () => {
      const initialCounter = simulator.getCounter();

      // User 1 records quest
      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // User 2 records same quest with different secret and nullifier
      const result2 = await simulator.recordQuest(
        testData.questId, // same quest
        testData.version,
        randomBytes(32).toString('hex'), // different secret
        randomBytes(32).toString('hex'), // different salt
        randomBytes(32).toString('hex')  // different nullifier
      );

      // Both should succeed
      expect(simulator.getCounter()).toBe(initialCounter + 2);
    });
  });

  describe('checkAttestation (selective disclosure)', () => {
    test('should pass check for existing attestation', async () => {
      // Record attestation
      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // Check should pass when expectedResult is true
      const result = await simulator.checkAttestation(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        true // expect attestation to exist
      );

      expect(result.exists).toBe(true);
    });

    test('should fail check for non-existent attestation', async () => {
      // Check with expectedResult=false should pass (attestation doesn't exist)
      const result = await simulator.checkAttestation(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        false // expect attestation to NOT exist
      );

      expect(result.exists).toBe(false);
    });

    test('should reject when check result does not match expectation', async () => {
      // Record attestation
      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // Check with wrong expectation should fail
      await expect(
        simulator.checkAttestation(
          testData.questId,
          testData.version,
          testData.userSecret,
          testData.salt,
          false // expect it NOT to exist, but it does
        )
      ).rejects.toThrow('Attestation check failed');
    });

    test('should fail check with wrong secret', async () => {
      // Record attestation
      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // Check with wrong secret should fail
      await expect(
        simulator.checkAttestation(
          testData.questId,
          testData.version,
          randomBytes(32).toString('hex'), // wrong secret
          testData.salt,
          true // expect to exist, but commitment won't match
        )
      ).rejects.toThrow('Attestation check failed');
    });

    test('should demonstrate selective disclosure privacy', async () => {
      // Record attestation
      const result = await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      // Public ledger only has commitment (hash)
      expect(simulator.hasCommitment(result.commitment)).toBe(true);

      // But quest details remain private (witnesses)
      // Only the user with the correct inputs can check the attestation
      const checkResult = await simulator.checkAttestation(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        true
      );

      expect(checkResult.exists).toBe(true);
      
      // Someone without the correct secret cannot check it
      await expect(
        simulator.checkAttestation(
          testData.questId,
          testData.version,
          randomBytes(32).toString('hex'),
          testData.salt,
          true
        )
      ).rejects.toThrow();
    });
  });

  describe('query circuits', () => {
    test('hasCommitment should return true for recorded commitments', async () => {
      const result = await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      expect(simulator.hasCommitment(result.commitment)).toBe(true);
    });

    test('hasCommitment should return false for non-existent commitments', () => {
      const fakeCommitment = randomBytes(32).toString('hex');
      expect(simulator.hasCommitment(fakeCommitment)).toBe(false);
    });

    test('hasNullifier should return true for used nullifiers', async () => {
      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      expect(simulator.hasNullifier(testData.nullifier)).toBe(true);
    });

    test('hasNullifier should return false for unused nullifiers', () => {
      const unusedNullifier = randomBytes(32).toString('hex');
      expect(simulator.hasNullifier(unusedNullifier)).toBe(false);
    });

    test('getCounter should return correct count', async () => {
      expect(simulator.getCounter()).toBe(0);

      await simulator.recordQuest(
        testData.questId,
        testData.version,
        testData.userSecret,
        testData.salt,
        testData.nullifier
      );

      expect(simulator.getCounter()).toBe(1);
    });
  });
});

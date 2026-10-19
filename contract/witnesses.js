import { CompactTypeBytes, CompactTypeVector, convertFieldToBytes, persistentHash } from '@midnight-ntwrk/compact-runtime';

const bytes = new CompactTypeBytes(32);
const domain = (text) => {
  const result = new Uint8Array(32);
  result.set(new TextEncoder().encode(text));
  return result;
};

export function commitmentFor(material) {
  return persistentHash(new CompactTypeVector(5, bytes), [
    domain('midnight:quest:commitment'), material.questId, material.userSecret, material.salt,
    convertFieldToBytes(32, material.version, 'quest version'),
  ]);
}

export function nullifierFor(material) {
  return persistentHash(new CompactTypeVector(3, bytes), [
    domain('midnight:quest:nullifier'), material.localSecretKey, material.questId,
  ]);
}

export function recordWitnesses(material) {
  return {
    questId: ({ privateState }) => [privateState, material.questId],
    versionNum: ({ privateState }) => [privateState, material.version],
    userSecret: ({ privateState }) => [privateState, material.userSecret],
    localSecretKey: ({ privateState }) => [privateState, material.localSecretKey],
    saltValue: ({ privateState }) => [privateState, material.salt],
    commitmentPath: ({ ledger, privateState }, comm) => {
      const path = ledger.commitments.findPathForLeaf(comm);
      if (!path) throw new Error('Attestation not found');
      return [privateState, path];
    },
  };
}

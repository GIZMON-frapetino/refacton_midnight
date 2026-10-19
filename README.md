# QuestAttestation — Midnight Wave 3

A Compact record contract with private Merkle membership checks. This branch implements the first Wave 3 change; execution and browser checks are tested locally. Preprod deployment and issuer authorization are planned separately, not delivered by this branch. A record states that its private material was registered; it does not establish that real-world work happened.

## Contract

`commitments` is a `MerkleTree<16, Bytes<32>>` with capacity 65,536 leaves. `nullifiers` remains a `Set<Bytes<32>>`, and `counter` counts successful registrations. `recordQuest()` computes the existing domain-separated commitment from quest ID, user secret, salt and 16-bit version; it derives the nullifier from local secret key and quest ID, rejects an already-used nullifier, inserts a leaf and increments the counter. A different local key can register again: there is no person-identity check.

`checkAttestation(challenge)` now takes only a public 32-byte challenge. Quest ID, version, user secret, salt and the membership path are private witnesses. The circuit asserts that the path leaf equals the recomputed commitment, then checks its computed root against the current tree root. It returns the existing domain-separated hash of user secret, challenge and quest ID. The commitment and nullifier do not enter its public membership query. A wrong secret, borrowed leaf or invalid path cannot pass that check.

The previous public `hasCommitment` circuit was removed; it would reintroduce an individual record query. `hasNullifier(n)` remains a public diagnostic and exposes the queried nullifier. `getCounterValue()` returns the public count. Contract bindings and all four circuit key pairs are regenerated with the pinned official compiler.

## Known limitations and public disclosures

Registration exposes the nullifier, counter update, tree position/update and leaf hash used by Compact's Merkle storage. The Merkle tree structure, current root and population are public. Its inserted storage hash can be compared to a guessed commitment; high-entropy secrets and salt remain essential. The tree is not a secret database.

A check's public data contains its challenge, aggregate root, challenge-bound response, query structure and success condition. It does not disclose the commitment, membership path, selected leaf, quest ID, version, salt, user secret or local key. The shared root identifies a tree snapshot and can appear in checks for different records or the same record. Therefore the requirement for literally no shared disclosed value is not achievable with a shared-root design. The tests instead establish that checks disclose no repeated **record-specific** membership identifier, using the generated public transcript, input and output.

Fresh challenges give different responses; reusing a challenge for the same record repeats the response. Requesters must supply fresh unpredictable challenges and bind them to their application session. Challenge reuse/replay is not prevented by a stored challenge registry. A one-record tree gives an anonymity set of one, and a small population or root/timing patterns can narrow the possible record. Wallet identity, fees, transaction metadata and off-chain disclosures can still correlate activity. This change does not promise general anonymity.

This is a current-root tree, not a history-accepting tree. A later registration invalidates old paths; retrieve a fresh path before executing a check. The supplied witness adapter uses `findPathForLeaf` for convenience, an O(n) scan; clients should retain the insertion index and use `pathForLeaf` at scale. Capacity exhaustion, migration, revocation, issuer policy and application authentication need further design. No independent security audit has been performed.

## Reproduce

Use Node.js 20 or 22 and Compact compiler 0.31.1. The compiler reports Ledger 8.0.2 and runtime 0.16.0. Install the entire compiler bundle in the repository root (the wrapper needs its neighboring executables):

```bash
curl -fL -o compactc.zip https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_x86_64-unknown-linux-musl.zip
unzip compactc.zip
chmod +x compactc compactc.bin zkir zkir-v3
npm install
npm run compile
npm test
cd demo-web
npm ci
npm run build
cd ..
npm run test:demo-web
```

Jest has 20 tests: successful/multiple registrations, duplicate rejection, correct membership, wrong material, borrowed/corrupt/stale paths, fresh path recovery, actual public-transcript disclosures, challenge reuse, read-only state, real nullifier queries and counter values. The browser helpers have 18 regression checks. These are compiled-contract simulator checks, not network transaction tests. GitHub Actions also compiles the Compact source; no workflow files were changed for this branch.

## Browser demo

`demo-web/` retains the business chat, sample plan and engineer record/check flow. Chat, task descriptions and work results are clearly sample content; no AI, payment or hiring occurs. The simulator executes `recordQuest` and `checkAttestation` and shows tree root, leaf count, nullifiers and count. Old Set-based saved sessions are rejected rather than relabeled as Merkle sessions. Session exports contain local secrets and must not be published.

```bash
cd demo-web
npm ci
npm run build
npm run preview
```

The existing GitHub Pages deployment branch is `cursor/midnight-demo-web-409a`. This feature branch does not replace that public deployment and is not merged into main.

## References

[Official private-data guidance](https://docs.midnight.network/concepts/how-midnight-works/keeping-data-private) describes the path-leaf binding and root check. [Ledger data types](https://docs.midnight.network/compact/reference/ledger-adt) describes tree path methods; the current online reference targets a newer compiler, so this branch is compiled and tested with 0.31.1. [Pinned compiler release](https://github.com/LFDT-Minokawa/compact/releases/tag/compactc-v0.31.1).

Apache-2.0. See [LICENSE](LICENSE).

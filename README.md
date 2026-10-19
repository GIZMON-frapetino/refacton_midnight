# QuestAttestation — Midnight Wave 3

A Compact record contract with private Merkle membership checks and registered-issuer authorization. This branch starts from main after PR #9 was squash-merged and re-applies only the issuer changes from PR #10. Execution and browser helpers are tested locally; Preprod deployment and wallet-backed transactions are planned separately. A registered issuer can approve a record, but the software does not establish that real-world work happened or identify a human reviewer.

## Contract

`commitments` is a `MerkleTree<16, Bytes<32>>` with capacity 65,536 leaves. `nullifiers` is a `Set<Bytes<32>>`; `counter` counts registrations. The existing domain-separated commitment binds quest ID, user secret, salt and 16-bit version. The nullifier binds local secret key and quest ID. A duplicate nullifier fails; a different local key can register another record because there is no person-identity check.

`checkAttestation(challenge)` takes only a public 32-byte challenge. Quest ID, version, user secret, salt and path are private witnesses. The path leaf must equal the recomputed commitment, and its root must be the current root. The result hashes user secret, challenge and quest ID. The public commitment-membership query was removed. `hasNullifier(n)` remains a public diagnostic exposing its argument; `getCounterValue()` reads the public count.

## Issuer authorization

The constructor takes a public administrator key identifier and a nonzero public authorization scope. Generate independent random 32-byte administrator and issuer secrets. `pureCircuits.deriveAdminKey(secret)` and `deriveIssuerKey(secret)` produce domain-separated public **hash identifiers**. These are application-specific secret-possession keys, not interoperable EC public keys or an external signature format. The pinned compiler does not supply the newer signature APIs; those would require a separately reviewed toolchain change.

An administrator holding the matching private secret calls `registerIssuer(key)` to add a public issuer identifier. Merely supplying a public administrator/issuer identifier as a secret does not authorize the caller. Unauthorized self-registration, zero keys and duplicate registration fail.

A registered issuer calls `authorizeRecord()` with its own private secret plus the recipient's quest ID, commitment and derived nullifier as private witnesses. The issuer can receive those three values from the recipient without receiving the recipient's secret, local key or salt. The circuit publishes an exact authorization marker: a domain-separated hash of deployment scope, quest ID, commitment and nullifier. `recordQuest()` recomputes that marker from its own witnesses and requires it to be present **before** updating tree, nullifier or counter. Changing any bound record material invalidates the approval. Approval must be made for each new record; registering an issuer is not enough.

The recipient does not receive the issuer secret and does not need it for recording or checking. Use independent secrets and a unique random scope for each deployment. There is no issuer name database, external signing/relay interface, key rotation, expiry or revocation. An already-issued marker remains valid for its exact record; markers accumulate. A compromised issuer secret can authorize new records; a compromised administrator secret can add issuers. Treat any production key management and reviewer policy as additional work.

## Known limitations and public disclosures

The public ledger contains tree state/root/position/population, stored leaf hashes, nullifiers, counter, administrator hash identifier, deployment scope, registered issuer identifiers and authorization markers. `authorizeRecord` discloses its issuer identifier and marker. `recordQuest` discloses the same marker plus nullifier and tree update. Observers can link an authorization to its registration and issuer. This is intentional issuer attribution, not a private issuer registry. Guessing a complete commitment permits comparisons to its stored tree hash; high-entropy secrets and salt are essential.

A check's public data contains its challenge, aggregate root, challenge-bound response, query structure and success condition. It does not query/disclose the selected commitment, nullifier, path, issuer identifier, authorization marker, quest ID, version, salt or secret. The same aggregate root can appear in checks of different records and repeated checks. Literally no common disclosed value is incompatible with a shared-root design; tests assert absence of a repeated **record-specific** membership identifier instead.

Fresh challenges give different responses; the same challenge repeats the response. There is no challenge-replay registry. Requesters must use fresh unpredictable challenges bound to their application session. One-record or small trees, root/timing patterns, wallet identity, fees, transaction metadata and off-chain disclosures can still correlate activity. No general anonymity claim is made.

This is a current-root tree: new registrations invalidate old paths. Fetch a fresh path before checking. The sample witness uses an O(n) `findPathForLeaf` scan; indexed path retrieval is preferable at scale. Capacity exhaustion, migrations, application authentication and independent security audit remain open work.

## Reproduce

Use Node.js 20 or 22, Compact 0.31.1, Ledger 8.0.2 and runtime 0.16.0. Install the whole compiler bundle (the wrapper needs neighboring executables):

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

All six stateful circuits have regenerated keys: record, check, nullifier query, counter query, issuer registration and record authorization. Two pure key-identifier helpers are generated too. Jest has 32 compiled-contract simulator tests: 20 membership/record tests inherited from PR A and 12 explicit issuer-gate tests, including valid/unknown issuer, public-key impersonation, unauthorized registry access, exact-material binding, scope, duplicates and public transcript checks. The browser helper suite has 20 regressions. These are not network transaction tests. Existing Actions compile and test jobs are unchanged.

## Browser demo

The business chat, six-step plan and sample work results remain sample content; no AI, payment or hiring occurs. A **fresh simulator only** generates temporary sample issuer/admin secrets, executes registration and approval, then calls `recordQuest`. The UI labels this local sample issuer setup, not an external review. Checks restore the saved issuer-aware public state and do not create new approvals. Old Set-based and pre-issuer sessions are rejected. Session files contain recipient secrets and must not be published; sample authority secrets are not exported.

```bash
cd demo-web
npm ci
npm run build
npm run preview
```

The existing public demo deployment branch remains `cursor/midnight-demo-web-409a`. This replacement issuer branch is based directly on main at `d5f5313`, with only PR #10's issuer changes and updated base documentation. The original PR #9 commits are not reintroduced. No existing branch was rewritten or deleted, and this branch is not merged or published over the current demo. Merge decisions belong to the owner.

## References

[Official private-data guidance](https://docs.midnight.network/concepts/how-midnight-works/keeping-data-private) describes private paths and hash-based authorization. [Compact security guidance](https://docs.midnight.network/compact/smart-contract-security). [Ledger types](https://docs.midnight.network/compact/reference/ledger-adt) describe path methods; current online docs target a newer compiler, while this branch is compiled with [0.31.1](https://github.com/LFDT-Minokawa/compact/releases/tag/compactc-v0.31.1).

Apache-2.0. See [LICENSE](LICENSE).

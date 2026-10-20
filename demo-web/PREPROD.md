# Preprod integration — DRAFT, deployment unfinished

**Deployed contract address: not available. No deployment has been performed.** No real wallet connection, approval, funding, deployment or network transaction was performed for this update. Offline CI does not establish a deployed service.

## Wallet ownership and send gate

The owner creates and manages their own compatible Lace wallet. Recovery phrases, seeds, private keys and API tokens must stay outside repository files, logs and browser build variables. Approve actual connections and transactions in Lace yourself. Real wallet behavior still requires an owner-run Preprod acceptance test.

Simulator remains the default. Network sessions are separate and are not written to the sample session/log storage or exported by the sample-sharing feature. Errors never substitute a simulator result.

Every record/check, wallet balance/submit and deployment entry uses `sendOnPreprod`. Only the exact public build value `VITE_ENABLE_PREPROD_TRANSACTIONS=true` permits entry. Unset, false, empty and other values stop before balance, submit or SDK deployment. The flag is not wallet consent. Before both balance and submit, the adapter freshly checks connected Preprod status and the initially selected coin/encryption public keys. Lock/read failure, disconnection, network or key change invalidates the runner and requires reconnection. Each wallet send is bound to one cancellable application attempt; unbound adapters cannot send.

Contract re-selection invalidates the previous runner before asynchronous work. The active address is shown separately from the edited input. Selection generations prevent old success, failure or callbacks from replacing a newer contract. Connection and selection have a 30-second application deadline. A late connection cannot become active after its caller times out; selection timeout retires that generation. With no pending send, the send state remains idle.

## Encrypted browser private state

`EncryptedPrivateStateProvider` implements the SDK private-state interface using Web Crypto AES-GCM 256 and PBKDF2 SHA-256 with a random 16-byte salt and 600,000 iterations. Each vault update has a new random 12-byte IV and authenticated format/revision/crypto parameters. Imported backups accept bounded iterations from 600,000 through 900,000 and retain that value on updates. The minimum passphrase length is 12 characters; choose a long, unique passphrase.

IndexedDB contains one vault record: ciphertext plus public format/version/revision, salt, iteration count and IV. State identifiers, addresses, values and SDK maintenance signing material are inside the encrypted payload. The passphrase and raw derived key are not persisted or logged. An unlocked provider retains a nonextractable CryptoKey and decoded values in memory; Lock and panel unmount discard those references. JavaScript strings and memory cannot be guaranteed erased. This protects stored data, not a compromised origin, extension or device.

The Preprod panel supports initialize, unlock, lock, encrypted backup download/import and a restore-check file upload. The restore check actually decrypts the supplied file and confirms its digest matches the current stored vault. Updates, import and lock invalidate backup readiness. The asynchronous deployment-readiness check rereads IndexedDB so another tab's update cannot reuse a stale backup confirmation. Writes await IndexedDB completion; queued local operations and revision comparison reject stale concurrent writes. File/payload, KDF and nesting limits bound malformed input.

Unlock **before contract selection** to select the encrypted SDK provider. Otherwise that selection keeps memory-only SDK private state. Neither choice automatically saves the recipient material captured by record/check witnesses; that material remains memory-only. An encrypted SDK backup is therefore **not a recipient-record backup**. The sample sharing export remains unavailable for network material.

## Deployment remains disabled

**Add to allowlist only after owner approval and a Preprod test.**

The internal provider allowlist in `deployment-policy.ts` is deliberately **empty**. The new provider is not admitted. Even an initialized, unlocked vault with an exported and restore-checked backup cannot reach SDK deploy. `deployWithWallet` and `deployTarget` both require the common gate, allowlist admission and an asynchronous current-vault readiness check before SDK deployment.

The SDK needs durable contract private state and a recoverable contract maintenance signing key. Interface shape, encryption code alone or a single rejected class is insufficient. Owner review and a real Preprod test are still required before a future change can admit a provider. Backup readiness in the UI is not deployment approval. An initial backup also cannot contain a maintenance key that has not yet been created: a future deployment workflow must require a fresh encrypted backup and restore check after newly written state/keys. No deploy button or usable deployment is supplied here.

## Pending transaction recovery

Application send states are **idle**, **awaiting-wallet**, **submitted**, **confirmed**, **failed** and **unknown**. Awaiting-wallet includes SDK preparation and approval. Wallet balance/submit perform a fresh attempt guard after asynchronous connection/key checks. A retired attempt cannot later advance to submit.

Immediately **before** calling wallet submit, the application persists only the public transaction ID in localStorage. If durable ID storage fails, submit is not called. Browser Web Locks serialize send attempts across same-origin tabs; real sends fail closed where that API is unavailable. After wallet submit is requested, a 60-second deadline or uncertain failure leaves the ID retained with unknown/pending state. It does not authorize a retry. Reload starts unknown/pending from that ID, without recovering record material, passphrases, addresses, payloads or wallet keys. Simulator starts as the default even when a pending network ID exists.

**Check status again** is read-only. After reconnecting and selecting a contract, it makes a finite GraphQL query to the configured indexer for that retained ID, using the pinned SDK schema. The application bounds the wait at 15 seconds and aborts the request; the next click starts a fresh read rather than reusing a stalled watch. Full success or complete failure with an exact ID-array match and block data establishes a terminal state; timeout, no response, malformed/mismatched ID, partial/fallible outcome or service error stays unknown. No status refresh is a quest MATCH result.

**Safe reset (never resend)** cancels pre-submit attempts. It keeps unresolved submitted IDs and their send lock. Before-submit timeout/reset retires the per-attempt providers so a late calculation or wallet balance cannot submit after the controls are reset. The six-state model, late-attempt guards and retained ID replace the former simple in-flight wait. Typed connector `Rejected`/`PermissionRejected` is a definite wallet rejection; an untyped submission error remains unknown. Nothing automatically resubmits.

Recovery is intentionally conservative. Clearing browser storage or using another origin/device removes this origin's guard; do not do so to bypass pending status. A pending record's recipient material is not recovered on reload. Public finalization refresh cannot reconstruct lost local material or replay SDK private-state updates. Reconciliation trusts the selected indexer and its matching transaction ID; live validation remains necessary.

## Typed local check outcomes

A missing Merkle path from the local witness raises `MembershipError` with `LOCAL_MEMBERSHIP_MISSING`. Network checks capture that local witness outcome before submission; SDK exception wrapping or arbitrary external text cannot manufacture it. MATCH requires an actual successful local membership path execution and completed call; a generic SDK return without that local marker is UNKNOWN. NO MATCH is only the typed local missing-member outcome.

Wallet rejection, network failure, pending and unknown have separate fixed error codes, messages and headings. No external error text, nested reason or cause is shown or logged. Invalid input is not a membership answer. Public transaction confirmation alone does not yield MATCH/NO MATCH. No contract rules, disclosure fields or compiled artifacts changed for this classification update.

## Offline validation

The existing root contract/issuer/mode suite and simulator helper suite remain in place. `npm run test:network` and the existing build run strict TypeScript, four adapter tests, an actual SDK circuit/unsubmitted-transaction regression, real-entry-point fixtures and the new encrypted-store, transaction-recovery and typed-check suites. Current counts are recorded with the PR's head-specific CI links. Existing CI workflows are unchanged.

Storage tests use actual Web Crypto with fake IndexedDB and synthetic ephemeral values, including ciphertext-only database inspection, wrong passphrase, backup/restore, imported KDF parameters and stale writes. Recovery tests cover every state, submit uncertainty, pending reload with ID-only persistence, read-only reconciliation, reset and late calls. Entry tests keep balance/submit/deploy counts at zero with the gate off and keep deploy blocked with a fully prepared encrypted vault. These tests do not connect to Lace or send to Preprod.

## Version boundaries

Artifacts remain Compact 0.31.1 / compiler Ledger 8.0.2 / runtime 0.16.0. Midnight.js is 4.1.1, Compact.js 2.5.1, connector API 4.0.1. SDK Ledger 8.1.0 is pinned and deduplicated with overrides, Vite alias/dedupe and a single runtime resolution for Node SDK tests. On-chain runtime remains 3.0.0. The actual SDK regression executes a generated circuit and constructs an unsubmitted transaction without wallet operations. The compiler has not been upgraded.

## Known open issues

- **7 — Live compiler/SDK compatibility remains unconfirmed.** Compiler Ledger 8.0.2 and SDK Ledger 8.1.0 have not been exercised together with actual Preprod/Lace. Offline execution and transaction construction are not live acceptance.
- **Allowlist approval remains outstanding.** Add to allowlist only after owner approval and a Preprod test. No provider is admitted in this Draft, regardless of its backup readiness or feature flag.
- **Recipient and SDK-state reconciliation remains limited.** SDK private-state encryption is implemented, but automatic encrypted recipient-material capture and reconstruction of interrupted SDK state updates are not. A confirmed public ID after reload does not restore the record's local secrets. Do not use valuable records.
- **Browser/origin and live-service risks remain.** Storage eviction, forgotten passphrases, compromised-origin access while unlocked, manual storage deletion, proactive wallet events, endpoint/CORS/HTTPS-loopback access, asset latency and fresh-path races need operational review or live testing. Public ID markers and Web Locks only coordinate this origin.

Findings 5 and 9 are implemented at the application-control level described above; they are no longer listed as unimplemented. This does not claim comprehensive record recovery or live version compatibility.

## Reproduce offline checks

```bash
git checkout cursor/wave3-preprod-main
npm install
npm run compile
npm test
npm run test:demo-web
cd demo-web
npm ci
npm run typecheck
npm run test:network
npm run build
npm run preview -- --host 127.0.0.1
```

Use Simulator without a wallet. For storage UI testing, use a disposable passphrase and synthetic data; download an encrypted file and upload it for the restore check. An owner-supplied public contract address would be required for network operations, but no deployment is supplied. Real transactions remain disabled in the default build, and deployments remain disabled with the allowlist empty even if the public flag is changed. No secret belongs in a `VITE_` variable.

## Public ledger disclosures

A future deployment retains the existing contract disclosures: tree state/leaf hashes and positions, nullifiers/count, public administrator identifier/scope, issuer identifiers and authorization markers. Authorization can be linked to registration and issuer. Checks expose public challenge, shared root, response and query/success structure, not the selected leaf, quest ID, path or issuer marker. Fee/timing/wallet metadata, shared roots, small trees and challenge reuse retain correlation risks. See the root README.

The existing Pages demo branch, main, workflows and other repositories/sites are unchanged by this update. No merge or automatic publication is requested.

# Preprod integration — DRAFT, deployment unfinished

**Deployed contract address: not available. No deployment has been performed.** This branch prepares official SDK connection/call/deployment entry points while retaining the local simulator. No live wallet approval, funding, transaction, issuer approval or network result has been tested. Do not treat green CI as evidence of a deployed service.

## Wallet ownership

Create and manage your own Midnight-compatible Lace wallet using links from the [official integration documentation](https://docs.midnight.network/sdks/community/wallets/community-wallets-integration). Keep its recovery phrase, seed and private keys on your own device. Do not provide them to an agent, paste them in chat, or put them in application source or browser build variables. Approve connections and transactions in the wallet UI yourself. Use Preprod test balances only, not real funds. The user explicitly chose to prepare this PR as a draft until their own wallet and local service are available.

## Implemented and checked offline

- Default Simulator mode still executes the issuer-aware contract locally. The sample issuer is generated only for fresh simulator sessions.
- A collapsible mode panel selects Simulator or Preprod (draft). Switching remounts the journey; local sessions cannot be relabeled as network records. A missing wallet/address/runner fails explicitly, with no silent simulator fallback. Mode/contract changes are blocked during pending network record/check operations.
- Wallet discovery reads values from the dynamic `window.midnight` map, filters Lace `io.lace.wallet` on API v4, and offers detected Lace choices. Selection/refresh/reconnect invalidate the previous connection and runner. Connect is invoked in the click event before any await and requires connected Preprod status.
- Official providers use wallet configuration, extension calculation support when available, or the wallet's loopback calculation service. The fallback rejects non-loopback hosts. Indexer configuration comes from the wallet; service URLs and tokens are not stored in source or echoed to UI errors.
- `network.ts` uses the generated bindings with private witnesses and official contract discovery/call APIs. `recordQuest` and `checkAttestation` wait for SDK finalization before returning selected result fields. No network sample issuer registration/approval is sent. Wrong membership returns NO MATCH; transport/approval failures are errors, not match results.
- `copy-network-assets.mjs` copies only allowlisted generated public key/circuit artifacts after a build. It does not copy wallet files or private state. Browser WASM, Buffer, assert and WebSocket compatibility is checked through a real browser loading the SDK with an offline fixture.
- `scripts/deploy-with-wallet.ts` calls official deployment with the public administrator identifier/scope. Its default memory-only store is rejected: a durable encrypted private-state provider and maintenance-key backup must be supplied by the operator. That durable storage integration is **not delivered** by this draft.

Jest has 45 tests (32 contract/issuer tests and 13 offline wallet/mode guards). The demo helper suite has 20 checks; the official adapter has 4 additional offline tests. Strict TypeScript checking and the production build pass. The entire simulator business/engineer/MATCH/NO MATCH flow was checked at 390×844 and 1280×720. The Preprod mode guards and SDK import/provider construction were checked with an offline fixture at both sizes; **no real wallet or transaction was exercised**. Network session export through the sample sharing feature is rejected.

## Version boundaries

Generated circuits remain Compact 0.31.1, compiler Ledger 8.0.2, runtime 0.16.0. Application packages are pinned to Midnight.js 4.1.1, Compact.js 2.5.1 and connector API 4.0.1. The 4.1.1 protocol package itself pins its SDK Ledger dependency to **8.1.0**, so this draft uses protocol re-exports and a single 8.1.0 copy; on-chain runtime is pinned to 3.0.0 to match that protocol. The compiler has not been upgraded. Local compilation, type checks and simulator tests pass across these packages, but compatibility with the actual Preprod service and wallet transaction format still requires a live acceptance run.

The network module is lazy-loaded and includes a large Ledger WASM (~10 MB uncompressed); key assets are also large. Latency, endpoint availability, CORS/loopback access from HTTPS, wallet rejections, indefinite finalization waits and fresh-path races remain untested. The SDK's join/call services can wait indefinitely; this draft does not yet add cancellation/recovery UX. It also does not yet track wallet account-change events. Disconnect/reconnect after an account/network change and repeat validation before transactions.

## Reproduce the draft locally

From the repository root, use the replacement draft branch based on issuer PR #12:

```bash
git checkout cursor/wave3-preprod-wallet-restacked
npm install
npm test
cd demo-web
npm ci
npm run build
npm run preview -- --host 127.0.0.1
```

`npm run build` runs strict type checking and the four adapter tests before producing the bundle and public circuit assets. From the root, `npm run test:demo-web` runs the simulator helpers. A local browser can exercise Simulator mode without any wallet.

To inspect draft guards, open the mode panel, choose Preprod (draft) and open Engineer view. Without a connection and contract address, Save engineer record reports that no simulator action was taken. Switching back restores the local simulator journey. No deployment address is configured: the address input is blank unless the operator explicitly supplies a public address via `VITE_PREPROD_CONTRACT_ADDRESS` or the form. Do not set API tokens, seeds or secrets with the `VITE_` prefix, since these are public browser inputs.

Even with a connected wallet/address, the draft disables actual registration/check submission unless an operator explicitly builds with `VITE_ENABLE_PREPROD_TRANSACTIONS=true`. This is a public feature flag, not a secret. Do not enable it for valuable records before implementing durable recipient backup/recovery and completing the live tests below. The typed deployment helper is not invoked by the normal demo UI and requires its own operator-controlled entry point plus durable encrypted storage.

## Planned operator steps before deployment

1. Prepare your own funded Preprod Lace wallet and the current supported local calculation service, following [network setup](https://docs.midnight.network/guides/networks-and-environments), [test funding](https://docs.midnight.network/guides/acquire-tokens) and [deployment guidance](https://docs.midnight.network/guides/deploy-and-operate). Confirm fee balance/tDUST and wallet network. The fallback URL must be loopback, for example `http://localhost:6300`.
2. Implement/configure an SDK `PrivateStateProvider` that durably encrypts private state and maintenance keys, with a tested backup/recovery procedure. Do not use the memory-only default for deployment. Any node-side service token must be environment-only; browser providers normally obtain service settings from Lace.
3. Generate independent random administrator/issuer secrets and a unique nonzero deployment scope **locally outside source control**. Derive the public administrator and issuer identifiers using the generated pure circuits. Keep the authority secrets separate from the wallet seed and from recipient material.
4. Compile the contract with the pinned full compiler bundle. Serve `demo-web/dist/contract-assets/` as public static files. Connect Lace from an explicit user gesture and confirm Preprod. Integrate the typed deployment helper into an operator-controlled browser entry point; it is not exposed as an automatic deploy button in this draft.
5. Call the helper with an already approved `ConnectedAPI`, public constructor values, asset URL and durable store:

```typescript
import { deployWithWallet } from './scripts/deploy-with-wallet';

const publicResult = await deployWithWallet({
  connected,                  // From the operator's own approved Lace connection
  assetBaseURL,               // Public contract-assets URL ending with /
  adminKeyHex,                // Public hash identifier, not the private secret
  scopeHex,                   // Public unique deployment scope
  durablePrivateState,        // Operator-owned encrypted, backed-up SDK provider
});
// Retain only publicResult.contractAddress and publicResult.transactionId here.
```

6. After the operator approves the wallet action and deployment finalizes, confirm the address and generated verifier keys through the official indexer. Add the actual **public** contract address and finalization reference to this document/root README in a new reviewed commit. This step is planned; there is no address to record now.
7. The administrator registers the public issuer identifier; that issuer authorizes the recipient's exact quest ID/commitment/nullifier tuple using private issuer witnesses and the contract's scope. The browser does not implement a production reviewer/admin workflow or automatically acquire an approval. Set up this issuer approval out of band using the generated circuits/official contract API before attempting a recipient registration.
8. Supply the deployed public address in the draft panel, connect your own wallet and select the contract. Preserve recipient record material securely before attempting a real registration. This draft keeps network session material in memory only: reload/mode switching discards it, and durable recipient backup/import UX remains planned. Do not use it for valuable or irreplaceable records yet.
9. Exercise actual registration, matching/wrong-secret checks, rejection/retry cases, wallet disconnect/account changes and finalization at both viewport sizes. Save public transaction references, not the SDK's entire returned objects, because those contain private execution data. Until this acceptance run succeeds, keep this PR Draft.

## Public ledger disclosures

Network mode does not change the contract's disclosure rules: tree root/state/leaf hashes and positions, nullifiers, count, public administrator identifier/scope, registered issuer identifiers and authorization markers are public. Authorization can be linked to registration and issuer. Checks disclose public challenge, shared root, response and query/success structure, not selected leaf, quest ID, path or issuer marker. Wallet/fee/timing metadata adds network correlation risk. See the root README for challenge reuse, small-tree and path-freshness limitations.

The reference repository/site and the existing Pages demo branch have not been changed. Do not merge or publish this draft automatically.

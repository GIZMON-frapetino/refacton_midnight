# Preprod integration — DRAFT, deployment unfinished

**Deployed contract address: not available. No deployment has been performed.** No real wallet connection, approval, funding, deployment or network transaction was performed. Offline CI is not evidence of a deployed service.

## Wallet ownership

Create and manage your own Midnight-compatible Lace wallet using the [official integration documentation](https://docs.midnight.network/sdks/community/wallets/community-wallets-integration). Keep recovery phrases, seeds, private keys and API tokens on your own device, outside the repository and browser build variables. Approve connections and transactions in Lace yourself. Use Preprod test balances only. Actual wallet approval/rejection behavior still needs a live acceptance run.

## Implemented safeguards

Simulator is the default. Preprod uses a separate, memory-only journey; network session/log data is not persisted, and the sample export/import feature cannot share a network session. A failed network operation never silently substitutes a simulator result.

`sendOnPreprod` in `src/lib/send-boundary.ts` is the shared send boundary. Network record/check, wallet balance/submit and both deployment entry points use it. Only the exact build value `VITE_ENABLE_PREPROD_TRANSACTIONS=true` permits entry. Unset, false, empty or other values stop before wallet balance/submission or SDK deployment. The flag is public configuration, not wallet consent or a secret.

Before both balance and submit, the adapter freshly checks connected Preprod status and the originally selected shielded coin/encryption public keys. Lock/read failure, disconnection, network change or key change invalidates the adapter and runner. The UI clears the active selection and asks for reconnection. Wallet rejection is returned as a fixed error without automatic retry or raw service data. A new explicit user action may retry after a rejection; this does not resolve uncertain submission status (see issue 5).

Contract re-selection removes the old runner before asynchronous validation. The edited address is distinct from the displayed active address. Failed selection leaves no active contract or sender. Normal selection replacement silently retires the old adapter; an actual wallet-state failure requests reconnection.

Wallet discovery filters compatible Lace v4 entries from the dynamic extension map. Connect is initiated synchronously inside the user's click handler. Service configuration comes from Lace; local calculation fallback accepts only loopback hosts. Names are displayed as text. This compatibility filter is not independent authentication of an injected extension.

## Deployment disabled: approved storage allowlist is empty

Both `deployWithWallet` and `deployTarget` require the shared send gate **and** admission by `deployment-policy.ts`. No encrypted durable private-state implementation has completed approval, so its allowlist is empty and cannot be configured by a caller. Deployment stays disabled even with the transaction flag set to true. An arbitrary SDK provider, a different memory-backed object or a plaintext store cannot bypass this condition.

The SDK saves contract private state and a contract maintenance signing key after deployment. A generic interface or a single class denylist cannot establish encryption, persistence or usable backups. A future reviewed change must introduce an audited provider factory, encrypted durable storage and tested recovery, then admit that implementation through the internal policy. That implementation is **planned, not delivered** here. No deployment entry point should be integrated as usable until that review is complete.

## Offline validation

Root Jest: 45 tests covering contract, issuer and mode dispatch. Simulator helpers: 20 checks. `npm run test:network` runs four adapter tests, one real SDK circuit/transaction-construction regression and 23 real-entry-point tests with injected offline SDK/wallet fixtures. Strict TypeScript checking includes the new tests; the existing demo build runs all these checks before bundling. Existing CI workflows are unchanged.

The SDK regression uses actual generated constructor/circuit bindings, local compiled artifacts and SDK `createUnprovenCallTxFromInitialStates`. It passes protocol/indexer Ledger parameters through actual circuit execution and transcript partitioning, then assembles an **unsubmitted** transaction. It does not balance, sign, submit, calculate remotely or exercise a wallet. Test-only synthetic material is ephemeral and is not logged.

Entry-point checks cover the exact gate values, zero send/deploy calls while disabled, explicit retry after user rejection, locked/disconnected/wrong-network wallets, key changes, network change during balance, failed contract re-selection, and redaction of synthetic sensitive errors. SDK transaction construction and mocked send behavior are separate tests; neither is live network acceptance.

## Version boundaries

Generated artifacts remain Compact 0.31.1 / compiler Ledger 8.0.2 / runtime 0.16.0. SDK packages remain Midnight.js 4.1.1, Compact.js 2.5.1 and connector API 4.0.1. SDK Ledger 8.1.0 is a direct pinned dependency with overrides and a deduplicated lockfile. Vite also applies Ledger dedupe and a single browser entry alias. The Node SDK regression uses the same demo runtime resolution as the simulator smoke suite, not a second root runtime. On-chain runtime stays 3.0.0. The compiler is not upgraded.

## Known open issues

- **5 — Indefinite wait and recovery (planned).** SDK joining/finalization and wallet requests can wait indefinitely. Pending transaction state, retained public transaction ID, reconciliation and recovery UX are not implemented. A simple timeout that unlocks the UI while an operation can still submit is not an acceptable fix. Network recipient material remains memory-only and is lost on reload/mode change; do not use valuable records.
- **7 — Compiler/SDK live compatibility (unconfirmed).** Compiler Ledger 8.0.2 and SDK Ledger 8.1.0 have not been tested together against actual Preprod and Lace. Offline circuit execution/transaction construction does not establish live service/transaction-format compatibility. A supported toolchain combination and live acceptance remain required.
- **9 — NO MATCH classification by text (planned).** Membership failure is still recognized through error-message text. An external error containing the same text could be misclassified. Replace this with a typed contract error code and separate wallet/transport failures later. This classification is not changed in this update.

Production issuer/admin operations, secure recipient backup/import, proactive account-change events, endpoint/CORS/HTTPS-loopback access, large asset latency and fresh-path races also remain planned or untested. The new pre-send checks do not supply pending-state recovery or continuous wallet-event monitoring.

## Reproduce offline checks

```bash
git checkout cursor/wave3-preprod-main
npm install
npm run compile
npm test
cd demo-web
npm ci
npm run typecheck
npm run test:network
npm run build
npm run preview -- --host 127.0.0.1
```

From the repository root, `npm run test:demo-web` checks the simulator helpers. A browser can run Simulator without a wallet. Without a selected connected wallet/contract, network Save reports that no simulator action was taken. With the flag unset, record/check remain disabled even after selecting providers. Deployment remains disabled regardless of that flag until a provider is internally approved. Do not put secrets in any `VITE_` variable; browser build inputs are public.

## Planned operator sequence

After the storage policy is implemented and approved, confirm a supported compiler/SDK/wallet combination, prepare the owner's funded Preprod wallet and loopback calculation service, securely retain independent administrator/issuer material, and connect through an explicit user gesture. Integrate deployment only into a reviewed operator-controlled entry point, with the common flag enabled and an internally admitted encrypted provider. Obtain the owner's Lace approval, reconcile finalization and confirm public address/keys with the official indexer before updating the address statement in a new reviewed commit.

Issuer registration and exact record authorization remain out-of-band; the browser never automatically sends sample issuer setup in network mode. Before attempting recipient registration, implement safe recipient recovery, authorize its exact tuple, exercise real approval/rejection/network-change and finalization paths, and retain only public transaction references. These operator steps are **planned**. No address or live outcome is supplied now.

## Public ledger disclosures

A future network deployment retains the contract's existing disclosures: tree state/leaf hashes and positions, nullifiers, count, public administrator identifier/scope, issuer identifiers and authorization markers. Authorization can be linked to registration and issuer. Checks disclose public challenge, shared root, response and query/success structure, not the selected leaf, quest ID, path or issuer marker. Wallet/fee/timing metadata adds correlation risk. See the root README for challenge reuse, small-tree and path-freshness limitations.

No merge or automatic publication is requested. The existing Pages demo branch and other repositories/sites are untouched.

# QuestAttestation browser demo

Static React app running compiled Compact bindings through runtime 0.16.0/WASM. The chat, six-step plan and sample work result remain sample content. [Preprod integration](PREPROD.md) is Draft: no deployment/address/live wallet result is supplied, and actual transactions are disabled by default.

```bash
cd demo-web
npm ci
npm run build
npm run preview
```

The demo installs its own pinned runtime dependencies. No root dependency installation is needed for the browser build.

Start the demo, send the prefilled business request, use the sample plan and complete steps 1–5. At the business check, open **How the record was saved**. Save the sample engineer record, expand Public ledger to see root, leaf count, nullifiers and count, then return to the business check. **Check this quest** returns MATCH for the saved material. **Use a different secret** followed by another check returns NO MATCH without changing the saved ledger. Advanced fields accept a local quest code and 32-byte challenge; the quest ID is supplied to a private contract witness, not a public check argument.

Session exports contain recipient secrets and public simulator state. They are only for this demonstration and must not be published. Older Set-based and pre-issuer sessions are rejected: create a new session on this branch. A fresh local simulator generates a temporary sample issuer, registers it and authorizes the exact record; this is not an external review, and authority secrets are not exported. Saved state is restored for checks, never replaced with a new matching registration. The public root can repeat across checks; challenge reuse repeats a response. See the root README for all disclosure limits.

From the repository root, after `npm install` and the demo dependency install, run `npm test` (45 contract/issuer/offline-mode tests) and `npm run test:demo-web` (20 helper regressions). The build runs strict TypeScript and 62 offline tests: 4 adapter, 1 actual SDK circuit/unsubmitted-transaction, 27 entry-point, 7 encrypted-storage, 19 recovery and 4 typed-check tests. These do not establish network deployment or actual wallet approval.

Simulator is the default; every send entry retains the exact-true `VITE_ENABLE_PREPROD_TRANSACTIONS` gate and fresh wallet/network/key checks. The Preprod panel now provides AES-GCM/PBKDF2 encrypted IndexedDB SDK private state, encrypted backup/import and a restore check. Unlock before selecting a contract to use that provider. The deployment allowlist is still empty: even an unlocked vault with a checked backup cannot deploy. Add to allowlist only after owner approval and a Preprod test.

Send state now retains only a public pending transaction ID across reload. A read-only status refresh and safe reset never resubmit; unresolved submissions block new sends. Typed local membership determines MATCH/NO MATCH; wallet rejection, network failure, pending and unknown are separate. Recipient record material remains memory-only and is not automatically saved by the SDK vault. See PREPROD.md for these recovery limits, issue 7 and the outstanding allowlist approval. Wallet secrets and API tokens must never be browser build inputs.

The existing GitHub Pages workflow publishes only the configured demo branch `cursor/midnight-demo-web-409a` at https://gizmon-frapetino.github.io/refacton_midnight/. This feature branch is reviewed separately and does not modify the reference repository or reference site.

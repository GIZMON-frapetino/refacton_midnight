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

From the repository root, after `npm install` and the demo dependency install, run `npm test` (45 contract/issuer/offline-mode tests) and `npm run test:demo-web` (20 helper regressions). The build runs strict TypeScript and 4 additional adapter offline tests before bundling the lazy-loaded official SDK and public circuit artifacts. These do not validate a network deployment or actual wallet transaction.

The collapsible mode panel defaults to Simulator. Preprod (draft) accepts only compatible Lace entries, clears connections on wallet selection changes and blocks mode changes during pending network operations. Network sessions are separate, memory-only and cannot be exported through the sample sharing feature. A missing address/wallet/runner reports an error, never a simulator substitute. An owner-controlled build may explicitly set `VITE_ENABLE_PREPROD_TRANSACTIONS=true` only after completing the planned safe storage/issuer/live acceptance work described in PREPROD.md. Wallet secrets and API tokens must never be `VITE_` build inputs.

The existing GitHub Pages workflow publishes only the configured demo branch `cursor/midnight-demo-web-409a` at https://gizmon-frapetino.github.io/refacton_midnight/. This feature branch is reviewed separately and does not modify the reference repository or reference site.

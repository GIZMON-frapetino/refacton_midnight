# Quest Attestation — Midnight demo web

Static React app that runs the **QuestAttestation** Compact contract in the browser via `@midnight-ntwrk/compact-runtime` (WASM) and the compiled bindings in `../compiled/contract/`.

## Local development

```bash
cd demo-web
npm install
npm run dev
```

## Build

```bash
cd demo-web
npm install
npm run build
npm run preview
```

The demo installs its own pinned runtime dependencies. No repository-root install is needed for the browser build.

## Browser walkthrough

1. Seller: Begin → Use this plan → Mark quest complete. The quest id stays the same from the quest screen to completion. The public ledger shows counter 1, one commitment and one nullifier.
2. Buyer: keep that quest id, enter a 64-character hex challenge (or generate one), and run `checkAttestation`. The result is **Match — 合う**.
3. Select **Use a different secret**, then run the same check again. The result is **No match — 合わない**. The quest id, challenge and saved public ledger do not change, and the secret is not displayed.
4. Clear that option to return to the matching case. A different quest id also returns no match; malformed hex inputs are reported as input errors.

The session download includes the saved public contract state as well as local secret material. Buyer checks restore that state instead of calling `recordQuest` again. Changing only a secret in an imported file therefore does not create a new matching record. Files from the previous format lack saved state; complete the seller flow again and download a new file. This is a local simulator, not a network-backed record service.

## Headless smoke test (same logic as the UI)

```bash
cd demo-web
npm run smoke
```

This runs 17 regression checks through the same record/check helpers used by the UI, including saved-state restoration, wrong secrets, wrong quest ids and invalid input.

For the existing 16 contract tests and the demo checks from the repository root:

```bash
npm install
npm test
npm run test:demo-web
```

## What is wired to the contract vs mock

| Area | Label | Notes |
|------|--------|--------|
| `recordQuest` | Contract | Local simulator; updates commitments, nullifiers, counter |
| `checkAttestation` | Contract | Match / no match from circuit errors |
| Public ledger panel | Contract | `ledger()` after circuit calls |
| Plan, quest copy, demo log | Mock | Midnight-themed UI only |
| Midnight network / wallet | Mock | Not connected |

## Deploy

### GitHub Pages (this repo)

Workflow `.github/workflows/deploy-demo-web.yml` builds with `VITE_BASE=/refacton_midnight/` and publishes `demo-web/dist` when the branch is pushed.

After the workflow runs on your branch, open:

`https://gizmon-frapetino.github.io/refacton_midnight/`

(Enable Pages: repo **Settings → Pages → Build and deployment → GitHub Actions**.)

### Cloudflare Pages (separate project)

1. Create a new Cloudflare Pages project (do not reuse `refacton-demo`).
2. Connect this repository; build branch = your feature branch (or `main` after merge).
3. **Root directory:** repository root (or set **Build command** to run from `demo-web` — see below).
4. **Build command:** `cd demo-web && npm install && VITE_BASE=/ npm run build`
5. **Build output directory:** `demo-web/dist`
6. No environment secrets required for the static simulator build.

### Render (only if browser build fails)

Not required for the current Vite + WASM build. If you add a Node API later, use a free Web Service with `node server/index.js` and point the frontend `VITE_API_URL` at it.

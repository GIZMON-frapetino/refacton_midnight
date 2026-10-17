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

## Headless smoke test (same logic as the UI)

```bash
cd demo-web
npm run smoke
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

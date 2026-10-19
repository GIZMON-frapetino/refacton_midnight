# Compact toolchain

This branch uses compiler 0.31.1, Ledger 8.0.2 and `@midnight-ntwrk/compact-runtime` 0.16.0. Compiler and runtime version numbers are different.

```bash
curl -fL -o compactc.zip https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_x86_64-unknown-linux-musl.zip
unzip compactc.zip
chmod +x compactc compactc.bin zkir zkir-v3
./compactc --version
./compactc --ledger-version
./compactc --runtime-version
npm install
npm run compile
npm test
```

Keep all extracted executables beside the compiler wrapper. The repository ignores these executables. `npm run compile` invokes `./compactc contract/quest-attestation.compact ./compiled`. It generates JavaScript bindings, Compact circuit descriptions, metadata and circuit execution key pairs. `--skip-zk` is useful for local binding iteration but is not the final compilation used for delivery.

Four exported circuits remain: `recordQuest`, `checkAttestation`, `hasNullifier` and `getCounterValue`. All four have generated keys; membership checks now require the private-path circuit constraints. The ledger has a depth-16 current-root Merkle tree, a nullifier Set and counter. There is no single-record slot and no public commitment-membership query. See the root README for the exact disclosure and freshness limits.

Generated `*.prover` and `*.verifier` files are public circuit artifacts, not wallet secrets. Never place wallet seeds, issuer secret keys or API tokens in the repository.

[Official compiler releases](https://github.com/LFDT-Minokawa/compact/releases). The release bundle supports Linux x86_64/aarch64 and macOS architectures; select the matching bundle on other operating systems.

# Compact Toolchain - Installation and Usage

## Installed Toolchain Versions

This project uses the following Midnight Network toolchain versions:

- **Compact Compiler**: 0.31.1
- **Ledger Version**: 8.0.2 (Ledger 8, production)
- **Runtime Package**: @midnight-ntwrk/compact-runtime 0.16.0

## Installation

### Compact Compiler 0.31.1

The Compact compiler is installed from the official GitHub releases:

```bash
# Download compiler for Linux x86_64
curl -L -o compactc.zip https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_x86_64-unknown-linux-musl.zip

# Extract
unzip compactc.zip

# The extracted files include:
# - compactc: Compiler wrapper script
# - compactc.bin: Compiler binary
# - zkir, zkir-v3: Zero-knowledge intermediate representation tools
# - format-compact, fixup-compact: Code formatting utilities
```

Verify installation:

```bash
./compactc --version
# Output: 0.31.1

./compactc --ledger-version
# Output: ledger-8.0.2

./compactc --runtime-version
# Output: 0.16.0
```

### Midnight Runtime Package

The Compact runtime package version is determined by the compiler's `--runtime-version` output:

```bash
npm install @midnight-ntwrk/compact-runtime@0.16.0
```

**Important**: Package versions do not match compiler versions. The compiler version is 0.31.1, but the required runtime package is 0.16.0. Always use the version reported by `./compactc --runtime-version`.

## Compilation

Compile the contract:

```bash
npm run compile
```

This executes:

```bash
./compactc contract/quest-attestation.compact ./compiled
```

The compiler generates:

- `compiled/contract/` - TypeScript/JavaScript contract bindings
  - `index.js` - Contract implementation
  - `index.d.ts` - TypeScript type definitions
  - `index.js.map` - Source maps
- `compiled/zkir/` - Zero-knowledge intermediate representation
  - `*.zkir` - Circuit descriptions
  - `*.bzkir` - Binary circuit format
- `compiled/keys/` - Cryptographic keys
  - `*.prover` - Proving keys for generating attestations
  - `*.verifier` - Verifier keys for checking attestations
- `compiled/compiler/` - Compiler metadata
  - `contract-info.json` - Contract specification

### Compilation Output

The contract compiles successfully and generates 4 circuits:

1. **recordQuest** (requires ZK attestation) - Records a quest attestation
2. **checkAttestation** (no ZK attestation) - Selective disclosure check
3. **hasCommitment** (requires ZK attestation) - Query if commitment exists
4. **hasNullifier** (requires ZK attestation) - Query if nullifier is used
5. **getCounterValue** (requires ZK attestation) - Get total attestation count

## Contract Architecture

### Ledger State (Public)

- `commitment: Bytes<32>` - Cryptographic hash of quest completion
- `nullifier: Bytes<32>` - Unique identifier to prevent duplicate records
- `counter: Counter` - Total number of attestations
- `isSet: Boolean` - Whether the current slot is used

### Witnesses (Private)

- `questId(): Bytes<32>` - Quest identifier
- `versionNum(): Uint<16>` - Quest version
- `userSecret(): Bytes<32>` - User's secret
- `saltValue(): Bytes<32>` - Random salt

### Privacy Model

The commitment is computed as:

```
commitment = persistentHash([pad("quest"), questId, userSecret, salt, version])
```

All private inputs (quest details, user secret) remain as witnesses on the user's device. Only the commitment hash appears on the public ledger, preserving privacy while enabling selective disclosure.

## Platform Support

The Compact compiler is available for:

- Linux: x86_64, aarch64
- macOS: Apple Silicon (aarch64), Intel (x86_64)

## References

- Compact Repository: https://github.com/LFDT-Minokawa/compact
- Compact Releases: https://github.com/LFDT-Minokawa/compact/releases
- Midnight Network: https://midnight.network

# Quest Attestation - Midnight Network

A privacy-focused quest completion attestation system built on Midnight Network for Buildathon Wave 2. Records quest completions on-chain without revealing personal data.

## What is Quest Attestation?

Quest Attestation is a Compact smart contract that allows users to record quest completions on the Midnight blockchain while maintaining privacy. The public ledger stores only cryptographic commitments (hashes), while personal data remains private on the user's device. Users can selectively disclose their quest completions through zero-knowledge circuits without revealing sensitive information.

### Key Features

- **Privacy-preserving attestations**: Quest details and user secrets never appear on the public ledger
- **Commitment-based storage**: Only cryptographic hashes are stored on-chain
- **Selective disclosure**: Users can check attestations without revealing private data
- **Double-spend protection**: Nullifiers prevent duplicate attestation records
- **On-chain counter**: Track total number of attestations recorded

## Architecture

### Contract Structure

The `QuestAttestation` contract uses Set-based storage to support multiple users and quests:

1. **Commitments** (`Set<Bytes<32>>`): Set of cryptographic hashes of quest completions
2. **Nullifiers** (`Set<Bytes<32>>`): Set of nullifiers to prevent duplicate attestation records  
3. **Counter** (`Counter`): Tracks total number of attestations

### Private Data (Witnesses)

The following data remains private and is never revealed on the blockchain:

- `questId`: Unique identifier for the quest
- `versionNum`: Quest version number
- `userSecret`: User's private secret for commitment
- `localSecretKey`: User's local secret key for nullifier derivation
- `saltValue`: Random salt for commitment generation

### Circuits

#### `recordQuest` (Zero-Knowledge Circuit)

Records a quest attestation by computing a commitment from private inputs and storing it on-chain along with a derived nullifier. The circuit ensures:

- Commitment is computed as: `persistentHash(questId, version, userSecret, salt)`
- Nullifier is derived internally as: `persistentHash(domain_separator, localSecretKey, questId)`
- Derived nullifier has not been used previously (prevents double recording)
- Counter is incremented
- Private inputs remain hidden
- Supports multiple users and multiple quests

#### `checkAttestation` (Selective Disclosure Circuit)

Allows users to check if they have a valid attestation for a quest without revealing their secret or other details. The circuit:

- Recomputes commitment from private inputs
- Checks if commitment exists on ledger
- Returns result without exposing private data

#### Query Circuits

- `hasCommitment`: Check if a specific commitment exists
- `hasNullifier`: Check if a nullifier has been used
- `getCounter`: Get total attestation count

## How Midnight is Used

This project leverages Midnight Network's unique capabilities:

### Zero-Knowledge Circuits

The contract uses Midnight's zero-knowledge circuit system to enable private transactions. Circuits allow computation to occur without revealing private inputs (witnesses).

### Compact Language

Written in Compact, Midnight's domain-specific language for zero-knowledge smart contracts. Compact provides:

- Native support for zero-knowledge circuits
- Type-safe ledger state management
- Private witness (input) handling
- Cryptographic primitives (hashing, commitments)

### Ledger Integration

The contract interacts with Midnight's ledger (Ledger 8) through:

- **Set storage**: Efficient collection storage for commitments and nullifiers
- **Counter storage**: Tracks total attestation count
- **State updates**: Atomic updates to ledger state within circuits
- **Query operations**: Read-only access to ledger data

### Privacy Model

Midnight's privacy model separates:

- **Public state**: Stored on the ledger (commitments, nullifiers, counter)
- **Private state**: Held by users as witnesses (quest details, secrets)
- **Zero-knowledge circuits**: Enable selective disclosure without revealing private data
- **Unlinkable disclosure**: Challenge-bound responses prevent linking attestations across different requests

Note: Circuit generation and execution runs entirely in the user's own local environment, not on external servers.

## Setup

### Prerequisites

- Node.js 18 or later
- npm or yarn
- Compact toolchain 0.31.1 (compatible with Ledger 8)

### Installing Compact Toolchain 0.31.1

Download and install the Compact compiler from the official GitHub releases:

```bash
# Download for Linux x86_64
curl -L -o compactc.zip https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_x86_64-unknown-linux-musl.zip

# Extract
unzip compactc.zip

# Verify installation
./compactc --version
# Output: 0.31.1

./compactc --ledger-version
# Output: ledger-8.0.2
```

For other platforms (macOS, Linux aarch64), download the appropriate release from:
https://github.com/LFDT-Minokawa/compact/releases/tag/compactc-v0.31.1

### Project Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd quest-attestation-midnight
```

2. Install dependencies:

```bash
npm install
```

This installs the following Midnight package:

- `@midnight-ntwrk/compact-runtime@0.16.0`: Compact runtime library

**Note**: The runtime package version (0.16.0) differs from the compiler version (0.31.1). Always use the version reported by `./compactc --runtime-version`.

### Compile the Contract

```bash
npm run compile
```

This compiles `contract/quest-attestation.compact` using the Compact compiler version 0.31.1.

The compiler generates:

- `compiled/contract/` - TypeScript/JavaScript bindings (`index.js`, `index.d.ts`)
- `compiled/zkir/` - Zero-knowledge circuit descriptions (`*.zkir`, `*.bzkir`)
- `compiled/keys/` - Cryptographic keys for circuit execution (`*.prover`, `*.verifier`)
- `compiled/compiler/` - Contract metadata (`contract-info.json`)

The contract compiles 5 circuits with ZK circuit generation:

1. `recordQuest` - Records a quest attestation
2. `checkAttestation` - Unlinkable attestation disclosure check (returns challenge-bound response)
3. `hasCommitment` - Query if commitment exists
4. `hasNullifier` - Query if nullifier is used
5. `getCounterValue` - Get total attestation count

All circuit ZKIRs are generated in `compiled/zkir/`, including `checkAttestation.zkir`.

### Run Tests

```bash
npm test
```

Tests use the Midnight Compact runtime with the compiled contract and cover:

- **recordQuest circuit** (5 tests)
  - Successfully record quest attestations
  - Allow multiple users and multiple quests
  - Reject duplicate nullifier (double recording prevention)
  - Counter increments correctly

- **checkAttestation circuit** (3 tests)
  - Return challenge-bound response for existing attestation with correct inputs
  - Fail check with wrong secret
  - Return different responses for different challenges (unlinkability)

- **hasCommitment circuit** (2 tests)
  - Return true for recorded commitments
  - Return false for non-existent commitments

- **hasNullifier circuit** (2 tests)
  - Return true for used nullifiers
  - Return false for unused nullifiers

- **getCounterValue circuit** (2 tests)
  - Return 0 for initial state
  - Return correct count after multiple attestations

- **Privacy model** (2 tests)
  - Demonstrate nullifier derivation from local secret
  - Multiple users record without revealing secrets

All 16 tests pass using local simulation with the compiled contract.

### Development

Run tests in watch mode during development:

```bash
npm run test:watch
```

## Progress in This Wave

### Completed

- Compact contract implementation (`QuestAttestation`)
- Zero-knowledge circuits for recording and selective disclosure
- Commitment-based privacy model
- Nullifier-based double-spend protection
- Successful compilation with Compact 0.31.1
- Generated proving and verifier keys
- Documentation and setup instructions
- Toolchain installation (0.31.1 for Ledger 8 compatibility)

### Midnight demo web (`demo-web/`)

Browser demo for the Buildathon (seller `recordQuest` + buyer `checkAttestation` against the local simulator). See [demo-web/README.md](demo-web/README.md).

### Next Steps (Not Yet Implemented)

- **Preprod Deployment**: Deploy contract to Midnight Preprod testnet
- **CLI Demo**: Command-line interface for interacting with deployed contract
  - Record quest attestations
  - Check attestations with selective disclosure
  - Query public ledger state (commitments, nullifiers, counter)
- **Network Integration**: Configure Midnight network connectivity
- **Wallet Integration**: Connect user wallets for transaction signing

## Technical Specifications

- **Ledger Version**: 8.0.2
- **Compact Compiler**: 0.31.1
- **Runtime Package**: @midnight-ntwrk/compact-runtime 0.16.0
- **Contract Language**: Compact
- **License**: Apache-2.0

## Contract API

### Recording a Quest

```javascript
// Private inputs (witnesses)
const questId = new Uint8Array(32);        // 32 bytes
const version = 1;                         // 16-bit unsigned integer
const userSecret = new Uint8Array(32);     // 32 bytes
const localSecretKey = new Uint8Array(32); // 32 bytes for nullifier derivation
const salt = new Uint8Array(32);           // 32 bytes

// Calls recordQuest circuit (nullifier derived internally)
await contract.recordQuest(questId, version, userSecret, localSecretKey, salt);
```

### Checking an Attestation (Unlinkable Disclosure)

```javascript
// Public inputs
const challenge = new Uint8Array(32);  // Per-requester challenge
const questId = new Uint8Array(32);    // Quest identifier

// Private inputs (witnesses)
const version = 1;
const userSecret = new Uint8Array(32);
const salt = new Uint8Array(32);

// Calls checkAttestation circuit - returns challenge-bound response
const response = await contract.checkAttestation(challenge, questId, version, userSecret, salt);
// Response is bound to challenge and questId, does not reveal commitment
```

### Querying Public State

```javascript
// Check if commitment exists
const commitment = "0x...";
const exists = await contract.hasCommitment(commitment);

// Check if nullifier used
const nullifier = "0x...";
const used = await contract.hasNullifier(nullifier);

// Get total attestation count
const count = await contract.getCounter();
```

## Security Considerations

- **Private data never leaves the device**: Quest details and user secrets are witnesses only
- **Commitments are one-way**: Cannot reverse a commitment to reveal original data
- **Nullifiers prevent replay**: Same attestation cannot be recorded twice
- **Unlinkable disclosure**: Challenge-bound responses prevent linking attestations; the commitment itself is never revealed
- **No cross-quest linkability**: Different quests by the same user cannot be linked on-chain

## Known privacy limitations (Wave 2 demo)

This is a constraint of this demo's checking implementation reusing the same public value, not a general property of Midnight. The `checkAttestation` circuit recomputes the same commitment from fixed private inputs (questId, version, userSecret, salt) and discloses it via `Set.member(disclose(comm))` during each verification. This means:

- **Names, company names, secret values, and transaction contents are not put on-chain** - these remain private as witnesses
- **A third party without the secret could link check records** and infer timing patterns, check frequency counts, and requester activity patterns by observing the same disclosed commitment value appearing in multiple transactions
- **This demo assumes use with a limited set of requesters** and does not guarantee production-grade anonymity or unlinkability
- **Production use would need**:
  - Fresh randomness per commitment to prevent reuse
  - Review of re-identification risk from public transaction data, fees, and wallet information
  - A Merkle-tree based unlinkable check (planned for Wave 3) that discloses only tree roots, not individual commitments

**References**:
- [How Midnight keeps data private](https://docs.midnight.network/concepts/how-midnight-works/keeping-data-private)
- [Security best practices](https://docs.midnight.network/guides/security-best-practices)

## Additional Limitations

- **No issuer backing yet**: The current implementation does not include issuer signatures or attestation from trusted parties. This feature is planned for Wave 3.
- **Local execution only**: This Wave 2 implementation runs in local simulation. Network deployment requires additional setup.

## Contributing

This project is part of Midnight Network Buildathon Wave 2. Contributions should maintain privacy guarantees and follow Compact best practices.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

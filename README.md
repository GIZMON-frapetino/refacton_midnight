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

### Zero-Knowledge Proofs

The contract uses Midnight's zero-knowledge circuit system to enable private transactions. The `@zk` annotation marks circuits that generate zero-knowledge attestations, allowing computation to occur without revealing inputs.

### Compact Language

Written in Compact, Midnight's domain-specific language for zero-knowledge smart contracts. Compact provides:

- Native support for zero-knowledge circuits
- Type-safe ledger state management
- Private witness (input) handling
- Cryptographic primitives (hashing, commitments)

### Ledger Integration

The contract interacts with Midnight's ledger (Ledger 8) through:

- **Mappings**: Efficient key-value storage for commitments and nullifiers
- **State updates**: Atomic updates to ledger state within circuits
- **Query operations**: Read-only access to ledger data

### Privacy Model

Midnight's privacy model separates:

- **Public state**: Stored on the ledger (commitments, nullifiers, counter)
- **Private state**: Held by users as witnesses (quest details, secrets)
- **Zero-knowledge attestations**: Enable selective disclosure without revealing private data

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
- `compiled/keys/` - Proving and verifier keys (`*.prover`, `*.verifier`)
- `compiled/compiler/` - Contract metadata (`contract-info.json`)

The contract compiles 5 circuits:

1. `recordQuest` - Records a quest attestation (ZK attestation required)
2. `checkAttestation` - Selective disclosure check
3. `hasCommitment` - Query if commitment exists (ZK attestation required)
4. `hasNullifier` - Query if nullifier is used (ZK attestation required)
5. `getCounterValue` - Get counter value (ZK attestation required)

### Run Tests

```bash
npm test
```

Tests use the Midnight Compact runtime with the compiled contract and cover:

- **recordQuest circuit** (3 tests)
  - Successfully record quest attestations
  - Reject duplicate nullifier (double recording prevention)
  - Counter increments correctly

- **checkAttestation circuit** (3 tests)
  - Pass check for existing attestation with correct inputs
  - Fail check with wrong commitment
  - Fail check with wrong secret (selective disclosure)

- **hasCommitment circuit** (2 tests)
  - Return true for recorded commitments
  - Return false for non-existent commitments

- **hasNullifier circuit** (2 tests)
  - Return true for used nullifiers
  - Return false for unused nullifiers

- **getCounterValue circuit** (2 tests)
  - Return 0 for initial state
  - Return 1 after recording one attestation

- **Privacy model** (1 test)
  - Demonstrate selective disclosure without revealing secrets

All 13 tests pass using local simulation with the compiled contract.

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
const questId = "0x...";        // 32 bytes
const version = 1;              // 16-bit unsigned integer
const userSecret = "0x...";     // 32 bytes
const salt = "0x...";           // 32 bytes
const nullifier = "0x...";      // 32 bytes

// Calls recordQuest circuit
await contract.recordQuest(questId, version, userSecret, salt, nullifier);
```

### Checking an Attestation

```javascript
// Private inputs and expected result
const questId = "0x...";
const version = 1;
const userSecret = "0x...";
const salt = "0x...";
const expectedResult = true;    // expect attestation to exist

// Calls checkAttestation circuit (selective disclosure)
await contract.checkAttestation(questId, version, userSecret, salt, expectedResult);
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
- **Selective disclosure is safe**: Checking attestation does not leak private inputs
- **No linkability**: Different quests by the same user cannot be linked on-chain

## Contributing

This project is part of Midnight Network Buildathon Wave 2. Contributions should maintain privacy guarantees and follow Compact best practices.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

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

The `QuestAttestation` contract consists of three main components stored on the public ledger:

1. **Commitments** (`mapping(Bytes<32> => Bool)`): Stores cryptographic hashes of quest completions
2. **Nullifiers** (`mapping(Bytes<32> => Bool)`): Prevents duplicate attestation records
3. **Counter** (`Uint<32>`): Tracks total number of attestations

### Private Data (Witnesses)

The following data remains private and is never revealed on the blockchain:

- `questId`: Unique identifier for the quest
- `version`: Quest version number
- `userSecret`: User's private secret
- `salt`: Random salt for commitment generation
- `nullifier`: Unique value to prevent double recording

### Circuits

#### `recordQuest` (Zero-Knowledge Circuit)

Records a quest attestation by computing a commitment from private inputs and storing it on-chain along with a nullifier. The circuit ensures:

- Commitment is computed as: `hash(questId, version, userSecret, salt)`
- Nullifier has not been used previously
- Counter is incremented
- Private inputs remain hidden

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
- Compact toolchain 0.31.x (compatible with Ledger 8)

### Installing Compact Toolchain 0.31.x

The Compact compiler and toolchain version 0.31.x is required for this project. Follow the official Midnight documentation to install:

```bash
# Follow Midnight's official installation guide for version 0.31.x
# The exact installation steps depend on your operating system and architecture
# Refer to: https://docs.midnight.network/

# Verify installation
compact --version
# Should show version 0.31.x
```

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

This installs the following Midnight packages (version 0.31.x):

- `@midnight-ntwrk/compact-runtime`: Compact runtime library
- `@midnight-ntwrk/ledger`: Ledger interaction utilities
- `@midnight-ntwrk/midnight-js-contracts`: Contract SDK
- `@midnight-ntwrk/midnight-js-types`: TypeScript type definitions

### Compile the Contract

```bash
npm run compile
```

This compiles `contract/quest-attestation.compact` using the Compact compiler version 0.31.x. The compiled contract will be output in a format ready for deployment to the Midnight network.

### Run Tests

```bash
npm test
```

Tests run using the Midnight simulator and cover:

- Recording quest attestations
- Duplicate nullifier rejection
- Counter increment behavior
- Selective disclosure checks (pass/fail scenarios)
- Privacy model validation

The test suite uses local simulation and does not require network access or deployment.

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
- Local test suite with simulator
- Documentation and setup instructions
- Toolchain version pinning (0.31.x for Ledger 8 compatibility)

### Next Steps (Not Yet Implemented)

- **Preprod Deployment**: Deploy contract to Midnight Preprod testnet
- **CLI Demo**: Command-line interface for interacting with deployed contract
  - Record quest attestations
  - Check attestations with selective disclosure
  - Query public ledger state (commitments, nullifiers, counter)
- **Network Integration**: Configure Midnight network connectivity
- **Wallet Integration**: Connect user wallets for transaction signing

## Technical Specifications

- **Ledger Version**: 8
- **Compact Version**: 0.31.x
- **Midnight JS SDK**: 0.31.x
- **Contract Language**: Compact
- **Test Framework**: Jest with Node.js VM modules
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

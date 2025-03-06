# Jupiter Rewards System

A Solana Token-2022-based smart contract that implements a reward distribution system using Jupiter tokens.

## Features

- **Token-2022 Extensions**:
  - Transfer Fees Extension: Implements 5% tax on transactions
  - Permanent Delegate Authority: Enables contract-controlled withdrawals
  - Metadata Extension: Stores token information for governance

- **Reward Distribution**:
  - Automatically collects tax (5%) on transactions
  - Swaps SOL for Jupiter tokens
  - Distributes rewards every 5 minutes to eligible holders

## Prerequisites

- Node.js (v16 or later)
- Rust and Solana CLI
- Anchor Framework

## Installation

```bash
# Clone the repository
cd jupiter-rewards

# Install dependencies
npm install

# Build the program
anchor build
```

## Usage

### 1. Create the Jupiter token

```bash
npm run create-token
```

This will create a new Jupiter token with the Transfer Fee, Permanent Delegate, and Metadata extensions.

### 2. Initialize the program

```bash
npm run initialize
```

This will initialize the Jupiter Rewards program with a 5% tax rate and 5-minute reward interval.

### 3. Swap SOL for Jupiter tokens and distribute rewards

```bash
npm run swap-distribute
```

This will simulate swapping SOL for Jupiter tokens and distribute rewards to eligible holders.

## Testing

```bash
anchor test
```

## Deployment

1. Update the program ID in `Anchor.toml` and `lib.rs`
2. Build the program:
   ```bash
   anchor build
   ```
3. Deploy to Solana mainnet:
   ```bash
   anchor deploy --provider.cluster mainnet
   ```

## License

MIT 
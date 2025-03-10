# Jupiter Rewards

A Solana program for distributing rewards using Jupiter tokens with Token-2022 features.

## Overview

This program implements a reward distribution system using Solana's Token-2022 program. It allows:

- Creating Jupiter tokens with Token-2022 extensions
- Collecting taxes from token transfers
- Swapping SOL for Jupiter tokens
- Distributing rewards to token holders

## Prerequisites

- Node.js v16+ and npm
- Rust and Cargo
- Solana CLI tools
- Anchor Framework

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/jupiter-rewards.git
cd jupiter-rewards
```

2. Install dependencies:
```bash
npm install
```

3. Build the program:
```bash
anchor build
```

## Deployment

### Local Development

To deploy to a local validator:

1. Update the `Anchor.toml` file to use localnet:
```toml
[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"
```

2. Start a local validator:
```bash
solana-test-validator
```

3. Deploy the program:
```bash
npm run deploy
```

### Devnet Deployment

To deploy to devnet:

1. Update the `Anchor.toml` file:
```toml
[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"
```

2. Ensure you have SOL in your wallet:
```bash
solana airdrop 2 --url devnet
```

3. Deploy the program:
```bash
npm run deploy
```

### Mainnet Deployment

To deploy to mainnet:

1. Update the `Anchor.toml` file:
```toml
[provider]
cluster = "mainnet"
wallet = "~/.config/solana/id.json"
url = "YOUR_RPC_URL"
```

2. Ensure you have at least 3 SOL in your wallet for deployment costs.

3. Deploy the program:
```bash
npm run deploy
```

## Updating Token Metadata

After deploying your token, you can update its metadata (name, symbol, and logo) to make it appear correctly in wallets and explorers:

1. Edit the configuration in `scripts/update-token-metadata.ts`:
```typescript
// Configuration - CHANGE THESE VALUES
const TOKEN_NAME = "Jupiter Rewards"; // Change to your desired token name
const TOKEN_SYMBOL = "JUP"; // Change to your desired token symbol/ticker
const TOKEN_DESCRIPTION = "Jupiter Rewards token for the Jupiter ecosystem";
```

2. Get your token mint address from the deployment logs and update it in the script:
```typescript
const jupiterMintAddress = new PublicKey("YOUR_TOKEN_MINT_ADDRESS");
```

3. Alternatively, you can provide the token mint address as an environment variable:
```bash
TOKEN_MINT_ADDRESS=your_mint_address npm run update-metadata
```

4. Run the update metadata script:
```bash
npm run update-metadata
```

The script will:
- Generate a placeholder logo if one doesn't exist
- Upload the logo to Arweave
- Create or update the token metadata on-chain
- Display the transaction signature and confirmation

## Program Instructions

The program provides the following instructions:

- `initialize`: Initialize the program with tax rate and reward interval
- `createJupiterToken`: Create a Jupiter token with Token-2022 extensions
- `collectTax`: Collect taxes from token transfers
- `swapSolForJupiter`: Swap SOL for Jupiter tokens
- `distributeRewards`: Distribute rewards to token holders
- `forceUpdateLastDistribution`: Force update the last distribution timestamp

## Account Structure

- `StateAccount`: Stores program state including authority, tax rate, and reward interval
- `jupiter_mint`: The Jupiter token mint (Token-2022)
- `tax_vault`: Token account for collecting taxes
- `reward_vault`: Token account for distributing rewards

## License

MIT 
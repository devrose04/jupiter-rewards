# Jupiter Rewards

A Solana program for distributing rewards to Jupiter token holders using the Token-2022 program.

## Overview

Jupiter Rewards is a Solana program that implements a rewards distribution system for Jupiter tokens. The program leverages Solana's Token-2022 program to collect taxes on token transfers and distribute them as rewards to token holders.

## Features

- **Tax Collection**: Automatically collects taxes on token transfers using Token-2022 transfer fee extension
- **Reward Distribution**: Periodically distributes collected taxes as rewards to token holders
- **SOL Swaps**: Allows users to swap SOL for Jupiter tokens
- **Admin Controls**: Provides administrative functions for managing the reward system
- **Token Metadata**: Customizable token name, symbol, and logo using Metaplex Token Metadata

## Architecture

The program consists of several key components:

1. **State Account**: Stores the program's configuration and state
2. **Tax Vault**: Collects taxes from token transfers using Token-2022's transfer fee extension
3. **Reward Vault**: Holds tokens for distribution as rewards
4. **Mint Authority**: A PDA that has authority to mint Jupiter tokens
5. **Token Metadata**: On-chain metadata for the token including name, symbol, and logo

## Instructions

The program provides the following instructions:

1. **Initialize**: Sets up the program with the specified tax rate and reward interval
2. **Collect Tax**: Collects taxes from token transfers using Token-2022's transfer fee extension
3. **Swap SOL for Jupiter**: Allows users to swap SOL for Jupiter tokens
4. **Distribute Rewards**: Distributes rewards to token holders based on their holdings
5. **Force Update Last Distribution**: Administrative function to update the last distribution timestamp

## Token-2022 Integration

This program uses the Token-2022 program (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) which provides enhanced functionality over the standard Token program:

- **Transfer Fees**: Automatically collects fees on token transfers
- **InterfaceAccount**: Uses `InterfaceAccount` for compatibility with both Token and Token-2022 programs
- **Transfer Checked**: Uses the safer `transfer_checked` function that verifies mint and decimals

## Token Metadata

The token metadata (name, symbol, and logo) can be customized using the Metaplex Token Metadata program. This allows you to set a custom name, ticker symbol, and logo for your token that will be displayed in wallets and explorers.

### Changing Token Name and Symbol

To update your token's name and symbol:

1. Edit the configuration in `scripts/update-token-metadata.ts`:
   ```typescript
   // Configuration - CHANGE THESE VALUES
   const TOKEN_NAME = "Jupiter Rewards"; // Change to your desired token name
   const TOKEN_SYMBOL = "JPR"; // Change to your desired token symbol/ticker
   const TOKEN_DESCRIPTION = "Jupiter Rewards token for the Jupiter ecosystem";
   ```

2. Replace these values with your desired token name and symbol.

### Adding a Logo Image

To add or update your token's logo:

1. Place your logo image in the `assets/` directory (recommended formats: PNG or SVG)
2. Update the `LOGO_PATH` in `scripts/update-token-metadata.ts`:
   ```typescript
   const LOGO_PATH = "./assets/logo.svg"; // Path to your logo file
   ```

3. You can use the included placeholder logo generator to create a simple logo:
   ```bash
   yarn create-logo
   ```

### Updating Token Metadata

After deployment, you'll need to get your token's mint address:

1. Save your deployment logs:
   ```bash
   yarn deploy > deploy-logs.txt
   ```

2. Extract the mint address:
   ```bash
   yarn extract-mint deploy-logs.txt
   ```

3. Update the mint address in `scripts/update-token-metadata.ts`:
   ```typescript
   const jupiterMintAddress = new PublicKey("YOUR_TOKEN_MINT_ADDRESS");
   ```

4. Run the metadata update script:
   ```bash
   yarn update-metadata
   ```

See the [Token Metadata Instructions](./assets/README.md) for more details.

## Project Structure

```
jupiter-rewards/
├── programs/
│   └── jupiter-rewards/
│       ├── src/
│       │   └── lib.rs         # Main program code
│       └── Cargo.toml         # Program dependencies
├── tests/
│   └── jupiter-rewards.ts     # Test suite for the program
├── scripts/
│   ├── deploy.ts              # Deployment script
│   └── update-token-metadata.ts # Token metadata update script
├── assets/
│   └── README.md              # Token metadata instructions
├── Anchor.toml                # Anchor configuration
├── Cargo.toml                 # Workspace configuration
├── build.sh                   # Build script
└── README.md                  # This file
```

## Prerequisites

Before you begin, ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install) (version 1.69.0 or later)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (version 1.16.0 or later)
- [Anchor](https://www.anchor-lang.com/docs/installation) (version 0.28.0 or later)
- [Node.js and npm](https://nodejs.org/en/download/)
- [Yarn](https://yarnpkg.com/getting-started/install)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/devrose04/jupiter-rewards.git
   cd jupiter-rewards
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Install the required libssl library (needed for Anchor):
   ```bash
   wget http://nz2.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
   sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
   ```

## Building

To build the program:

```bash
./build.sh
```

This script will:
- Check if libssl.so.1.1 is installed and install it if needed
- Configure Cargo for better network handling
- Build the program using Anchor or Cargo directly
- Verify Token-2022 compatibility

## Testing

To run the tests:

```bash
anchor test
```

This will:
- Build the program
- Deploy it to a local Solana test validator
- Run the test suite

The test suite (`tests/jupiter-rewards.ts`) includes comprehensive tests for all the main functionality:
- Program initialization
- Swapping SOL for Jupiter tokens
- Reward distribution
- Preventing early reward distribution
- Administrative functions

## Deployment

### Prerequisites

Before deploying the program, ensure you have a running Solana validator. The deployment process connects to a validator at `http://localhost:8899` by default.

### Starting a Local Validator

To start a local Solana validator, run:

```bash
solana-test-validator
```

If you're using Anchor, you can use:

```bash
anchor localnet
```

Keep the validator running in a separate terminal window during development and deployment.

### Verifying Validator Status

You can check if your validator is running with:

```bash
solana cluster-version
```

### Deploying the Program

Once your validator is running, deploy the program with:

```bash
anchor deploy
```

or using the Solana CLI:

```bash
solana program deploy target/deploy/jupiter_rewards.so
```

### Troubleshooting

If you encounter a "Connection refused" error during deployment, it typically means the local validator isn't running. Start the validator and try again.

## Usage

### Initializing the Program

```typescript
await program.methods
  .initialize(taxRate, rewardIntervalMinutes)
  .accounts({
    state: statePda,
    authority: wallet.publicKey,
    jupiterMint: jupiterMint,
    taxVault: taxVault,
    rewardVault: rewardVault,
    systemProgram: anchor.web3.SystemProgram.programId,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

### Swapping SOL for Jupiter Tokens

```typescript
await program.methods
  .swapSolForJupiter(amount, minOutputAmount)
  .accounts({
    state: statePda,
    recipient: jupiterSwapProgram,
    jupiterMint: jupiterMint,
    rewardVault: rewardVault,
    mintAuthority: mintAuthorityPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();
```

### Distributing Rewards

```typescript
await program.methods
  .distributeRewards()
  .accounts({
    state: statePda,
    rewardVault: rewardVault,
    recipient: userJupiterAccount,
    jupiterVault: jupiterVault,
    jupiterMint: jupiterMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .rpc();
```

## Security Considerations

- The program uses PDAs for secure key derivation
- Access control is implemented for administrative functions
- Token accounts are properly validated to prevent unauthorized access
- The program uses `transfer_checked` for safer token transfers
- The program uses `InterfaceAccount` for Token-2022 compatibility

## Troubleshooting

If you encounter build issues:

1. Make sure libssl.so.1.1 is installed:
   ```bash
   wget http://nz2.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
   sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
   ```

2. Check your Anchor version (should be 0.28.0 or later):
   ```bash
   anchor --version
   ```

3. Try cleaning the build directory:
   ```bash
   cargo clean
   rm -f Cargo.lock
   ```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Solana](https://solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Token-2022 Program](https://spl.solana.com/token-2022)
- [Jupiter](https://jup.ag/) 
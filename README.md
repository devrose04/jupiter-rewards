# Jupiter Rewards

A Solana program for distributing rewards to Jupiter token holders.

## Overview

Jupiter Rewards is a Solana program that implements a rewards distribution system for Jupiter tokens. The program leverages Solana's Token-2022 program to collect taxes on token transfers and distribute them as rewards to token holders.

## Features

- **Tax Collection**: Automatically collects taxes on token transfers using Token-2022 transfer fee extension
- **Reward Distribution**: Periodically distributes collected taxes as rewards to token holders
- **SOL Swaps**: Allows users to swap SOL for Jupiter tokens
- **Admin Controls**: Provides administrative functions for managing the reward system

## Architecture

The program consists of several key components:

1. **State Account**: Stores the program's configuration and state
2. **Tax Vault**: Collects taxes from token transfers
3. **Reward Vault**: Holds tokens for distribution as rewards
4. **Mint Authority**: A PDA that has authority to mint Jupiter tokens

## Instructions

The program provides the following instructions:

1. **Initialize**: Sets up the program with the specified tax rate and reward interval
2. **Collect Tax**: Collects taxes from token transfers
3. **Swap SOL for Jupiter**: Allows users to swap SOL for Jupiter tokens
4. **Distribute Rewards**: Distributes rewards to token holders
5. **Force Update Last Distribution**: Administrative function to update the last distribution timestamp

## Project Structure

```
jupiter-rewards/
├── programs/
│   └── jupiter-rewards/
│       ├── src/
│       │   └── lib.rs         # Main program code
│       └── Cargo.toml         # Program dependencies
├── tests/                     # Test files
│   └── jupiter-rewards.ts     # Test suite
├── Anchor.toml                # Anchor configuration
├── Cargo.toml                 # Workspace configuration
├── build.sh                   # Build script
└── setup.sh                   # Setup script
```

## Prerequisites

Before you begin, ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Node.js and npm](https://nodejs.org/en/download/)
- [Yarn](https://yarnpkg.com/getting-started/install)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/jupiter-rewards.git
   cd jupiter-rewards
   ```

2. Run the setup script:
   ```bash
   ./setup.sh
   ```

   This script will:
   - Install Rust if not already installed
   - Install Solana CLI if not already installed
   - Install Anchor if not already installed
   - Install libssl.so.1.1 (required for Anchor)
   - Generate a new Solana keypair if one doesn't exist
   - Install Node.js dependencies

## Building

To build the program:

```bash
./build.sh
```

This script will:
- Check if libssl.so.1.1 is installed and install it if needed
- Clean up any previous build artifacts
- Build the program using Anchor or Cargo directly

## Testing

To run the tests:

```bash
anchor test
```

This will:
- Build the program
- Deploy it to a local Solana test validator
- Run the test suite

## Deployment

To deploy the program to a Solana cluster:

1. Configure your Solana CLI to use the desired cluster:
   ```bash
   # For mainnet
   solana config set --url https://falling-sleek-diagram.solana-mainnet.quiknode.pro/ea4bf92e2102ba33efed44f7ed02e04e0a3f9361
   
   # For devnet
   solana config set --url https://api.devnet.solana.com
   
   # For testnet
   solana config set --url https://api.testnet.solana.com
   ```

2. Deploy the program:
   ```bash
   anchor deploy
   ```

3. Update the program ID in your client code to match the deployed program ID.

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
    tokenProgram: TOKEN_PROGRAM_ID,
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
    tokenProgram: TOKEN_PROGRAM_ID,
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
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

## Security Considerations

- The program uses PDAs for secure key derivation
- Access control is implemented for administrative functions
- Token accounts are properly validated to prevent unauthorized access

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
- [Jupiter](https://jup.ag/) 
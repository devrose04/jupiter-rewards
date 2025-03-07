# Token Metadata Instructions

This directory contains assets for your Jupiter Rewards token, including the logo image.

## How to Update Token Metadata

1. Place your token logo image in this directory (recommended format: PNG, size: 200x200 pixels)
2. Update the `scripts/update-token-metadata.ts` file with your desired token information:
   - `TOKEN_NAME`: The display name of your token (e.g., "Jupiter Rewards")
   - `TOKEN_SYMBOL`: The ticker symbol of your token (e.g., "JPR")
   - `TOKEN_DESCRIPTION`: A brief description of your token
   - `LOGO_PATH`: Path to your logo file (e.g., "./assets/logo.png")
   - `jupiterMintAddress`: Update with your actual token mint address

3. Install the required dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn
   ```

4. Run the update metadata script:
   ```
   npm run update-metadata
   ```
   or
   ```
   yarn update-metadata
   ```

## Important Notes

- The token metadata is stored on-chain using the Metaplex Token Metadata program
- The image is uploaded to Arweave via Bundlr, which requires a small amount of SOL for storage fees
- Make sure your wallet has enough SOL to cover the transaction and storage fees
- This script works on both Devnet and Mainnet, depending on your Solana CLI configuration 
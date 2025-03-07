# Token Metadata Instructions

This directory contains assets for your Jupiter Rewards token, including the logo image.

## How to Update Token Metadata

### Changing Token Name and Symbol

1. Open the `scripts/update-token-metadata.ts` file in your editor
2. Locate the configuration section at the top of the file:
   ```typescript
   // Configuration - CHANGE THESE VALUES
   const TOKEN_NAME = "Jupiter Rewards"; // Change to your desired token name
   const TOKEN_SYMBOL = "JPR"; // Change to your desired token symbol/ticker
   const TOKEN_DESCRIPTION = "Jupiter Rewards token for the Jupiter ecosystem";
   ```
3. Update these values with your desired token name, symbol, and description
   - `TOKEN_NAME`: The full name of your token (e.g., "My Awesome Token")
   - `TOKEN_SYMBOL`: The ticker symbol, usually 3-4 characters (e.g., "MAT")
   - `TOKEN_DESCRIPTION`: A brief description of your token's purpose

### Adding a Logo Image

You have two options for adding a logo:

#### Option 1: Use the placeholder logo generator

1. Run the placeholder logo generator script:
   ```bash
   yarn create-logo
   ```
2. This will create a simple SVG logo with your token's initials in the `assets/` directory

#### Option 2: Use your own custom logo

1. Create your logo image (recommended formats: PNG or SVG, size: 200x200 pixels)
2. Place the logo file in this `assets/` directory
3. Update the `LOGO_PATH` in `scripts/update-token-metadata.ts`:
   ```typescript
   const LOGO_PATH = "./assets/your-logo-file.png"; // Path to your logo file
   ```

### Setting the Token Mint Address

After deploying your token, you need to update the script with your token's mint address:

1. Save your deployment logs:
   ```bash
   yarn deploy > deploy-logs.txt
   ```

2. Extract the mint address using the helper script:
   ```bash
   yarn extract-mint deploy-logs.txt
   ```

3. The script will display your token mint address and provide a command to update the script automatically:
   ```bash
   sed -i 's/YOUR_TOKEN_MINT_ADDRESS/YOUR_ACTUAL_MINT_ADDRESS/g' scripts/update-token-metadata.ts
   ```

4. Alternatively, manually update the mint address in `scripts/update-token-metadata.ts`:
   ```typescript
   const jupiterMintAddress = new PublicKey("YOUR_ACTUAL_MINT_ADDRESS");
   ```

### Running the Update Script

Once you've configured your token name, symbol, logo, and mint address:

1. Install the required dependencies:
   ```bash
   yarn
   ```

2. Run the update metadata script:
   ```bash
   yarn update-metadata
   ```

## Important Notes

- The token metadata is stored on-chain using the Metaplex Token Metadata program
- The image is uploaded to Arweave via Bundlr, which requires a small amount of SOL for storage fees
- Make sure your wallet has enough SOL to cover the transaction and storage fees
- This script works on both Devnet and Mainnet, depending on your Solana CLI configuration
- After updating the metadata, it may take some time for wallets and explorers to display the new information
- If you're updating existing metadata, the script will automatically detect this and perform an update instead of creating new metadata 
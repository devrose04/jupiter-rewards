import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import {
  Metaplex,
  keypairIdentity,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import fs from "fs";
import path from "path";

// Configuration - CHANGE THESE VALUES
const TOKEN_NAME = "Jupiter Rewards"; // Change to your desired token name
const TOKEN_SYMBOL = "JUP"; // Change to your desired token symbol/ticker
const TOKEN_DESCRIPTION = "Jupiter Rewards token for the Jupiter ecosystem";
const LOGO_PATH = "./assets/logo.svg"; // Path to your logo file

async function main() {
  try {
    // Configure the client to use the cluster specified in Anchor.toml
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = provider.wallet;
    
    console.log("Updating token metadata with wallet:", wallet.publicKey.toString());

    // Get the Jupiter token mint address from your deployment
    // You should replace this with your actual token mint address
    // You can find this in the logs when you run the deploy script
    const jupiterMintAddress = new PublicKey(process.env.TOKEN_MINT_ADDRESS || "YOUR_TOKEN_MINT_ADDRESS");
    console.log("Token mint address:", jupiterMintAddress.toString());

    if (jupiterMintAddress.toString() === "YOUR_TOKEN_MINT_ADDRESS") {
      console.error("ERROR: You need to set your actual token mint address!");
      console.error("Either:");
      console.error("1. Update the jupiterMintAddress in this file with your actual mint address");
      console.error("2. Run with TOKEN_MINT_ADDRESS environment variable: TOKEN_MINT_ADDRESS=your_mint_address npm run update-metadata");
      process.exit(1);
    }

    // Initialize Metaplex
    const metaplex = Metaplex.make(provider.connection)
      .use(keypairIdentity(wallet.payer as Keypair));

    // Check if the logo file exists
    if (!fs.existsSync(LOGO_PATH)) {
      console.log("Logo file not found at", LOGO_PATH);
      console.log("Generating a placeholder logo...");
      
      // Create a simple SVG logo as a placeholder
      const size = 200;
      const svgLogo = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 10}" fill="#6E56CF" />
        <text x="${size/2}" y="${size/2 + 10}" font-family="Arial" font-size="60" font-weight="bold" text-anchor="middle" fill="white">${TOKEN_SYMBOL.substring(0, 2)}</text>
      </svg>`;

      // Ensure the assets directory exists
      const assetsDir = path.dirname(LOGO_PATH);
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      // Write the SVG file
      fs.writeFileSync(LOGO_PATH, svgLogo);
      console.log(`Placeholder logo created at: ${LOGO_PATH}`);
    }

    // Upload the image
    console.log("Uploading token logo...");
    const logoBuffer = fs.readFileSync(LOGO_PATH);
    const logoMetaplexFile = toMetaplexFile(logoBuffer, path.basename(LOGO_PATH));
    const logoUri = await metaplex.storage().upload(logoMetaplexFile);
    console.log("Logo uploaded to:", logoUri);

    // Create the metadata JSON
    const metadata = {
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      description: TOKEN_DESCRIPTION,
      image: logoUri,
      attributes: [],
      properties: {
        files: [
          {
            uri: logoUri,
            type: path.extname(LOGO_PATH) === ".svg" ? "image/svg+xml" : "image/png",
          },
        ],
      },
    };

    // Upload the metadata
    console.log("Uploading token metadata...");
    const metadataUri = await metaplex.storage().uploadJson(metadata);
    console.log("Metadata uploaded to:", metadataUri);

    // Find the metadata PDA for the token
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        jupiterMintAddress.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    console.log("Metadata PDA:", metadataPDA.toString());

    try {
      // Check if metadata already exists
      const existingMetadata = await metaplex.nfts().findByMint({ mintAddress: jupiterMintAddress });
      
      console.log("Updating existing token metadata...");
      // Update the metadata
      const updateTx = await metaplex.nfts().update({
        nftOrSft: existingMetadata,
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: metadataUri,
      });
      
      console.log("Token metadata updated successfully!");
      console.log("Transaction signature:", updateTx.response.signature);
      console.log("New token name:", TOKEN_NAME);
      console.log("New token symbol:", TOKEN_SYMBOL);
    } catch (error) {
      console.log("Creating new token metadata...");
      // Create new metadata for an existing mint
      const createTx = await metaplex.nfts().create({
        uri: metadataUri,
        name: TOKEN_NAME,
        sellerFeeBasisPoints: 0,
        symbol: TOKEN_SYMBOL,
        // Use existing mint
        useExistingMint: jupiterMintAddress,
      });
      
      console.log("Token metadata created successfully!");
      console.log("Transaction signature:", createTx.response.signature);
      console.log("Token name:", TOKEN_NAME);
      console.log("Token symbol:", TOKEN_SYMBOL);
    }

    console.log("\nYour token should now appear in wallets and explorers with the updated metadata.");
    console.log("Note: It may take some time for wallets and explorers to display the new information.");
  } catch (error) {
    console.error("Error updating token metadata:", error);
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 
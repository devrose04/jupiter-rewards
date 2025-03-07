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
const TOKEN_SYMBOL = "JPR"; // Change to your desired token symbol/ticker
const TOKEN_DESCRIPTION = "Jupiter Rewards token for the Jupiter ecosystem";
const LOGO_PATH = "./assets/logo.svg"; // Path to your logo file

async function main() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet;
  
  console.log("Updating token metadata with wallet:", wallet.publicKey.toString());

  // Get the Jupiter token mint address from your deployment
  // You should replace this with your actual token mint address
  // You can find this in the logs when you run the deploy script
  const jupiterMintAddress = new PublicKey("YOUR_TOKEN_MINT_ADDRESS");
  console.log("Token mint address:", jupiterMintAddress.toString());

  // Initialize Metaplex
  const metaplex = Metaplex.make(provider.connection)
    .use(keypairIdentity(wallet.payer as Keypair));

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
          type: "image/svg+xml",
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
    console.log("Token name:", TOKEN_NAME);
    console.log("Token symbol:", TOKEN_SYMBOL);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// We'll use any type for now since the target types may not be generated yet
// import { JupiterRewards } from "../target/types/jupiter_rewards";
import { 
  PublicKey, 
  Keypair, 
  Connection, 
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";

// This is a workaround for the missing type
type AnyProgram = any;

// Configuration
const TAX_RATE = 500; // 5.00%
const REWARD_INTERVAL_SECONDS = 3600; // 1 hour in seconds

async function main() {
  try {
    // Configure the client to use the cluster specified in Anchor.toml
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.JupiterRewards as AnyProgram;
    const wallet = provider.wallet;
    
    console.log("Deploying Jupiter Rewards with wallet:", wallet.publicKey.toString());
    console.log("Program ID:", program.programId.toString());

    // Create a new Jupiter token mint
    console.log("Creating Jupiter token mint...");
    const jupiterMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9, // 9 decimals
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID // Token-2022 program ID
    );
    console.log("Jupiter token mint created:", jupiterMint.toString());

    // Derive PDA for state account
    const [stateAccount, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    console.log("State account PDA:", stateAccount.toString());

    // Derive PDA for mint authority
    const [mintAuthority, mintAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );
    console.log("Mint authority PDA:", mintAuthority.toString());

    // Create token accounts for tax and reward vaults
    console.log("Creating tax vault token account...");
    const taxVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      stateAccount,
      true, // allowOwnerOffCurve
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Tax vault created:", taxVault.address.toString());

    console.log("Creating reward vault token account...");
    const rewardVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      stateAccount,
      true, // allowOwnerOffCurve
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Reward vault created:", rewardVault.address.toString());

    // Initialize the program
    console.log("Initializing Jupiter Rewards program...");
    const tx = await program.methods
      .initialize(TAX_RATE, REWARD_INTERVAL_SECONDS)
      .accounts({
        state: stateAccount,
        authority: wallet.publicKey,
        jupiterMint: jupiterMint,
        taxVault: taxVault.address,
        rewardVault: rewardVault.address,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Jupiter Rewards initialized with transaction:", tx);
    console.log("Tax rate:", TAX_RATE / 100, "%");
    console.log("Reward interval:", REWARD_INTERVAL_SECONDS / 60, "minutes");

    // Create Jupiter token with Token-2022 extensions
    console.log("Creating Jupiter token with Token-2022 extensions...");
    const createTokenTx = await program.methods
      .createJupiterToken(9) // 9 decimals
      .accounts({
        state: stateAccount,
        authority: wallet.publicKey,
        jupiterMint: jupiterMint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Jupiter token created with transaction:", createTokenTx);

    // Create a user token account for testing
    console.log("Creating user token account...");
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      wallet.publicKey,
      false,
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    console.log("User token account created:", userTokenAccount.address.toString());

    // Test swap SOL for Jupiter tokens
    console.log("\nTesting swap SOL for Jupiter tokens...");
    const swapAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL
    const minOutputAmount = 10_000_000; // 10 tokens with 6 decimals
    
    try {
      const swapTx = await program.methods
        .swapSolForJupiter(
          new anchor.BN(swapAmount),
          new anchor.BN(minOutputAmount)
        )
        .accounts({
          state: stateAccount,
          user: wallet.publicKey,
          recipient: wallet.publicKey, // SOL recipient (could be a treasury)
          jupiterMint: jupiterMint,
          rewardVault: rewardVault.address,
          mintAuthority: mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      console.log("Swap completed with transaction:", swapTx);
    } catch (error) {
      console.error("Swap failed:", error);
      // Continue with deployment even if swap fails
    }

    console.log("Deployment complete!");
    console.log("\nTo interact with the program:");
    console.log("- State Account:", stateAccount.toString());
    console.log("- Jupiter Mint:", jupiterMint.toString());
    console.log("- Tax Vault:", taxVault.address.toString());
    console.log("- Reward Vault:", rewardVault.address.toString());
    console.log("- User Token Account:", userTokenAccount.address.toString());
  } catch (error) {
    console.error("Deployment failed with error:", error);
    throw error;
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 
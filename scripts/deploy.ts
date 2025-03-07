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
  getOrCreateAssociatedTokenAccount 
} from "@solana/spl-token";

// This is a workaround for the missing type
type AnyProgram = any;

// Configuration
const TAX_RATE = 500; // 5.00%
const REWARD_INTERVAL_MINUTES = 60; // 1 hour

async function main() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.JupiterRewards as AnyProgram;
  const wallet = provider.wallet;
  
  console.log("Deploying Jupiter Rewards with wallet:", wallet.publicKey.toString());

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
    new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") // Token-2022 program ID
  );
  console.log("Jupiter token mint created:", jupiterMint.toString());

  // Derive PDA for state account
  const [stateAccount, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );
  console.log("State account PDA:", stateAccount.toString());

  // Derive PDAs for tax and reward vaults
  const [taxVault, taxVaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_vault")],
    program.programId
  );
  console.log("Tax vault PDA:", taxVault.toString());

  const [rewardVault, rewardVaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_vault")],
    program.programId
  );
  console.log("Reward vault PDA:", rewardVault.toString());

  // Initialize the program
  console.log("Initializing Jupiter Rewards program...");
  const tx = await program.methods
    .initialize(TAX_RATE, REWARD_INTERVAL_MINUTES)
    .accounts({
      state: stateAccount,
      authority: wallet.publicKey,
      jupiterMint: jupiterMint,
      taxVault: taxVault,
      rewardVault: rewardVault,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("Jupiter Rewards initialized with transaction:", tx);
  console.log("Tax rate:", TAX_RATE / 100, "%");
  console.log("Reward interval:", REWARD_INTERVAL_MINUTES, "minutes");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 
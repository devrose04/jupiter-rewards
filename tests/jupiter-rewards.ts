import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { JupiterRewards } from "../target/types/jupiter_rewards";
import { 
  TOKEN_2022_PROGRAM_ID, 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo
} from "@solana/spl-token-2022";
import { expect } from "chai";

describe("jupiter-rewards", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.JupiterRewards as Program<JupiterRewards>;
  const wallet = provider.wallet as anchor.Wallet;

  let jupiterMint: anchor.web3.PublicKey;
  let taxVault: anchor.web3.PublicKey;
  let rewardVault: anchor.web3.PublicKey;
  let state: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let mintAuthority: anchor.web3.PublicKey;

  before(async () => {
    // Create a new token mint
    jupiterMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(`Created Jupiter mint: ${jupiterMint.toString()}`);

    // Derive PDA addresses
    [state] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );

    [taxVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tax_vault")],
      program.programId
    );

    [rewardVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault")],
      program.programId
    );

    [mintAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );

    // Create user token account
    const userAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      wallet.publicKey,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    userTokenAccount = userAccount.address;

    console.log(`Created user token account: ${userTokenAccount.toString()}`);
  });

  it("Initializes the program", async () => {
    // Initialize the program
    await program.methods
      .initialize(
        500, // 5% tax rate
        5     // 5 minutes reward interval
      )
      .accounts({
        state,
        authority: wallet.publicKey
      });
  });
}); 
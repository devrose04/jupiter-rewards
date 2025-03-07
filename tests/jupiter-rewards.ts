import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
// We'll use any type for now since the target types may not be generated yet
// import { JupiterRewards } from "../target/types/jupiter_rewards";
import { 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount
} from "@solana/spl-token";
import { expect } from "chai";

// This is a workaround for the missing type
type AnyProgram = any;

describe("jupiter-rewards", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.JupiterRewards as AnyProgram;
  const wallet = provider.wallet;
  
  // Test configuration
  const TAX_RATE = 500; // 5.00%
  const REWARD_INTERVAL_MINUTES = 1; // 1 minute for testing
  
  // Test accounts
  let jupiterMint: PublicKey;
  let stateAccount: PublicKey;
  let taxVault: PublicKey;
  let rewardVault: PublicKey;
  let userTokenAccount: PublicKey;
  let user: Keypair;
  
  // Token-2022 program ID
  const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

  before(async () => {
    // Create a new user
    user = Keypair.generate();
    
    // Fund the user with SOL
    const fundTx = await provider.connection.requestAirdrop(
      user.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(fundTx);
    
    // Create Jupiter token mint
    jupiterMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9, // 9 decimals
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create user token account
    const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      user.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    userTokenAccount = userTokenAccountInfo.address;
    
    // Mint some tokens to the user
    await mintTo(
      provider.connection,
      wallet.payer,
      jupiterMint,
      userTokenAccount,
      wallet.publicKey,
      1000 * 10**9, // 1000 tokens
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Derive PDAs
    [stateAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    
    [taxVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_vault")],
      program.programId
    );
    
    [rewardVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault")],
      program.programId
    );
  });

  it("Initializes the program", async () => {
    // Initialize the program
    await program.methods
      .initialize(TAX_RATE, REWARD_INTERVAL_MINUTES)
      .accounts({
        state: stateAccount,
        authority: wallet.publicKey,
        jupiterMint: jupiterMint,
        taxVault: taxVault,
        rewardVault: rewardVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    
    // Verify state account data
    const stateData = await program.account.stateAccount.fetch(stateAccount);
    expect(stateData.authority.toString()).to.equal(wallet.publicKey.toString());
    expect(stateData.jupiterMint.toString()).to.equal(jupiterMint.toString());
    expect(stateData.taxVault.toString()).to.equal(taxVault.toString());
    expect(stateData.rewardVault.toString()).to.equal(rewardVault.toString());
    expect(stateData.taxRate).to.equal(TAX_RATE);
    expect(stateData.rewardIntervalMinutes).to.equal(REWARD_INTERVAL_MINUTES);
  });

  it("Swaps SOL for Jupiter tokens", async () => {
    const swapAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL
    const minOutputAmount = 10 * 10**9; // 10 Jupiter tokens
    
    // Get initial reward vault balance
    const initialRewardVaultInfo = await getAccount(
      provider.connection,
      rewardVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const initialRewardVaultBalance = Number(initialRewardVaultInfo.amount);
    
    // Swap SOL for Jupiter
    await program.methods
      .swapSolForJupiter(
        new anchor.BN(swapAmount),
        new anchor.BN(minOutputAmount)
      )
      .accounts({
        state: stateAccount,
        recipient: wallet.publicKey, // In a real implementation, this would be Jupiter program
        jupiterMint: jupiterMint,
        rewardVault: rewardVault,
        mintAuthority: PublicKey.findProgramAddressSync(
          [Buffer.from("mint_authority")],
          program.programId
        )[0],
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    // Verify reward vault balance increased
    const updatedRewardVaultInfo = await getAccount(
      provider.connection,
      rewardVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const updatedRewardVaultBalance = Number(updatedRewardVaultInfo.amount);
    
    expect(updatedRewardVaultBalance).to.be.greaterThan(initialRewardVaultBalance);
    expect(updatedRewardVaultBalance - initialRewardVaultBalance).to.equal(minOutputAmount);
  });

  it("Distributes rewards after interval has passed", async () => {
    // Wait for the reward interval to pass
    console.log("Waiting for reward interval to pass...");
    await new Promise(resolve => setTimeout(resolve, REWARD_INTERVAL_MINUTES * 60 * 1000));
    
    // Get initial balances
    const initialUserTokenInfo = await getAccount(
      provider.connection,
      userTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const initialUserBalance = Number(initialUserTokenInfo.amount);
    
    const initialRewardVaultInfo = await getAccount(
      provider.connection,
      rewardVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const initialRewardVaultBalance = Number(initialRewardVaultInfo.amount);
    
    // Distribute rewards
    await program.methods
      .distributeRewards()
      .accounts({
        state: stateAccount,
        rewardVault: rewardVault,
        recipient: userTokenAccount,
        jupiterVault: userTokenAccount,
        jupiterMint: jupiterMint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    // Verify balances after distribution
    const updatedUserTokenInfo = await getAccount(
      provider.connection,
      userTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const updatedUserBalance = Number(updatedUserTokenInfo.amount);
    
    const updatedRewardVaultInfo = await getAccount(
      provider.connection,
      rewardVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const updatedRewardVaultBalance = Number(updatedRewardVaultInfo.amount);
    
    // User balance should increase
    expect(updatedUserBalance).to.be.greaterThan(initialUserBalance);
    
    // Reward vault balance should decrease
    expect(updatedRewardVaultBalance).to.be.lessThan(initialRewardVaultBalance);
  });

  it("Cannot distribute rewards too early", async () => {
    try {
      // Try to distribute rewards immediately after previous distribution
      await program.methods
        .distributeRewards()
        .accounts({
          state: stateAccount,
          rewardVault: rewardVault,
          recipient: userTokenAccount,
          jupiterVault: userTokenAccount,
          jupiterMint: jupiterMint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      
      // Should not reach here
      expect.fail("Expected error but distribution succeeded");
    } catch (error) {
      // Verify the error is the expected one
      expect(error.toString()).to.include("TooEarlyForDistribution");
    }
  });

  it("Can force update last distribution time", async () => {
    // Get current state
    const initialState = await program.account.stateAccount.fetch(stateAccount);
    const initialLastDistribution = initialState.lastDistribution;
    
    // Set last distribution to 1 hour ago
    const newTimestamp = Math.floor(Date.now() / 1000) - 3600;
    
    await program.methods
      .forceUpdateLastDistribution(new anchor.BN(newTimestamp))
      .accounts({
        state: stateAccount,
        authority: wallet.publicKey,
      })
      .rpc();
    
    // Verify state was updated
    const updatedState = await program.account.stateAccount.fetch(stateAccount);
    expect(updatedState.lastDistribution.toString()).to.equal(newTimestamp.toString());
    expect(updatedState.lastDistribution.toString()).to.not.equal(initialLastDistribution.toString());
  });
}); 
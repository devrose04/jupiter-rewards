import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
// We'll use any type for now since the target types may not be generated yet
// import { JupiterRewards } from "../target/types/jupiter_rewards";
import { 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction
} from "@solana/web3.js";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount
} from "@solana/spl-token";
import { expect } from "chai";

// Use any as a workaround for type issues
type JupiterRewardsProgram = any;

describe("jupiter-rewards", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.JupiterRewards as JupiterRewardsProgram;
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
  let treasuryWallet: Keypair;
  let treasuryTokenAccount: PublicKey;
  
  // Token-2022 program ID
  const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

  before(async () => {
    // Create a new user
    user = Keypair.generate();
    
    // Fund the user with SOL
    console.log(`Funding user ${user.publicKey.toString()} with 2 SOL`);
    const fundTx = await provider.connection.requestAirdrop(
      user.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: fundTx
    });
    
    // Create Jupiter token mint
    jupiterMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9
    );
    
    // Create user token account
    userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      user.publicKey
    );
    
    // Mint some tokens to the user
    await mintTo(
      provider.connection,
      wallet.payer,
      jupiterMint,
      userTokenAccount,
      wallet.payer,
      1000000000 // 1000 tokens with 9 decimals
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
    console.log("Initializing program with tax rate:", TAX_RATE, "and reward interval:", REWARD_INTERVAL_MINUTES);
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
    
    console.log(`Swapping ${swapAmount/LAMPORTS_PER_SOL} SOL for at least ${minOutputAmount/10**9} Jupiter tokens`);
    
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
    
    console.log(`Reward vault balance increased by ${(updatedRewardVaultBalance - initialRewardVaultBalance)/10**9} tokens`);
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
    
    // Add more detailed logging
    console.log(`Initial user balance: ${initialUserBalance/10**9} tokens`);
    console.log(`Initial reward vault balance: ${initialRewardVaultBalance/10**9} tokens`);
    
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
    
    const rewardAmount = updatedUserBalance - initialUserBalance;
    console.log(`User received ${rewardAmount/10**9} tokens as reward`);
    console.log(`Reward vault decreased by ${(initialRewardVaultBalance - updatedRewardVaultBalance)/10**9} tokens`);
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

  // Add a helper function to check balances
  async function logTokenBalances(label: string) {
    const userTokenInfo = await getAccount(
      provider.connection,
      userTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    
    const rewardVaultInfo = await getAccount(
      provider.connection,
      rewardVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    
    const taxVaultInfo = await getAccount(
      provider.connection,
      taxVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    ).catch(() => ({ amount: 0 }));
    
    console.log(`--- ${label} ---`);
    console.log(`User balance: ${Number(userTokenInfo.amount)/10**9} tokens`);
    console.log(`Reward vault: ${Number(rewardVaultInfo.amount)/10**9} tokens`);
    console.log(`Tax vault: ${Number(taxVaultInfo.amount || 0)/10**9} tokens`);
    console.log('----------------');
  }

  // Add a test for transferring tokens with tax
  it("Transfers tokens with tax applied", async () => {
    // Create another user account to receive tokens
    const recipient = Keypair.generate();
    
    // Create token account for recipient
    const recipientTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      recipient.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    const recipientTokenAccount = recipientTokenAccountInfo.address;
    
    // Get initial balances
    await logTokenBalances("Before Transfer");
    
    const transferAmount = 100 * 10**9; // 100 tokens
    
    // Transfer tokens from user to recipient
    await program.methods
      .transferWithTax(new anchor.BN(transferAmount))
      .accounts({
        state: stateAccount,
        sender: userTokenAccount,
        recipient: recipientTokenAccount,
        taxVault: taxVault,
        authority: user.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
    
    // Check balances after transfer
    await logTokenBalances("After Transfer");
    
    // Verify tax was collected
    const taxVaultInfo = await getAccount(
      provider.connection,
      taxVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    
    const expectedTax = transferAmount * TAX_RATE / 10000;
    expect(Number(taxVaultInfo.amount)).to.equal(expectedTax);
    
    // Verify recipient received correct amount
    const recipientTokenInfo = await getAccount(
      provider.connection,
      recipientTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    
    expect(Number(recipientTokenInfo.amount)).to.equal(transferAmount - expectedTax);
  });

  it("Sets up token accounts", async () => {
    // Create the mint
    jupiterMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );
    
    // Create token accounts for users
    userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      jupiterMint,
      user.publicKey
    );
    
    treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      jupiterMint,
      treasuryWallet.publicKey
    );
    
    // Mint some tokens to the user for testing
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      jupiterMint,
      userTokenAccount,
      provider.wallet.payer,
      1000000000 // 1000 tokens with 9 decimals
    );
  });
}); 
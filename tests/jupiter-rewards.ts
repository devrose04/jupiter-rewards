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
  getAccount,
  getMint
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
  const REWARD_INTERVAL_SECONDS = 60; // 1 minute for testing (in seconds)
  
  // Test accounts
  let jupiterMint: PublicKey;
  let stateAccount: PublicKey;
  let taxVault: PublicKey;
  let rewardVault: PublicKey;
  let userTokenAccount: PublicKey;
  let mintAuthority: PublicKey;
  let user: Keypair;
  let treasuryWallet: Keypair;
  let treasuryTokenAccount: PublicKey;
  
  // Token-2022 program ID
  const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

  before(async () => {
    console.log("Setting up test environment...");
    
    // Create a new user
    user = Keypair.generate();
    treasuryWallet = Keypair.generate();
    
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
    
    // Create Jupiter token mint with Token-2022
    console.log("Creating Jupiter token mint with Token-2022...");
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
    console.log("Jupiter token mint created:", jupiterMint.toString());
    
    // Derive PDAs
    [stateAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    console.log("State account PDA:", stateAccount.toString());
    
    [mintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );
    console.log("Mint authority PDA:", mintAuthority.toString());
    
    // Create token accounts
    console.log("Creating user token account...");
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
    console.log("User token account created:", userTokenAccount.toString());
    
    console.log("Creating treasury token account...");
    const treasuryTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      treasuryWallet.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    treasuryTokenAccount = treasuryTokenAccountInfo.address;
    console.log("Treasury token account created:", treasuryTokenAccount.toString());
    
    // Mint some tokens to the user
    console.log("Minting tokens to user...");
    await mintTo(
      provider.connection,
      wallet.payer,
      jupiterMint,
      userTokenAccount,
      wallet.payer,
      1000000000, // 1000 tokens with 9 decimals
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Minted 1000 tokens to user");
  });

  it("Initializes the program", async () => {
    console.log("Initializing program with tax rate:", TAX_RATE, "and reward interval:", REWARD_INTERVAL_SECONDS / 60, "minutes");
    
    // Create token accounts for tax and reward vaults
    console.log("Creating tax vault token account...");
    const taxVaultInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      stateAccount,
      true, // allowOwnerOffCurve
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    taxVault = taxVaultInfo.address;
    console.log("Tax vault created:", taxVault.toString());

    console.log("Creating reward vault token account...");
    const rewardVaultInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      stateAccount,
      true, // allowOwnerOffCurve
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    rewardVault = rewardVaultInfo.address;
    console.log("Reward vault created:", rewardVault.toString());
    
    // Initialize the program
    await program.methods
      .initialize(TAX_RATE, REWARD_INTERVAL_SECONDS)
      .accounts({
        state: stateAccount,
        authority: wallet.publicKey,
        jupiterMint: jupiterMint,
        taxVault: taxVault,
        rewardVault: rewardVault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
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
    expect(stateData.rewardIntervalMinutes).to.equal(Math.floor(REWARD_INTERVAL_SECONDS / 60));
    
    console.log("Program initialized successfully");
  });

  it("Creates Jupiter token with Token-2022 extensions", async () => {
    console.log("Creating Jupiter token with Token-2022 extensions...");
    
    await program.methods
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
    
    console.log("Jupiter token created with Token-2022 extensions");
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
        user: wallet.publicKey,
        recipient: wallet.publicKey, // In a real implementation, this would be Jupiter program
        jupiterMint: jupiterMint,
        rewardVault: rewardVault,
        mintAuthority: mintAuthority,
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
    expect(updatedRewardVaultBalance).to.be.greaterThan(initialRewardVaultBalance);
  });

  it("Distributes rewards after interval has passed", async () => {
    // Wait for the reward interval to pass
    console.log("Waiting for reward interval to pass...");
    await new Promise(resolve => setTimeout(resolve, REWARD_INTERVAL_SECONDS * 1000));
    
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
    
    // Get mint info for decimals
    const mintInfo = await getMint(
      provider.connection,
      jupiterMint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    
    // Distribute rewards
    await program.methods
      .distributeRewards()
      .accounts({
        state: stateAccount,
        rewardVault: rewardVault,
        recipient: userTokenAccount,
        jupiterVault: userTokenAccount, // This is the holder's account
        jupiterMint: jupiterMint,
        jupiterMintInfo: jupiterMint, // This is needed for supply info
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
          jupiterMintInfo: jupiterMint, // This is needed for supply info
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      
      // Should not reach here
      expect.fail("Expected error but distribution succeeded");
    } catch (error) {
      // Verify the error is the expected one
      expect(error.toString()).to.include("TooEarlyForDistribution");
      console.log("Correctly prevented early distribution");
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
    console.log("Successfully updated last distribution time");
  });

  it("Collects tax", async () => {
    // First, ensure there are some tokens in the tax vault
    // This would normally happen through transfer fees, but we'll simulate it
    
    // Mint some tokens directly to the tax vault for testing
    await mintTo(
      provider.connection,
      wallet.payer,
      jupiterMint,
      taxVault,
      wallet.payer,
      5 * 10**9, // 5 tokens with 9 decimals
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Get initial balances
    const initialTaxVaultInfo = await getAccount(
      provider.connection,
      taxVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const initialTaxVaultBalance = Number(initialTaxVaultInfo.amount);
    
    const initialAuthorityTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      wallet.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    
    const initialAuthorityBalance = Number(initialAuthorityTokenAccount.amount);
    
    console.log(`Initial tax vault balance: ${initialTaxVaultBalance/10**9} tokens`);
    console.log(`Initial authority balance: ${initialAuthorityBalance/10**9} tokens`);
    
    // Collect tax
    await program.methods
      .collectTax()
      .accounts({
        state: stateAccount,
        authority: wallet.publicKey,
        jupiterMint: jupiterMint,
        taxVault: taxVault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    // Verify balances after tax collection
    const updatedTaxVaultInfo = await getAccount(
      provider.connection,
      taxVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const updatedTaxVaultBalance = Number(updatedTaxVaultInfo.amount);
    
    const updatedAuthorityTokenAccount = await getAccount(
      provider.connection,
      initialAuthorityTokenAccount.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const updatedAuthorityBalance = Number(updatedAuthorityTokenAccount.amount);
    
    console.log(`Updated tax vault balance: ${updatedTaxVaultBalance/10**9} tokens`);
    console.log(`Updated authority balance: ${updatedAuthorityBalance/10**9} tokens`);
    
    // Tax vault should be empty or have less tokens
    expect(updatedTaxVaultBalance).to.be.lessThan(initialTaxVaultBalance);
    
    // Authority should have more tokens
    expect(updatedAuthorityBalance).to.be.greaterThan(initialAuthorityBalance);
    
    console.log(`Authority received ${(updatedAuthorityBalance - initialAuthorityBalance)/10**9} tokens from tax vault`);
  });

  // Add a helper function to check balances
  async function logTokenBalances(label: string) {
    const userTokenInfo = await getAccount(
      provider.connection,
      userTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    ).catch(() => ({ amount: BigInt(0) }));
    
    const rewardVaultInfo = await getAccount(
      provider.connection,
      rewardVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    ).catch(() => ({ amount: BigInt(0) }));
    
    const taxVaultInfo = await getAccount(
      provider.connection,
      taxVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    ).catch(() => ({ amount: BigInt(0) }));
    
    console.log(`--- ${label} ---`);
    console.log(`User balance: ${Number(userTokenInfo.amount)/10**9} tokens`);
    console.log(`Reward vault: ${Number(rewardVaultInfo.amount)/10**9} tokens`);
    console.log(`Tax vault: ${Number(taxVaultInfo.amount)/10**9} tokens`);
    console.log('----------------');
  }
}); 
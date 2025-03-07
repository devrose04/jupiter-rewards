import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { JupiterRewards } from "../target/types/jupiter_rewards";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";

describe("jupiter-rewards", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.JupiterRewards as Program<JupiterRewards>;
  const wallet = provider.wallet as anchor.Wallet;

  let jupiterMint: anchor.web3.PublicKey;
  let taxVault: anchor.web3.PublicKey;
  let rewardVault: anchor.web3.PublicKey;
  let userJupiterAccount: anchor.web3.PublicKey;
  let statePda: anchor.web3.PublicKey;
  let stateBump: number;
  let mintAuthorityPda: anchor.web3.PublicKey;
  let mintAuthorityBump: number;

  const TAX_RATE = 500; // 5%
  const REWARD_INTERVAL_MINUTES = 10;

  before(async () => {
    // Find PDAs
    [statePda, stateBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );

    [taxVault] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tax_vault")],
      program.programId
    );

    [rewardVault] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault")],
      program.programId
    );

    [mintAuthorityPda, mintAuthorityBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );

    // Create Jupiter mint
    jupiterMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      mintAuthorityPda,
      9
    );

    // Create user Jupiter account
    userJupiterAccount = await createAccount(
      provider.connection,
      wallet.payer,
      jupiterMint,
      wallet.publicKey
    );
  });

  it("Initializes the program", async () => {
    await program.methods
      .initialize(TAX_RATE, REWARD_INTERVAL_MINUTES)
      .accounts({
        state: statePda,
        authority: wallet.publicKey,
        jupiterMint: jupiterMint,
        taxVault: taxVault,
        rewardVault: rewardVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Verify state account
    const stateAccount = await program.account.stateAccount.fetch(statePda);
    assert.equal(stateAccount.authority.toString(), wallet.publicKey.toString());
    assert.equal(stateAccount.jupiterMint.toString(), jupiterMint.toString());
    assert.equal(stateAccount.taxVault.toString(), taxVault.toString());
    assert.equal(stateAccount.rewardVault.toString(), rewardVault.toString());
    assert.equal(stateAccount.taxRate, TAX_RATE);
    assert.equal(stateAccount.rewardIntervalMinutes, REWARD_INTERVAL_MINUTES);
  });

  it("Swaps SOL for Jupiter tokens", async () => {
    const amount = new anchor.BN(1_000_000_000); // 1 SOL
    const minOutputAmount = new anchor.BN(100_000_000); // 100 tokens

    const balanceBefore = await provider.connection.getBalance(wallet.publicKey);

    await program.methods
      .swapSolForJupiter(amount, minOutputAmount)
      .accounts({
        state: statePda,
        recipient: wallet.publicKey, // In a real implementation, this would be the Jupiter swap program
        jupiterMint: jupiterMint,
        rewardVault: rewardVault,
        mintAuthority: mintAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Verify reward vault balance
    const rewardVaultInfo = await provider.connection.getTokenAccountBalance(rewardVault);
    assert.equal(rewardVaultInfo.value.amount, minOutputAmount.toString());
  });

  it("Distributes rewards", async () => {
    // Force update last distribution time to allow immediate distribution
    const currentTime = Math.floor(Date.now() / 1000) - (REWARD_INTERVAL_MINUTES * 60 + 60);
    
    await program.methods
      .forceUpdateLastDistribution(new anchor.BN(currentTime))
      .accounts({
        state: statePda,
        authority: wallet.publicKey,
      })
      .rpc();

    // Distribute rewards
    await program.methods
      .distributeRewards()
      .accounts({
        state: statePda,
        rewardVault: rewardVault,
        recipient: userJupiterAccount,
        jupiterVault: userJupiterAccount, // Using user's account as the jupiter vault for simplicity
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify user received rewards
    const userBalance = await provider.connection.getTokenAccountBalance(userJupiterAccount);
    assert.isTrue(Number(userBalance.value.amount) > 0);
  });
}); 
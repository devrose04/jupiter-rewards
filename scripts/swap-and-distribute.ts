import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { JupiterRewards } from '../target/types/jupiter_rewards';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from '@solana/spl-token-2022';
import * as fs from 'fs';

async function main() {
  // Connect to cluster using the provided RPC URL
  const connection = new Connection(
    'https://falling-sleek-diagram.solana-mainnet.quiknode.pro/ea4bf92e2102ba33efed44f7ed02e04e0a3f9361',
    'confirmed'
  );
  
  // Load your keypair from a file
  let secretKey;
  try {
    secretKey = JSON.parse(fs.readFileSync('keypair.json', 'utf8'));
  } catch (e) {
    console.error('No keypair found. Please run create-token.ts first.');
    return;
  }
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  // Create a wallet for Anchor
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(
    connection, 
    wallet, 
    { commitment: 'confirmed' }
  );
  anchor.setProvider(provider);
  
  console.log(`Using wallet: ${wallet.publicKey.toString()}`);
  
  // Load the program
  const programId = new PublicKey('JupRwdXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  const program = new Program<JupiterRewards>(
    require('../target/idl/jupiter_rewards.json'),
    programId
  );
  
  // Load Jupiter token mint and program accounts from files
  let jupiterMintInfo, programAccounts;
  try {
    jupiterMintInfo = JSON.parse(fs.readFileSync('jupiter_mint.json', 'utf8'));
    programAccounts = JSON.parse(fs.readFileSync('program_accounts.json', 'utf8'));
  } catch (e) {
    console.error('Required files not found. Please run create-token.ts and initialize-program.ts first.');
    return;
  }
  
  const jupiterMint = new PublicKey(jupiterMintInfo.mint);
  const state = new PublicKey(programAccounts.state);
  const rewardVault = new PublicKey(programAccounts.rewardVault);
  
  // Derive mint authority PDA
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('mint_authority')],
    program.programId
  );
  
  // Create a recipient for the SOL (in a real implementation, this would be Jupiter)
  const recipient = wallet.publicKey;
  
  // Get the user's Jupiter token account
  const userJupiterAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    jupiterMint,
    wallet.publicKey,
    true,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log(`User Jupiter token account: ${userJupiterAccount.address.toString()}`);
  
  // Amount of SOL to swap (0.1 SOL)
  const solAmount = 100_000_000;
  
  // Expected Jupiter tokens to receive (simulated)
  const jupiterAmount = 1_000_000_000; // 1 Jupiter token
  
  console.log(`Swapping ${solAmount / 1e9} SOL for Jupiter tokens...`);
  
  try {
    // Swap SOL for Jupiter tokens
    const swapTx = await program.methods
      .swapSolForJupiter(
        new anchor.BN(solAmount),
        new anchor.BN(jupiterAmount)
      )
      .accounts({
        state,
        recipient,
        jupiterMint,
        rewardVault,
        mintAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log(`Swap completed! Transaction signature: ${swapTx}`);
    
    // Get a Jupiter vault for demonstration (in a real implementation, you would track all holders)
    const jupiterVault = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      jupiterMint,
      state,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('Distributing rewards...');
    
    // Distribute rewards
    const distributeTx = await program.methods
      .distributeRewards()
      .accounts({
        state,
        rewardVault,
        recipient: userJupiterAccount.address,
        jupiterVault: jupiterVault.address,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    console.log(`Rewards distributed! Transaction signature: ${distributeTx}`);
    
    // Check user's Jupiter token balance
    const userBalance = await connection.getTokenAccountBalance(userJupiterAccount.address);
    console.log(`User Jupiter token balance: ${userBalance.value.uiAmount}`);
    
  } catch (error) {
    console.error('Error during swap or distribution:', error);
  }
}

main().catch(console.error); 
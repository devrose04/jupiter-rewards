import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { JupiterRewards } from '../target/types/jupiter_rewards';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
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
  
  // Load Jupiter token mint from file
  let jupiterMintInfo;
  try {
    jupiterMintInfo = JSON.parse(fs.readFileSync('jupiter_mint.json', 'utf8'));
  } catch (e) {
    console.error('No Jupiter mint found. Please run create-token.ts first.');
    return;
  }
  
  const jupiterMint = new PublicKey(jupiterMintInfo.mint);
  console.log(`Using Jupiter token mint: ${jupiterMint.toString()}`);
  
  // Derive PDA addresses
  const [state] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')],
    program.programId
  );
  
  const [taxVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('tax_vault')],
    program.programId
  );
  
  const [rewardVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('reward_vault')],
    program.programId
  );
  
  console.log('Initializing Jupiter Rewards program...');
  
  try {
    // Initialize the program
    const tx = await program.methods
      .initialize(
        500, // 5% tax rate
        5     // 5 minutes reward interval
      )
      .accounts({
        state,
        authority: wallet.publicKey,
        jupiterMint,
        taxVault,
        rewardVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    
    console.log(`Program initialized! Transaction signature: ${tx}`);
    console.log(`State account: ${state.toString()}`);
    console.log(`Tax vault: ${taxVault.toString()}`);
    console.log(`Reward vault: ${rewardVault.toString()}`);
    
    // Save the program accounts to a file for later use
    fs.writeFileSync('program_accounts.json', JSON.stringify({
      state: state.toString(),
      taxVault: taxVault.toString(),
      rewardVault: rewardVault.toString(),
    }));
    
  } catch (error) {
    console.error('Error initializing program:', error);
  }
}

main().catch(console.error); 
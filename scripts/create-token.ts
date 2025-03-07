import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  ExtensionType,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  TOKEN_2022_PROGRAM_ID,
  createInitializePermanentDelegateInstruction,
  createInitializeMetadataPointerInstruction,
} from '@solana-program/token-2022';
import { createInitializeMetadataInstruction } from '@solana/spl-token-metadata';
import * as fs from 'fs';

async function createJupiterToken() {
  // Connect to cluster using the provided RPC URL
  const connection = new Connection(
    'https://falling-sleek-diagram.solana-mainnet.quiknode.pro/ea4bf92e2102ba33efed44f7ed02e04e0a3f9361',
    'confirmed'
  );
  
  // Load your keypair from a file (create this file with your private key)
  // In production, use a more secure method to store your private key
  let secretKey;
  try {
    secretKey = JSON.parse(fs.readFileSync('keypair.json', 'utf8'));
  } catch (e) {
    console.log('No keypair found, generating a new one');
    const keypair = Keypair.generate();
    fs.writeFileSync('keypair.json', JSON.stringify(Array.from(keypair.secretKey)));
    secretKey = Array.from(keypair.secretKey);
  }
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  console.log(`Using wallet: ${payer.publicKey.toString()}`);
  
  // Check wallet balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Wallet balance: ${balance / 1e9} SOL`);
  
  if (balance < 1e9) {
    console.error('Not enough SOL in wallet. Need at least 1 SOL for token creation.');
    return;
  }
  
  // Token parameters
  const decimals = 9;
  const taxBasisPoints = 500; // 5%
  const maxTaxBasisPoints = 500; // 5% max
  
  // Calculate space needed for the mint
  const extensions = [
    ExtensionType.TransferFeeConfig,
    ExtensionType.PermanentDelegate,
    ExtensionType.MetadataPointer,
  ];
  
  const mintLen = getMintLen(extensions);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  
  console.log(`Creating Jupiter token with mint address: ${mint.toString()}`);
  
  // Create the program derived address that will be the permanent delegate
  const programId = new PublicKey('JupRwdXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  const [programAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')],
    programId
  );
  
  // Create a transaction to initialize the mint with extensions
  const transaction = new Transaction().add(
    // Create account for the mint
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports: await connection.getMinimumBalanceForRentExemption(mintLen),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    
    // Initialize transfer fee config
    createInitializeTransferFeeConfigInstruction(
      mint,
      payer.publicKey,
      payer.publicKey,
      taxBasisPoints,
      maxTaxBasisPoints,
      TOKEN_2022_PROGRAM_ID
    ),
    
    // Initialize permanent delegate
    createInitializePermanentDelegateInstruction(
      mint,
      programAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    
    // Initialize metadata pointer
    createInitializeMetadataPointerInstruction(
      mint,
      payer.publicKey,
      mint, // Use the mint itself as the metadata address for simplicity
      TOKEN_2022_PROGRAM_ID
    ),
    
    // Initialize metadata
    createInitializeMetadataInstruction(
      {
        metadata: mint,
        updateAuthority: payer.publicKey,
        mint,
        mintAuthority: payer.publicKey,
        payer: payer.publicKey,
      },
      {
        name: 'Jupiter Rewards Token',
        symbol: 'JUPR',
        uri: 'https://example.com/jupiter-rewards-metadata.json',
        additionalMetadata: [
          ['description', 'Token for Jupiter rewards distribution system'],
          ['tax_rate', '5%'],
          ['reward_interval', '5 minutes'],
        ],
      }
    ),
    
    // Initialize the mint
    createInitializeMintInstruction(
      mint,
      decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  console.log('Sending transaction to create Jupiter token...');
  
  try {
    // Send the transaction
    const signature = await sendAndConfirmTransaction(
      connection, 
      transaction, 
      [payer, mintKeypair], 
      {
        commitment: 'confirmed',
        skipPreflight: false,
      }
    );
    
    console.log(`Transaction successful! Signature: ${signature}`);
    console.log(`Jupiter Rewards Token created with address: ${mint.toString()}`);
    console.log(`Transfer Fee: ${taxBasisPoints / 100}%`);
    console.log(`Permanent Delegate: ${programAuthority.toString()}`);
    
    // Save the mint address to a file for later use
    fs.writeFileSync('jupiter_mint.json', JSON.stringify({
      mint: mint.toString(),
      programAuthority: programAuthority.toString(),
    }));
    
    return mint;
  } catch (error) {
    console.error('Error creating token:', error);
    throw error;
  }
}

createJupiterToken().catch(console.error); 
#!/usr/bin/env node

/**
 * This script helps extract the token mint address from the deploy logs.
 * Run it after deploying your token to get the mint address.
 * 
 * Usage: 
 * 1. Save the deploy logs to a file: `yarn deploy > deploy-logs.txt`
 * 2. Run this script: `node scripts/get-token-mint.js deploy-logs.txt`
 */

const fs = require('fs');

// Get the log file path from command line arguments
const logFilePath = process.argv[2];

if (!logFilePath) {
  console.error('Please provide the path to the deploy logs file');
  console.error('Example: node scripts/get-token-mint.js deploy-logs.txt');
  process.exit(1);
}

try {
  // Read the log file
  const logContent = fs.readFileSync(logFilePath, 'utf8');
  
  // Extract the Jupiter token mint address using regex
  const mintRegex = /Jupiter token mint created:\s+([A-Za-z0-9]{32,44})/;
  const match = logContent.match(mintRegex);
  
  if (match && match[1]) {
    const mintAddress = match[1];
    console.log('\nToken Mint Address Found:');
    console.log('=======================');
    console.log(mintAddress);
    console.log('=======================');
    console.log('\nUpdate your scripts/update-token-metadata.ts file with this address.');
    
    // Create a sample command to update the token metadata
    console.log('\nRun the following command to update your token metadata:');
    console.log(`sed -i 's/YOUR_TOKEN_MINT_ADDRESS/${mintAddress}/g' scripts/update-token-metadata.ts`);
    console.log('yarn update-metadata');
  } else {
    console.error('Could not find the Jupiter token mint address in the logs');
    console.error('Make sure the logs contain the line "Jupiter token mint created: <address>"');
  }
} catch (error) {
  console.error('Error reading the log file:', error.message);
  process.exit(1);
} 
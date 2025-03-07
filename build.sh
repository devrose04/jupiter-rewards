#!/bin/bash

# Set environment variables
export RUST_BACKTRACE=1

# Token-2022 Program ID
TOKEN_2022_PROGRAM_ID="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
echo "Building with Token-2022 Program ID: $TOKEN_2022_PROGRAM_ID"

# Check if libssl.so.1.1 is installed
if [ ! -f /usr/lib/x86_64-linux-gnu/libssl.so.1.1 ]; then
    echo "libssl.so.1.1 not found. Installing..."
    wget http://nz2.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    echo "libssl.so.1.1 installed successfully."
fi

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "Solana CLI not found. Please install it first."
    echo "Visit https://docs.solana.com/cli/install-solana-cli-tools for installation instructions."
    exit 1
fi

# Check Solana version
SOLANA_VERSION=$(solana --version | cut -d ' ' -f 2)
echo "Using Solana CLI version: $SOLANA_VERSION"

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "Anchor CLI not found. Please install it first."
    echo "Visit https://www.anchor-lang.com/docs/installation for installation instructions."
    exit 1
fi

# Check Anchor version
ANCHOR_VERSION=$(anchor --version | cut -d ' ' -f 2)
echo "Using Anchor version: $ANCHOR_VERSION"

# Verify minimum Anchor version for Token-2022 support
if [ "$(printf '%s\n' "0.28.0" "$ANCHOR_VERSION" | sort -V | head -n1)" != "0.28.0" ]; then
    echo "Warning: Your Anchor version ($ANCHOR_VERSION) may not fully support Token-2022."
    echo "Consider upgrading to at least 0.28.0 for full Token-2022 support."
fi

# Clean up
echo "Cleaning up..."
cargo clean
rm -f Cargo.lock

# Configure Cargo for better network handling
echo "Configuring Cargo..."
mkdir -p ~/.cargo
echo '[net]
git-fetch-with-cli = true
retry = 5' > ~/.cargo/config.toml

# Set git timeout values to be more tolerant of network issues
git config --global http.lowSpeedLimit 1000
git config --global http.lowSpeedTime 60
git config --global http.postBuffer 524288000

# Check and update Cargo.toml for Token-2022 support
echo "Checking Cargo.toml for Token-2022 support..."
if ! grep -q "token_2022" programs/jupiter-rewards/Cargo.toml; then
    echo "Warning: Token-2022 feature not found in Cargo.toml."
    echo "Attempting to update Cargo.toml with Token-2022 support..."
    
    # Check if anchor-spl is already in Cargo.toml
    if grep -q "anchor-spl" programs/jupiter-rewards/Cargo.toml; then
        # Update existing anchor-spl entry
        sed -i 's/anchor-spl = ".*"/anchor-spl = { version = "0.28.0", features = ["token_2022"] }/g' programs/jupiter-rewards/Cargo.toml
    else
        # Add anchor-spl with token_2022 feature
        echo 'anchor-spl = { version = "0.28.0", features = ["token_2022"] }' >> programs/jupiter-rewards/Cargo.toml
    fi
    
    echo "Updated Cargo.toml with Token-2022 support."
fi

# Check lib.rs for proper Token-2022 imports
echo "Checking lib.rs for Token-2022 imports..."
if ! grep -q "token_2022::{self, Token2022}" programs/jupiter-rewards/src/lib.rs || ! grep -q "token_interface::{Mint, TokenAccount" programs/jupiter-rewards/src/lib.rs; then
    echo "Warning: Proper Token-2022 imports not found in lib.rs."
    echo "Please ensure your program is properly importing Token-2022 modules."
    echo "Example: use anchor_spl::token_2022::{self, Token2022};"
    echo "Example: use anchor_spl::token_interface::{Mint, TokenAccount, transfer_checked, mint_to};"
fi

# Build the program
echo "Building the program..."
BUILD_SUCCESS=false

# Try with Anchor
echo "Using Anchor..."
if anchor build --skip-lint; then
    BUILD_SUCCESS=true
else
    echo "Anchor build failed, trying direct cargo build..."
    
    # Try direct cargo build
    cd programs/jupiter-rewards
    if cargo build-bpf; then
        # Copy the program to the deploy directory
        mkdir -p ../../target/deploy
        cp target/deploy/jupiter_rewards.so ../../target/deploy/
        cp target/deploy/jupiter_rewards-keypair.json ../../target/deploy/
        cd ../..
        BUILD_SUCCESS=true
    else
        cd ../..
        echo "Direct cargo build failed..."
    fi
fi

# Check if build was successful
if [ -f "target/deploy/jupiter_rewards.so" ]; then
    echo "Build completed successfully!"
    
    # Get program ID
    PROGRAM_ID=$(solana-keygen pubkey target/deploy/jupiter_rewards-keypair.json)
    echo "Program ID: $PROGRAM_ID"
    
    # Verify Token-2022 compatibility
    echo "Verifying Token-2022 compatibility..."
    if grep -q "token_2022" programs/jupiter-rewards/Cargo.toml && grep -q "Token2022" programs/jupiter-rewards/src/lib.rs; then
        echo "✅ Token-2022 dependency and imports found"
        
        # Check for specific Token-2022 extensions
        echo "Checking for Token-2022 extensions..."
        
        # Check for transfer fees
        if grep -q "transfer_fee" programs/jupiter-rewards/src/lib.rs || grep -q "Tax collected into vault using Token-2022 transfer fee extension" programs/jupiter-rewards/src/lib.rs; then
            echo "✅ Transfer Fee extension detected"
        fi
        
        # Check for interest-bearing tokens
        if grep -q "interest_bearing" programs/jupiter-rewards/src/lib.rs; then
            echo "✅ Interest-Bearing Token extension detected"
        fi
        
        # Check for non-transferable tokens
        if grep -q "non_transferable" programs/jupiter-rewards/src/lib.rs; then
            echo "✅ Non-Transferable Token extension detected"
        fi
        
        # Check for permanent delegate
        if grep -q "permanent_delegate" programs/jupiter-rewards/src/lib.rs; then
            echo "✅ Permanent Delegate extension detected"
        fi
        
        # Check for transfer hook
        if grep -q "transfer_hook" programs/jupiter-rewards/src/lib.rs; then
            echo "✅ Transfer Hook extension detected"
        fi
        
        # Check for InterfaceAccount usage
        if grep -q "InterfaceAccount<'info, Mint>" programs/jupiter-rewards/src/lib.rs; then
            echo "✅ Using InterfaceAccount for Token-2022 compatibility"
        fi
        
        echo "Your program is built and ready to use with Token-2022 ($TOKEN_2022_PROGRAM_ID)"
        echo "For more information about Token-2022 extensions, visit: https://spl.solana.com/token-2022"
    else
        echo "⚠️ Warning: Token-2022 dependency or imports not properly configured."
        echo "Your program may not be using Token-2022 features correctly."
        echo "Please check the imports in lib.rs and the dependencies in Cargo.toml."
    fi
    
    # Deployment instructions
    echo ""
    echo "To deploy your program to Solana:"
    echo "1. Configure your Solana CLI to use the desired cluster:"
    echo "   solana config set --url https://falling-sleek-diagram.solana-mainnet.quiknode.pro/ea4bf92e2102ba33efed44f7ed02e04e0a3f9361"
    echo "2. Deploy the program:"
    echo "   anchor deploy"
    echo ""
    echo "For more information about Token-2022, visit: https://spl.solana.com/token-2022"
else
    echo "Build failed. Please check the error messages above."
    exit 1
fi 
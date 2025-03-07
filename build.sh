#!/bin/bash

# Set environment variables
export RUST_BACKTRACE=1

# Check if libssl.so.1.1 is installed
if [ ! -f /usr/lib/x86_64-linux-gnu/libssl.so.1.1 ]; then
    echo "libssl.so.1.1 not found. Installing..."
    wget http://nz2.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    echo "libssl.so.1.1 installed successfully."
fi

# Configure git to use the CLI for fetching (helps with network issues)
echo "Configuring git to use CLI for fetching..."
mkdir -p ~/.cargo
echo '[net]
git-fetch-with-cli = true' > ~/.cargo/config.toml

# Set git timeout values to be more tolerant of network issues
git config --global http.lowSpeedLimit 1000
git config --global http.lowSpeedTime 60
git config --global http.postBuffer 524288000

# Clean up
echo "Cleaning up..."
cargo clean
rm -f Cargo.lock

# Try to update the registry index manually with retries
echo "Updating crates.io registry index..."
MAX_RETRIES=3
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
    echo "Attempt $(($RETRY_COUNT + 1)) of $MAX_RETRIES..."
    if cargo update --dry-run; then
        SUCCESS=true
    else
        RETRY_COUNT=$(($RETRY_COUNT + 1))
        echo "Failed to update registry, retrying in 5 seconds..."
        sleep 5
    fi
done

# Build the program
echo "Building the program..."
if command -v anchor &> /dev/null; then
    # Use Anchor if available
    anchor build --skip-lint || {
        echo "Anchor build failed, trying direct cargo build..."
        cd programs/jupiter-rewards
        cargo build-bpf
        
        # Copy the program to the deploy directory
        mkdir -p ../../target/deploy
        cp target/deploy/jupiter_rewards.so ../../target/deploy/
        cp target/deploy/jupiter_rewards-keypair.json ../../target/deploy/
        cd ../..
    }
else
    # Fallback to direct Cargo build
    cd programs/jupiter-rewards
    cargo build-bpf
    
    # Copy the program to the deploy directory
    mkdir -p ../../target/deploy
    cp target/deploy/jupiter_rewards.so ../../target/deploy/
    cp target/deploy/jupiter_rewards-keypair.json ../../target/deploy/
    cd ../..
fi

# Check if build was successful
if [ -f "target/deploy/jupiter_rewards.so" ]; then
    echo "Build completed successfully!"
else
    echo "Build failed. Please check the error messages above."
    exit 1
fi 
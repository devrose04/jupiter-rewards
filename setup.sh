#!/bin/bash

# Install required dependencies
echo "Installing required dependencies..."

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "Installing Solana CLI..."
    sh -c "$(curl -sSfL https://release.solana.com/v1.18.8install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "Installing Anchor CLI..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked
    avm install latest
    avm use latest
fi

# Install libssl.so.1.1 (required for Anchor)
if [ ! -f /usr/lib/x86_64-linux-gnu/libssl.so.1.1 ]; then
    echo "Installing libssl.so.1.1..."
    wget http://nz2.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
    rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb
fi

# Generate a new Solana keypair if one doesn't exist
if [ ! -f ~/.config/solana/id.json ]; then
    echo "Generating a new Solana keypair..."
    solana-keygen new --no-bip39-passphrase
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
yarn install

echo "Setup completed successfully!"
echo "You can now build the project by running: ./build.sh" 
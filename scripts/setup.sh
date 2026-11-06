#!/usr/bin/env bash
# AgentSpend Guard - re-run environment setup (idempotent)
# Use this if the machine/VM was replaced: Rust and pnpm live outside the
# workspace and may need reinstalling. Binaries for near / cargo-near are
# kept in ~/workspace/tools/bin so they survive.
set -e
export PATH="$HOME/.cargo/bin:$HOME/workspace/tools/bin:$PATH"

# 1. Rust (rustup, minimal profile, stable) + NEAR WASM target
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
  export PATH="$HOME/.cargo/bin:$PATH"
fi
rustup target add wasm32-unknown-unknown

# 2. near-cli-rs + cargo-near (prebuilt binaries kept in the workspace)
mkdir -p ~/workspace/tools/bin
if [ ! -x ~/workspace/tools/bin/near ]; then
  cd /tmp && curl -sL -o near-cli.tar.gz https://github.com/near/near-cli-rs/releases/download/v0.31.1/near-cli-rs-x86_64-unknown-linux-gnu.tar.gz
  tar -xzf near-cli.tar.gz && cp near-cli-rs-x86_64-unknown-linux-gnu/near ~/workspace/tools/bin/near
fi
if [ ! -x ~/workspace/tools/bin/cargo-near ]; then
  cd /tmp && curl -sL -o cargo-near.tar.gz https://github.com/near/cargo-near/releases/download/cargo-near-v0.23.0/cargo-near-x86_64-unknown-linux-gnu.tar.gz
  tar -xzf cargo-near.tar.gz && cp cargo-near-x86_64-unknown-linux-gnu/cargo-near ~/workspace/tools/bin/cargo-near
fi
cp -f ~/workspace/tools/bin/cargo-near ~/.cargo/bin/cargo-near 2>/dev/null || true
chmod +x ~/workspace/tools/bin/near ~/workspace/tools/bin/cargo-near

# 3. pnpm
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@latest

# 4. Project dependencies
cd "$(dirname "$0")/.."
npx -y skills add near/agent-skills -y || true
(cd frontend && npm install)
(cd demo-agent && npm install)

echo "--- versions ---"
node --version; rustc --version; cargo --version; near --version; cargo-near --version; pnpm --version
echo "Setup complete."

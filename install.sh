#!/bin/sh
set -e

echo ""
echo "  Installing Relay Agent..."
echo ""

if ! command -v cargo >/dev/null 2>&1; then
	echo "  Rust is required. Installing via rustup..."
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
	. "$HOME/.cargo/env"
fi

cargo install --git https://github.com/Stoffberg/relay.git --bin relay

echo ""
echo "  Installed! Run 'relay setup' to configure, then 'relay' to start."
echo ""

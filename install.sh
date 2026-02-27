#!/bin/sh
set -e

REPO="Stoffberg/relay"
VERSION="${1:-v0.2.1}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$ARCH" in
x86_64 | amd64) ARCH="x86_64" ;;
arm64 | aarch64) ARCH="aarch64" ;;
*) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

case "$OS" in
Darwin) PLATFORM="macos" ;;
Linux) PLATFORM="linux" ;;
*) echo "Unsupported OS: $OS" && exit 1 ;;
esac

BINARY="relay-${PLATFORM}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY}"

echo ""
echo "Installing Relay Agent CLI ($VERSION for $PLATFORM-$ARCH)..."
echo ""

mkdir -p "$INSTALL_DIR"

if ! curl -sSfL "$URL" -o "$INSTALL_DIR/relay"; then
	echo "Failed to download from $URL"
	exit 1
fi

chmod +x "$INSTALL_DIR/relay"

echo "✓ Installed to $INSTALL_DIR/relay"
echo ""
echo "Add to your PATH if needed:"
echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
echo ""
echo "Then run:"
echo "  relay setup"
echo "  relay start"
echo ""

#!/bin/sh
set -e

REPO="Stoffberg/relay"
VERSION="v0.1.0"
INSTALL_DIR="/usr/local/bin"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
x86_64 | amd64) ARCH="amd64" ;;
arm64 | aarch64) ARCH="arm64" ;;
*) echo "  Unsupported architecture: $ARCH" && exit 1 ;;
esac

case "$OS" in
darwin) PLATFORM="darwin" ;;
linux) PLATFORM="linux" ;;
*) echo "  Unsupported OS: $OS" && exit 1 ;;
esac

BINARY="relay-${PLATFORM}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY}"

echo ""
echo "  Installing Relay Agent (${PLATFORM}/${ARCH})..."
echo ""

curl -sSfL "$URL" -o /tmp/relay
chmod +x /tmp/relay

if [ -w "$INSTALL_DIR" ]; then
	mv /tmp/relay "$INSTALL_DIR/relay"
else
	echo "  Need sudo to install to ${INSTALL_DIR}"
	sudo mv /tmp/relay "$INSTALL_DIR/relay"
fi

echo "  Installed to ${INSTALL_DIR}/relay"
echo ""
echo "  Run 'relay setup' to configure, then 'relay' to start."
echo ""

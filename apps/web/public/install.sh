#!/bin/sh
set -e

REPO="Stoffberg/relay"
INSTALL_DIR="${RELAY_INSTALL_DIR:-$HOME/.local/bin}"

main() {
	os=$(uname -s | tr '[:upper:]' '[:lower:]')
	arch=$(uname -m)

	case "$os" in
	darwin) os="apple-darwin" ;;
	linux) os="unknown-linux-gnu" ;;
	*)
		echo "Error: unsupported operating system: $os"
		echo "Relay supports macOS and Linux."
		exit 1
		;;
	esac

	case "$arch" in
	x86_64 | amd64) arch="x86_64" ;;
	arm64 | aarch64) arch="aarch64" ;;
	*)
		echo "Error: unsupported architecture: $arch"
		echo "Relay supports x86_64 and ARM64."
		exit 1
		;;
	esac

	target="${arch}-${os}"
	asset="relay-${target}.tar.gz"

	echo "Detected platform: ${target}"

	tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

	if [ -z "$tag" ]; then
		echo "Error: could not determine latest release."
		echo "Check https://github.com/${REPO}/releases for available versions."
		exit 1
	fi

	url="https://github.com/${REPO}/releases/download/${tag}/${asset}"

	echo "Downloading Relay ${tag} for ${target}..."

	tmpdir=$(mktemp -d)
	trap 'rm -rf "$tmpdir"' EXIT

	if ! curl -fsSL "$url" -o "${tmpdir}/${asset}"; then
		echo ""
		echo "Error: download failed."
		echo "There may not be a pre-built binary for your platform yet."
		echo ""
		echo "You can build from source instead:"
		echo "  cargo install --git https://github.com/${REPO} relay-agent"
		echo ""
		echo "Or check available releases at:"
		echo "  https://github.com/${REPO}/releases"
		exit 1
	fi

	tar xzf "${tmpdir}/${asset}" -C "${tmpdir}"

	mkdir -p "$INSTALL_DIR"
	mv "${tmpdir}/relay" "${INSTALL_DIR}/relay"
	chmod +x "${INSTALL_DIR}/relay"

	echo ""
	echo "Relay ${tag} installed to ${INSTALL_DIR}/relay"

	if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
		echo ""
		echo "Add ${INSTALL_DIR} to your PATH:"
		shell_name=$(basename "$SHELL")
		case "$shell_name" in
		zsh) echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.zshrc && source ~/.zshrc" ;;
		bash) echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc" ;;
		fish) echo "  fish_add_path ${INSTALL_DIR}" ;;
		*) echo "  export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
		esac
	fi

	echo ""
	echo "Next steps:"
	echo "  relay setup    # connect to your Relay account"
	echo "  relay start    # start the agent in your project"
}

main

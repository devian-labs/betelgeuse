#!/usr/bin/env bash
# Builds Betelgeuse from source and installs it (macOS and Linux).
#
#   git clone https://github.com/devian-labs/betelgeuse && cd betelgeuse && ./scripts/install.sh
#
# Options:
#   --build-only   build the app but don't install it
#
# Building locally means macOS doesn't quarantine the app, so it opens without the
# "unidentified developer" warning that unsigned downloads get.
set -euo pipefail

BUILD_ONLY=false
[[ "${1:-}" == "--build-only" ]] && BUILD_ONLY=true

cd "$(dirname "$0")/.."
OS="$(uname -s)"
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }

bold "Checking prerequisites"
if [[ "$OS" == "Darwin" ]]; then
  xcode-select -p >/dev/null 2>&1 || fail "Xcode Command Line Tools are missing. Run: xcode-select --install"
  ok "Xcode Command Line Tools"
fi
command -v git >/dev/null || fail "git is missing. Install it from https://git-scm.com"
ok "git $(git --version | awk '{print $3}')"
command -v node >/dev/null || fail "Node.js is missing. Install Node.js 20 or newer from https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 20 )) || fail "Node.js $(node -v) is too old. Install Node.js 20 or newer from https://nodejs.org"
ok "Node.js $(node -v)"
if ! command -v cargo >/dev/null; then
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
fi
command -v cargo >/dev/null || fail "Rust is missing. Install it with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
ok "Rust $(rustc --version | awk '{print $2}')"
if [[ "$OS" == "Linux" ]]; then
  pkg-config --exists webkit2gtk-4.1 2>/dev/null || fail "WebKitGTK is missing. On Debian/Ubuntu run:
    sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  Other distributions: https://v2.tauri.app/start/prerequisites/#linux"
  ok "WebKitGTK"
fi

bold "Installing dependencies"
npm ci --no-audit --no-fund

bold "Building Betelgeuse (the first build takes a few minutes)"
if [[ "$OS" == "Darwin" ]]; then
  npm run tauri -w @betelgeuse/desktop -- build --bundles app
  APP="apps/desktop/src-tauri/target/release/bundle/macos/Betelgeuse.app"
  [[ -d "$APP" ]] || fail "Build finished but $APP was not found."
  ok "Built $APP"
  if $BUILD_ONLY; then exit 0; fi

  bold "Installing"
  DEST="/Applications"
  [[ -w "$DEST" ]] || DEST="$HOME/Applications"
  mkdir -p "$DEST"
  rm -rf "$DEST/Betelgeuse.app"
  cp -R "$APP" "$DEST/"
  xattr -dr com.apple.quarantine "$DEST/Betelgeuse.app" 2>/dev/null || true
  ok "Installed to $DEST/Betelgeuse.app"
  echo
  bold "Done. Open Betelgeuse from Launchpad or Spotlight, or run: open \"$DEST/Betelgeuse.app\""
else
  npm run tauri -w @betelgeuse/desktop -- build --bundles appimage,deb
  BUNDLE="apps/desktop/src-tauri/target/release/bundle"
  APPIMAGE="$(ls "$BUNDLE"/appimage/*.AppImage 2>/dev/null | head -1 || true)"
  DEB="$(ls "$BUNDLE"/deb/*.deb 2>/dev/null | head -1 || true)"
  [[ -n "$APPIMAGE$DEB" ]] || fail "Build finished but no bundle was found in $BUNDLE."
  ok "Built ${APPIMAGE:-$DEB}"
  if $BUILD_ONLY; then exit 0; fi

  bold "Installing"
  if [[ -n "$DEB" ]] && command -v apt >/dev/null; then
    sudo apt install -y "./$DEB"
    ok "Installed the .deb package. Find Betelgeuse in your applications menu."
  elif [[ -n "$APPIMAGE" ]]; then
    mkdir -p "$HOME/.local/bin"
    install -m 755 "$APPIMAGE" "$HOME/.local/bin/betelgeuse"
    ok "Installed to ~/.local/bin/betelgeuse"
  fi
fi

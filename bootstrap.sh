#!/bin/sh
# Set up a fresh machine: installs git, curl and unzip, a private copy of
# bun, clones this repo and starts the installer.
#
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.sh)"
#   sh -c "$(curl -fsSL …/bootstrap.sh)" - --preset server     # installer options after "-"
#
# Or from a clone: ./bootstrap.sh [installer options]. Environment:
#   DOTFILES_DIR   where to clone (default ~/Projects/.dotfiles)
#   DOTFILES_REF   branch or tag to check out (default main)
#   DOTFILES_REPO  clone URL (default https://github.com/nicentra/.dotfiles.git)
set -eu

BUN_VERSION=1.4.5
REPO=${DOTFILES_REPO:-https://github.com/nicentra/.dotfiles.git}
REF=${DOTFILES_REF:-main}
DIR=${DOTFILES_DIR:-$HOME/Projects/.dotfiles}
RT=$HOME/.local/share/dotfiles/bun # the installer's own bun, separate from the one you choose

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'bootstrap: %s\n' "$*" >&2; exit 1; }

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  elif command -v doas >/dev/null 2>&1; then doas "$@"
  else die "need root for '$*', but neither sudo nor doas is installed"
  fi
}

# 1. git, curl, unzip
missing=
for c in git curl unzip; do command -v "$c" >/dev/null 2>&1 || missing="$missing $c"; done
if [ -n "$missing" ]; then
  say "Installing$missing"
  if command -v pacman >/dev/null 2>&1; then
    if [ -e /var/lib/pacman/sync/core.db ]; then as_root pacman -S --needed --noconfirm git curl unzip
    else as_root pacman -Syu --needed --noconfirm git curl unzip # fresh system without a package database
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update -qq
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends git curl unzip ca-certificates
  else
    die "unsupported system: no pacman or apt-get. Supported: Arch, Debian, Ubuntu."
  fi
fi

# 2. bun, unzipped straight from the release so no installer touches the shell rc files
case $(uname -m) in
  x86_64 | amd64) asset=bun-linux-x64-baseline ;; # baseline: runs on any x86-64 CPU
  aarch64 | arm64) asset=bun-linux-aarch64 ;;
  *) die "unsupported CPU: $(uname -m)" ;;
esac
if [ ! -x "$RT/bun" ] || [ "$("$RT/bun" --version 2>/dev/null)" != "$BUN_VERSION" ]; then
  say "Fetching bun $BUN_VERSION for the installer"
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/$asset.zip" -o "$tmp/bun.zip"
  mkdir -p "$RT"
  unzip -qjo "$tmp/bun.zip" "$asset/bun" -d "$RT"
  chmod +x "$RT/bun"
  rm -rf "$tmp"
fi

# 3. the repo: this checkout when run from one, otherwise a clone
here=$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)
if [ -n "$here" ] && [ -f "$here/installer/package.json" ]; then
  DIR=$here
elif [ -d "$DIR/.git" ]; then
  say "Using the existing clone in $DIR"
else
  say "Cloning $REPO into $DIR"
  mkdir -p "$(dirname "$DIR")"
  git clone --quiet --branch "$REF" "$REPO" "$DIR"
fi

# 4. the installer, on the terminal even when this script came through a pipe
cd "$DIR/installer"
"$RT/bun" install --frozen-lockfile --silent
if [ -t 0 ] || ! { : </dev/tty; } 2>/dev/null; then
  exec "$RT/bun" run src/main.ts "$@"
else
  exec "$RT/bun" run src/main.ts "$@" </dev/tty
fi

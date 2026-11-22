#!/bin/sh
# Smoke test for the stow packages on a fresh system. Links every package
# into an empty $HOME, then starts each kind of shell and fails on errors or
# unexpected output. Run it as root in a throwaway container:
#
#   docker run --rm -v "$PWD:/dotfiles:ro" archlinux:latest sh /dotfiles/tests/stow-smoke.sh full
#
# minimal: only stow, zsh, git and vim, as before the installer has run.
# full:    also the tools the configs integrate with, and oh-my-zsh (Arch only).
# shellcheck disable=SC2088,SC2015 # "~/x" in messages is display text; pass never fails
set -eu
mode=${1:-minimal}
repo=$(cd "$(dirname "$0")/.." && pwd)

if command -v pacman >/dev/null 2>&1; then
  pacman -Syu --noconfirm --needed stow zsh git vim >/dev/null
  if [ "$mode" = full ]; then
    pacman -S --noconfirm --needed starship fzf zoxide fastfetch git-delta neovim >/dev/null
  fi
elif command -v apt-get >/dev/null 2>&1; then
  [ "$mode" = minimal ] || { echo "full mode is Arch-only for now" >&2; exit 2; }
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq stow zsh git vim >/dev/null
fi

HOME=$(mktemp -d); export HOME
mkdir -p "$HOME/.local/bin"
if [ "$mode" = full ]; then
  git clone -q --depth 1 https://github.com/ohmyzsh/ohmyzsh.git "$HOME/.oh-my-zsh"
  for p in zsh-users/zsh-autosuggestions zsh-users/zsh-syntax-highlighting; do
    git clone -q --depth 1 "https://github.com/$p.git" "$HOME/.oh-my-zsh/custom/plugins/${p#*/}"
  done
fi

packages=$(cd "$repo/home" && find . -mindepth 1 -maxdepth 1 -type d | sed 's|^\./||' | sort)
# shellcheck disable=SC2086 # one word per package
stow --dir="$repo/home" --target="$HOME" --no-folding $packages
echo "linked: $(printf '%s\n' "$packages" | tr '\n' ' ')"

failed=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/      /'; failed=1; }

# Run a command; it must succeed and print nothing (bash's job-control
# warnings without a terminal don't count).
quiet() {
  name=$1; shift
  if out=$("$@" 2>&1 </dev/null); then
    out=$(printf '%s\n' "$out" | grep -vE 'no job control in this shell|cannot set terminal process group' || true)
    if [ -z "$out" ]; then pass "$name"; else fail "$name printed output" "$out"; fi
  else
    fail "$name exited with $?" "$out"
  fi
}

quiet "zsh interactive"    zsh -i -c true
quiet "zsh login"          zsh -l -i -c true
quiet "zsh script"         zsh -c true
quiet "bash interactive"   bash -i -c true
quiet "bash login"         bash -l -c true
quiet "sh login"           sh -l -c true
quiet "vim"                vim -u "$HOME/.vimrc" -Nes -c 'if v:errmsg != "" | cquit | endif' -c 'qa!'

# PATH: ~/.local/bin first, once, in every shell that reads env.sh.
for sh in "zsh -c" "zsh -i -c" "bash -l -c" "sh -l -c"; do
  # shellcheck disable=SC2086 # split "zsh -c" into command and flag
  # shellcheck disable=SC2016 # $PATH is for the inner shell
  p=$($sh 'echo "$PATH"' 2>/dev/null </dev/null)
  case $p in
    "$HOME/.local/bin:"*) ;;
    *) fail "PATH starts with ~/.local/bin ($sh)" "$p"; continue ;;
  esac
  n=$(printf '%s\n' "$p" | tr ':' '\n' | grep -cx "$HOME/.local/bin")
  if [ "$n" = 1 ]; then pass "PATH ($sh)"; else fail "PATH has ~/.local/bin $n times ($sh)" "$p"; fi
done

# Aliases that hid commands are gone.
for a in ps pr; do
  if zsh -i -c "alias $a" >/dev/null 2>&1 </dev/null; then fail "alias $a is defined"; else pass "no alias $a"; fi
done

# git reads the shared config and the include for ~/.gitconfig.local.
if [ "$(git config --global init.defaultBranch)" = main ] &&
   [ "$(git config --global include.path)" = "~/.gitconfig.local" ]; then
  pass "git config"
else
  fail "git config"
fi

if [ "$mode" = full ]; then
  # With oh-my-zsh and the tools installed, the prompt and plugins load.
  zsh -i -c '(( $+functions[starship_zle-keymap-select] || $+functions[prompt_starship_precmd] ))' </dev/null 2>/dev/null &&
    pass "starship loaded" || fail "starship loaded"
  zsh -i -c '(( $+functions[_zsh_autosuggest_start] ))' </dev/null 2>/dev/null &&
    pass "zsh-autosuggestions loaded" || fail "zsh-autosuggestions loaded"
  zsh -i -c '(( $+functions[__zoxide_z] ))' </dev/null 2>/dev/null &&
    pass "zoxide loaded" || fail "zoxide loaded"
  # neovim installs its plugins headless and then starts without errors.
  if nvim --headless "+Lazy! sync" +qa </dev/null >/dev/null 2>&1; then pass "neovim plugins install"; else fail "neovim plugins install"; fi
  nv=$(nvim --headless -c 'lua io.stdout:write(vim.v.errmsg == "" and (vim.g.colors_name or "none") or vim.v.errmsg)' -c 'qa!' </dev/null 2>&1)
  if [ "$nv" = catppuccin-mocha ]; then pass "neovim starts cleanly"; else fail "neovim starts cleanly" "$nv"; fi
  # fzf's key bindings only load with a terminal, so check under a pseudo-terminal.
  script -qec "zsh -i -c '(( \$+widgets[fzf-history-widget] ))'" /dev/null >/dev/null 2>&1 &&
    pass "fzf loaded (terminal)" || fail "fzf loaded (terminal)"
fi

exit $failed

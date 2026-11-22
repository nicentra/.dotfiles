#!/bin/sh
# Checks after an install, run as the user: the tools the answers asked for
# are there, the shell starts cleanly and no installer edited the repo.
# Reads the answers the installer saved, with every default filled in.
#   sh tests/verify.sh [answers.json]
# shellcheck disable=SC2088,SC2015 # "~/x" in messages is display text; pass never fails
set -eu
answers=${1:-$HOME/.config/dotfiles/answers.json}
repo=$(cd "$(dirname "$0")/.." && pwd)
failed=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/      /'; failed=1; }
want() { jq -e "$1" "$answers" >/dev/null 2>&1; }

# Run checks in a login shell, the way a new terminal would.
in_zsh() { zsh -l -c "$1" </dev/null 2>&1; }

for c in git curl unzip stow delta zsh starship vim; do
  if in_zsh "command -v $c" >/dev/null; then pass "$c installed"; else fail "$c installed"; fi
done
for t in $(jq -r '.tools[]? // empty' "$answers"); do
  bin=$t
  case $t in ripgrep) bin=rg ;; neovim) bin=nvim ;; felix) bin=fx ;; xdg-utils) bin=xdg-open ;; gh) bin=gh ;; esac
  if [ "$t" = felix ] && ! command -v pacman >/dev/null 2>&1; then continue; fi # Arch only
  if in_zsh "command -v $bin" >/dev/null; then pass "$t installed"; else fail "$t installed"; fi
done

if in_zsh 'fzf --zsh' >/dev/null; then pass "fzf --zsh works"; else fail "fzf --zsh works"; fi
if want '.editors.neovim // true' && [ "$(jq -r '.preset' "$answers")" != server ]; then
  v=$(in_zsh 'nvim --version' | head -1)
  case $v in "NVIM v0."[1-9][0-9]*) pass "neovim >= 0.10 ($v)" ;; *) fail "neovim >= 0.10" "$v" ;; esac
fi

if want '.node.enabled'; then
  v=$(in_zsh 'node --version') && pass "node $v (via $(in_zsh 'command -v node'))" || fail "node" "$v"
  case $(in_zsh 'command -v node') in */pnpm/*) ;; *) fail "node comes from pnpm" ;; esac
fi
if want '.python.enabled'; then
  v=$(in_zsh 'python --version') && pass "$v" || fail "python" "$v"
  case $(in_zsh 'command -v python') in "$HOME/.local/bin/python") ;; *) fail "python comes from uv" ;; esac
fi
if want '.bun.enabled'; then
  v=$(in_zsh 'bun --version') && pass "bun $v" || fail "bun" "$v"
fi
if want '.extras.paru' && command -v pacman >/dev/null 2>&1; then
  if command -v paru >/dev/null; then pass "paru installed"; else fail "paru installed"; fi
fi

if want '.shell.loginShell'; then
  s=$(getent passwd "$(id -un)" | cut -d: -f7)
  case $s in */zsh) pass "login shell is $s" ;; *) fail "login shell is zsh" "$s" ;; esac
fi

# The shells start without errors or output (no terminal here, like agents' shells).
out=$(zsh -l -i -c true </dev/null 2>&1 | grep -vE 'no job control|cannot set terminal process group' || true)
if [ -z "$out" ]; then pass "zsh starts cleanly"; else fail "zsh starts cleanly" "$out"; fi
p=$(zsh -c 'echo $PATH')
case $p in "$HOME/.local/bin:"*) pass "PATH starts with ~/.local/bin" ;; *) fail "PATH starts with ~/.local/bin" "$p" ;; esac

# Not --global: once ~/.gitconfig exists, --global reads only that file; git itself reads both.
if [ "$(cd / && git config init.defaultBranch)" = main ]; then pass "git reads the shared config"; else fail "git reads the shared config"; fi
n=$(jq -r '.git.name // ""' "$answers")
if [ -n "$n" ]; then
  if [ "$(git config --global user.name)" = "$n" ]; then pass "git identity in ~/.gitconfig"; else fail "git identity" "$(git config --global user.name)"; fi
fi
# Global writes land in the per-machine ~/.gitconfig, not in the linked shared config.
git config --global dotfiles.verify yes
if grep -q 'verify = yes' "$HOME/.gitconfig" && ! grep -q 'verify' "$repo/home/git/.config/git/config"; then
  pass "git config --global writes to ~/.gitconfig"
else
  fail "git config --global writes to ~/.gitconfig"
fi
git config --global --unset dotfiles.verify

# No installer wrote through the rc symlinks into the repo.
dirty=$(git -C "$repo" status --porcelain -- home)
if [ -z "$dirty" ]; then pass "repo unchanged"; else fail "repo unchanged" "$dirty"; fi
nvim_files=; want '.editors.neovim' && nvim_files=.config/nvim/init.lua
for f in .zshrc .zshenv .bashrc .profile $nvim_files; do
  if [ -L "$HOME/$f" ]; then pass "~/$f is a link"; else fail "~/$f is a link"; fi
done

exit $failed

#!/bin/sh
# Lint the repo: biome (TypeScript and JSON), the installer's typecheck and
# tests, shellcheck (sh and bash), zsh -n (zsh) and gitleaks (staged changes).
#
#   sh tests/lint.sh            every tracked file, as CI does
#   sh tests/lint.sh --staged   only what's staged; biome's fixes are restaged (pre-commit hook)
set -eu
cd "$(dirname "$0")/.."
staged=0
[ "${1:-}" = --staged ] && staged=1
if [ $staged = 1 ]; then files=$(git diff --cached --name-only --diff-filter=ACMR); else files=$(git ls-files); fi
[ -n "$files" ] || exit 0

failed=0
say() { printf '\033[2m%s\033[0m\n' "$*"; }
has() { printf '%s\n' "$files" | grep -qE "$1"; }

biome=installer/node_modules/.bin/biome
if [ ! -x "$biome" ]; then
  say "installing the installer's dev dependencies"
  (cd installer && bun install --frozen-lockfile --silent)
fi

if has '^(installer|tests)/.*\.(ts|tsx|js|json|jsonc)$|^biome\.json$'; then
  say "biome"
  if [ $staged = 1 ]; then
    "$biome" check --write --staged --no-errors-on-unmatched --colors=off || failed=1
    git update-index --again
  else
    "$biome" ci --colors=off || failed=1
  fi
fi

if has '^installer/'; then
  say "installer: typecheck and tests"
  (cd installer && bun run --silent typecheck) || failed=1
  if ! out=$(cd installer && bun test 2>&1); then
    printf '%s\n' "$out"
    failed=1
  fi
fi

# Shell files: by extension, by name (rc files have no shebang), or by shebang.
sh_files=
zsh_files=
for f in $files; do
  [ -f "$f" ] || continue
  case $f in
    *.zsh | */.zshrc | */.zshenv) zsh_files="$zsh_files $f" ;;
    *.sh | */.bashrc | */.bash_profile | */.profile) sh_files="$sh_files $f" ;;
    *) head -n1 "$f" | grep -qE '^#!.*[/ ](ba|da)?sh$' && sh_files="$sh_files $f" ;;
  esac
done
if [ -n "$sh_files" ]; then
  if command -v shellcheck >/dev/null 2>&1; then
    say "shellcheck"
    # shellcheck disable=SC2086 # one word per file; no paths here have spaces
    shellcheck $sh_files || failed=1
  else
    say "shellcheck isn't installed, skipping it (CI runs it)"
  fi
fi
if [ -n "$zsh_files" ]; then
  say "zsh -n"
  for f in $zsh_files; do zsh -n "$f" || failed=1; done
fi

if [ $staged = 1 ] && command -v gitleaks >/dev/null 2>&1; then
  say "gitleaks"
  gitleaks git --pre-commit --staged --redact --no-banner --log-level=warn . || failed=1
fi

exit $failed

#!/usr/bin/env bash
# Install or update the git-workflow skill for Claude Code. Safe to rerun.
#
#   ./install.sh            this machine (Linux/WSL, or Git Bash on Windows)
#   ./install.sh --windows  from WSL: mirror this copy to the Windows user profile
#
# It puts `git-wt` on PATH, merges settings.fragment.json into settings.json
# (backup alongside), and writes the managed block of CLAUDE.md.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
command -v jq >/dev/null || { echo "install.sh: jq is required" >&2; exit 1; }

windows=0
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) windows=1 ;; esac
if [[ ${1:-} == --windows ]]; then
  winhome=$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')
  [[ -n $winhome ]] || { echo "install.sh: cannot find the Windows profile (not WSL?)" >&2; exit 1; }
  HOME_DIR=$(wslpath "$winhome"); windows=1
else
  HOME_DIR=$HOME
fi
CLAUDE_DIR="$HOME_DIR/.claude"
DEST="$CLAUDE_DIR/skills/git-workflow"
BIN="$HOME_DIR/.local/bin"

# 1. the skill itself
if [[ "$(cd "$DEST" 2>/dev/null && pwd -P)" != "$SRC" ]]; then
  rm -rf "$DEST"
  mkdir -p "$(dirname "$DEST")"
  cp -R "$SRC" "$DEST"
  echo "copied skill to $DEST"
fi
chmod +x "$DEST/bin/git-wt" "$DEST/install.sh" 2>/dev/null || true

# 2. `git wt` on PATH
mkdir -p "$BIN"
if ((windows)); then
  rm -f "$BIN/git-wt"
  # shellcheck disable=SC2016 # $HOME and $@ are for the generated script
  printf '#!/usr/bin/env bash\nexec "$HOME/.claude/skills/git-workflow/bin/git-wt" "$@"\n' >"$BIN/git-wt"
else
  ln -sfn "$DEST/bin/git-wt" "$BIN/git-wt"
fi
echo "git-wt available in $BIN"

# 3. settings.json: attribution off + hooks (replacing earlier copies of our hooks)
settings="$CLAUDE_DIR/settings.json"
[[ -s $settings ]] || echo '{}' >"$settings"
[[ -e $settings.bak-git-workflow ]] || cp "$settings" "$settings.bak-git-workflow"   # keeps the pre-install original
tmp=$(mktemp)
jq --slurpfile frag "$SRC/settings.fragment.json" '
  def ours: (.command // "") | contains("git-workflow/bin/git-wt");
  def strip: map(.hooks |= map(select(ours | not))) | map(select(.hooks | length > 0));
  $frag[0] as $f
  | .attribution = ((.attribution // {}) + $f.attribution)
  | .hooks = (.hooks // {})
  | reduce ($f.hooks | to_entries[]) as $e (.; .hooks[$e.key] = (((.hooks[$e.key] // []) | strip) + $e.value))
' "$settings" >"$tmp"
cat "$tmp" >"$settings"; rm -f "$tmp"
echo "updated $settings (backup: settings.json.bak-git-workflow)"

# 4. CLAUDE.md managed block
claude_md="$CLAUDE_DIR/CLAUDE.md"
block="$SRC/CLAUDE.global.md"
if [[ -f $claude_md ]] && grep -q '<!-- git-workflow:start' "$claude_md"; then
  tmp=$(mktemp)
  awk -v f="$block" '
    /<!-- git-workflow:start/ { while ((getline l < f) > 0) print l; skip = 1; next }
    skip && /<!-- git-workflow:end -->/ { skip = 0; next }
    !skip { print }' "$claude_md" >"$tmp"
  cat "$tmp" >"$claude_md"; rm -f "$tmp"
elif [[ -s $claude_md ]]; then
  { printf '\n'; cat "$block"; } >>"$claude_md"
else
  cat "$block" >"$claude_md"
fi
echo "updated $claude_md"

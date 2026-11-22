# PATH and tool environment for every shell: zsh (via ~/.zshenv), bash and
# sh login shells (via ~/.bashrc and ~/.profile). POSIX sh, prints nothing,
# runs no external commands, and is safe to source more than once.
#
# Tool installers must not add their own PATH lines to rc files. Their
# directories are listed here instead.

_dotfiles_path_prepend() {
  case ":$PATH:" in
    *":$1:"*) ;;
    *) if [ -d "$1" ]; then PATH="$1:$PATH"; fi ;;
  esac
}

export PNPM_HOME="$HOME/.local/share/pnpm"   # pnpm, its node, global packages in bin/
export BUN_INSTALL="$HOME/.bun"              # bun and bun global packages in bin/

# Each line goes in front of the previous ones: ~/.local/bin ends up first.
_dotfiles_path_prepend "$HOME/.cargo/bin"
_dotfiles_path_prepend "$BUN_INSTALL/bin"
_dotfiles_path_prepend "$PNPM_HOME/bin"
_dotfiles_path_prepend "$HOME/.local/bin"    # uv, uv tools and Pythons, claude, codex, agy
export PATH
unset -f _dotfiles_path_prepend

if command -v nvim >/dev/null 2>&1; then EDITOR=nvim; else EDITOR=vim; fi
export EDITOR VISUAL="$EDITOR" SUDO_EDITOR="$EDITOR"
export COLORTERM=truecolor

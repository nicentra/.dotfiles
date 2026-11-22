export SUDO_EDITOR="nvim"
export EDITOR="nvim"
export VISUAL="nvim"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
export COLORTERM="truecolor"

# pyenv
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh)"

# uv
eval "$(uv --generate-shell-completion zsh)"
eval "$(uvx --generate-shell-completion zsh)"

# fnm
FNM_PATH="/home/nicentra/.local/share/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
  eval "`fnm env --use-on-cd --shell zsh`"
fi

# pnpm
export PNPM_HOME="/home/nicentra/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
eval "$(pnpm completion zsh)"
export PNPM_BIN="$(pnpm bin)"
export PATH="$PNPM_BIN:$PATH"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
# bun completions
[ -s "/home/nicentra/.bun/_bun" ] && source "/home/nicentra/.bun/_bun"
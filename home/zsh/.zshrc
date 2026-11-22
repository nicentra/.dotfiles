export ZSH="$HOME/.oh-my-zsh"
# export LANG=en_US.UTF-8
# export LC_ALL=en_US.UTF-8

ZSH_THEME=""

plugins=(
  zsh-autosuggestions
  zsh-syntax-highlighting
)

source $ZSH/oh-my-zsh.sh

# COMPLETION SETTINGS# Initialize completion system
autoload -Uz compinit
compinit

# Enable arrow key navigation in completion menu
zstyle ':completion:*' menu select

# Group completions by category and use descriptions
# zstyle ':completion:*' group-name ''
# zstyle ':completion:*:descriptions' format '%F{yellow}-- %d --%f'

# Case-insensitive completion
zstyle ':completion:*' matcher-list 'm:{a-z A-Z}={A-Z a-z}'
# zstyle :compinstall filename '/home/nicentra/.zshrc'

# HISTORY & BEHAVIOR
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt autocd extendedglob nomatch
unsetopt beep
bindkey -e

# KEYBINDINGS (Fish-like)
autoload -Uz up-line-or-beginning-search
autoload -Uz down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search
bindkey '^[[A' up-line-or-beginning-search # Up
bindkey '^[[B' down-line-or-beginning-search # Down

export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=8"

source $HOME/.zsh/exports.zsh
source $HOME/.zsh/functions.zsh
source $HOME/.zsh/aliases.zsh

eval "$(starship init zsh)"
source <(fzf --zsh)
eval "$(zoxide init zsh)"
source <(command fx --init)

if [ -f /usr/bin/fastfetch ]; then
  clear
  fastfetch
fi

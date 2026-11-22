# Interactive zsh. PATH and the environment come from ~/.zshenv.

# oh-my-zsh loads the plugins and runs compinit. starship draws the prompt.
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""
plugins=(
  zsh-autosuggestions
  zsh-syntax-highlighting
)
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=8"

if [[ -r $ZSH/oh-my-zsh.sh ]]; then
  source $ZSH/oh-my-zsh.sh
else
  autoload -Uz compinit && compinit
fi

# COMPLETION
zstyle ':completion:*' menu select                                  # arrow keys in the menu
zstyle ':completion:*' matcher-list 'm:{a-z A-Z}={A-Z a-z}'         # case-insensitive

# HISTORY & BEHAVIOR
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt autocd extendedglob nomatch
unsetopt beep
bindkey -e

# KEYBINDINGS (Fish-like): up/down search history for what's typed so far
autoload -Uz up-line-or-beginning-search down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search
bindkey '^[[A' up-line-or-beginning-search
bindkey '^[[B' down-line-or-beginning-search

source $HOME/.zsh/tools.zsh
source $HOME/.zsh/functions.zsh
source $HOME/.zsh/aliases.zsh

if [[ -t 1 ]] && (( $+commands[fastfetch] )); then
  clear
  fastfetch
fi

# Read by every zsh, including the non-interactive ones that scripts and
# agents start, so PATH is the same everywhere. Interactive setup is in
# ~/.zshrc.
typeset -U path PATH   # drop duplicate PATH entries
[[ -r $HOME/.config/shell/env.sh ]] && source $HOME/.config/shell/env.sh

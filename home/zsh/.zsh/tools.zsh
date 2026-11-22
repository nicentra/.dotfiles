# Shell integrations and completions, each only if the tool is installed,
# so the same file works on a minimal machine. Runs after compinit.

(( $+commands[starship] )) && eval "$(starship init zsh)"
(( $+commands[fzf] ))      && source <(fzf --zsh)
(( $+commands[zoxide] ))   && eval "$(zoxide init zsh)"
(( $+commands[fx] ))       && source <(command fx --init)   # felix; cd to its last dir on exit

(( $+commands[uv] ))   && eval "$(uv --generate-shell-completion zsh)"
(( $+commands[uvx] ))  && eval "$(uvx --generate-shell-completion zsh)"
(( $+commands[pnpm] )) && eval "$(pnpm completion zsh)"
[[ -s $BUN_INSTALL/_bun ]] && source $BUN_INSTALL/_bun

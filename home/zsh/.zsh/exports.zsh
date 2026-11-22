# uv
eval "$(uv --generate-shell-completion zsh)"
eval "$(uvx --generate-shell-completion zsh)"

# pnpm
eval "$(pnpm completion zsh)"

# bun completions
[ -s "/home/nicentra/.bun/_bun" ] && source "/home/nicentra/.bun/_bun"

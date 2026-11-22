# Basic aliases
alias vim="$EDITOR"
alias v="$EDITOR"
alias e="$EDITOR"
alias l="ls -lah --color=auto"
alias c="clear"
alias q="exit"

# doas instead of sudo, where doas is set up
if (( $+commands[doas] )) && [[ -e /etc/doas.conf ]]; then
  alias sudo="doas"
  (( $+commands[pacman] )) && alias pacman="doas pacman"
fi

# Dev aliases, for the tools that are installed
(( $+commands[cursor] ))   && alias cu="cursor"
(( $+commands[code] ))     && alias co="code"
(( $+commands[claude] ))   && alias cc="claude"
(( $+commands[opencode] )) && alias oc="opencode"

# pnpm aliases. No ps/pr: they hid the ps and pr commands. `p start` and
# `p <script>` do the same.
if (( $+commands[pnpm] )); then
  alias p="pnpm"
  alias pa="pnpm add"
  alias pad="pnpm add -D"
  alias pi="pnpm install"
  alias pd="pnpm dev"
  alias pb="pnpm build"
  alias pl="pnpm lint"
  alias pt="pnpm test"
  alias pu="pnpm update"
  alias px="pnpm dlx"
fi

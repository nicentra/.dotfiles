# shellcheck shell=bash
#
# ~/.bashrc
#

# PATH first, so commands run over ssh (bash reads .bashrc for those) get it too.
# shellcheck source=/dev/null
[[ -r ~/.config/shell/env.sh ]] && . ~/.config/shell/env.sh

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# gpg's pinentry asks for passphrases on the current terminal.
GPG_TTY=$(tty)
export GPG_TTY

alias ls='ls --color=auto'
alias grep='grep --color=auto'
PS1='[\u@\h \W]\$ '

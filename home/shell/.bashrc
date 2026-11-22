# shellcheck shell=bash
#
# ~/.bashrc
#

# PATH first, so commands run over ssh (bash reads .bashrc for those) get it too.
# shellcheck source=/dev/null
[[ -r ~/.config/shell/env.sh ]] && . ~/.config/shell/env.sh

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
alias grep='grep --color=auto'
PS1='[\u@\h \W]\$ '

set -g fish_greeting ""
source /home/nicentra/.nnnrc

# Base16 Shell
if status --is-interactive
    set -x BASE16_SHELL_SET_BACKGROUND false
    set BASE16_SHELL "$HOME/.config/base16-shell/"
    source "$BASE16_SHELL/profile_helper.fish"
end

# Ranger
# function ranger-cd
#     set -l tempfile (mktemp -t tmp.XXXXXX)
#     ranger --choosedir=$tempfile (pwd)
#     test -f "$tempfile" &&
#     if [ (cat -- "$tempfile") != (echo -n `pwd`) ]
#         cd (cat "$tempfile")
# 	end
#     rm -f -- "$tempfile"
# end

function ranger-cd                                                               
  set tempfile '/home/nicentra/tmp/ranger'
  ranger --choosedir=$tempfile (pwd)                                    

  if test -f $tempfile                                                           
      if [ (cat $tempfile) != (pwd) ]                                            
         cd (cat $tempfile)                                                       
      end                                                                        
  end                                                                            

  rm -f $tempfile                                                                
end  

# Exports
set -x PATH $PATH /home/nicentra/.scripts /home/nicentra/go/bin /home/nicentra/.local/bin
set -x TERMINAL st
set -x EDITOR nvim
set -x VISUAL nvim
set -x _JAVA_AWT_WM_NONREPARENTING 1

# Aliases
alias xrc='$EDITOR ~/.Xresources'
alias fishrc='$EDITOR /home/nicentra/.config/fish/config.fish && source /home/nicentra/.config/fish/config.fish'
alias zshrc='$EDITOR /home/nicentra/.zshrc.pre-oh-my-zsh && source /home/nicentra/.zshrc.pre-oh-my-zsh'
alias nnnrc='$EDITOR /home/nicentra/.nnnrc && source /home/nicentra/.zshrc.pre-oh-my-zsh'
alias vimrc='$EDITOR /home/nicentra/.vimrc'
alias xinitrc='$EDITOR /home/nicentra/.xinitrc'
alias rrc='$EDITOR /home/nicentra/.config/ranger/rc.conf'
alias krc='$EDITOR ~/.config/kitty/kitty.conf'
alias strc='$EDITOR ~/git/luke_st/config.h'
alias ldmrc='sudo $EDITOR /etc/lightdm/lightdm.conf'
alias vim='$EDITOR'
alias v='$EDITOR'
alias e='$EDITOR'
alias l='ls -lah --color=auto'
alias c='clear'
alias q='exit'
alias pacman='sudo pacman'
alias i3='$EDITOR /home/nicentra/.config/i3/config && i3-msg reload'
alias bspwmrc='$EDITOR /home/nicentra/.config/bspwm/bspwmrc'
alias sxhkdrc='$EDITOR /home/nicentra/.config/sxhkd/sxhkdrc'
alias polyconfig='cd /home/nicentra/.config/polybar/ && ranger'
alias lsblk='lsblk --output name,fstype,label,size,mountpoint,uuid'
alias dcli='dropbox-cli'
alias d='docker'
alias dc='docker-compose'
#alias wget='wget -q --show-progress'
alias r='ranger-cd'
alias comp='killall compton; compton & disown'
alias comprc='$EDITOR /home/nicentra/.compton.conf && comp'
alias ct="~/.config/base16-shell/colortest"
alias dotrc='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

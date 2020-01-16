#!/bin/env fish
function fish_prompt
  # Cache exit status
  set -l last_status $status
  switch (id -u)
    case 0
      set -g prompt_char '#'
    case '*'
      set -g prompt_char 'λ'
  end

  set -g fish_prompt_pwd_dir_length 15

  set -l normal (set_color normal)
  set -l black (set_color black)
  set -l red (set_color red)
  set -l green (set_color green)
  set -l yellow (set_color yellow)
  set -l blue (set_color blue)
  set -l magenta (set_color magenta)
  set -l cyan (set_color cyan)
  set -l white (set_color white)

  # Configure fish_color
  set -g fish_color_command green
  set -g fish_color_param normal
  set -g fish_color_error red
  set -g fish_color_quote yellow

  # Git config
  set -l prefix $blue"at  "
  set -l ahead    "↑"
  set -l behind   "↓"
  set -l diverged "⥄ "
  set -l dirty    "⨯"
  set -l none     "◦"

  set -l normal_color     (set_color normal)
  set -l success_color    (set_color green)
  set -l error_color      (set_color $fish_color_error 2> /dev/null; or set_color red --bold)
  set -l directory_color  (set_color $fish_color_quote 2> /dev/null; or set_color brown)
  set -l repository_color (set_color $fish_color_cwd 2> /dev/null; or set_color green)

  # Line 0
  echo

  # Line 1
  if test $last_status -eq 0
    echo -n '  '(set_color -o)$green$prompt_char$normal' '
  else
    echo -n '  '(set_color -o)$error_color$prompt_char$normal' '
  end
 
  echo -n ''(set_color -o)$yellow$USER$cyan'@'$yellow(hostname)$normal$magenta' ['(prompt_pwd)']'$cyan

  if git_is_repo
    echo -n -s " " $directory_color $cwd $normal_color
    echo -n -s $prefix (git_branch_name) " "
    if git_is_touched
      echo -n -s $dirty
    else
      echo -n -s (git_ahead $ahead $behind $diverged $none)
    end
	echo
	echo -n " "
  end

  echo -n -s " "
  echo (set_color -o)$cyan'→ '$normal

end

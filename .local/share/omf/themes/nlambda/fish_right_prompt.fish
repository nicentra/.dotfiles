#!/bin/env fish
function fish_right_prompt
  if git_is_repo
    # Set colors
	set -l normal (set_color normal)
	set -l black (set_color black)
	set -l red (set_color red)
	set -l green (set_color green)
	set -l yellow (set_color yellow)
	set -l blue (set_color blue)
	set -l magenta (set_color magenta)
	set -l cyan (set_color cyan)
	set -l white (set_color white)
	# Get git short commit ID
	set -l git_commit_prefix $normal(set_color -o)'['
	set -l git_commit_id $blue(command git rev-parse --short HEAD)
	set -l git_commit_suffix $normal(set_color -o)']'$normal

	echo $git_commit_prefix$git_commit_id$git_commit_suffix
  end
end

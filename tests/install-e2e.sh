#!/bin/sh
# End-to-end test of a fresh install. Run as root in a throwaway container
# with the repo at /src (a git checkout):
#
#   docker run --rm -v "$PWD:/src:ro" archlinux:latest sh /src/tests/install-e2e.sh workstation
#
# Creates a normal user with sudo, runs bootstrap.sh from a copy of the repo
# as that user with tests/answers/<name>.json, checks the result, then runs
# the installer again and expects it to change nothing.
set -eu
name=${1:-workstation}
answers=/src/tests/answers/$name.json
[ -f "$answers" ] || { echo "no answers file $answers" >&2; exit 2; }

# A sudo-capable user, like a real machine. sudo itself is the only setup.
if command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm --needed sudo >/dev/null
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq sudo >/dev/null
fi
id tester >/dev/null 2>&1 || useradd -m -s /bin/bash tester
echo 'tester ALL=(ALL) NOPASSWD: ALL' >/etc/sudoers.d/tester

# The repo as the user would have it after cloning. Copy the working tree
# (so local runs test uncommitted changes) without the host's node_modules.
mkdir -p /home/tester/Projects
cp -a /src /home/tester/Projects/.dotfiles
rm -rf /home/tester/Projects/.dotfiles/installer/node_modules
chown -R tester:tester /home/tester
as_tester() { su - tester -c "$*"; }

echo "::group::bootstrap ($name)"
if ! as_tester "sh ~/Projects/.dotfiles/bootstrap.sh --answers $answers"; then
  echo "::endgroup::"
  echo "bootstrap failed; end of the log:"
  as_tester 'tail -n 60 ~/.local/state/dotfiles/install-*.log'
  exit 1
fi
echo "::endgroup::"

echo "::group::checks"
as_tester "sh ~/Projects/.dotfiles/tests/verify.sh $answers"
echo "::endgroup::"

echo "::group::second run"
out=$(as_tester '~/.local/bin/dotfiles --no-pull' 2>&1) || { echo "$out"; exit 1; }
echo "$out"
echo "::endgroup::"
case $out in
  *"0 done"*) echo "ok    second run changed nothing" ;;
  *) echo "FAIL  second run changed something"; exit 1 ;;
esac

# Set up a fresh Windows machine: WSL with a Linux distro, then this repo's
# installer inside it. From there the installer also sets up the Windows side
# (winget apps, the Nerd Font, Windows Terminal, git, Claude Code).
#
#   irm https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.ps1 | iex
#
# Environment:
#   DOTFILES_DISTRO   WSL distro (default archlinux; Ubuntu-24.04 works too)
#   DOTFILES_REF      branch of this repo to bootstrap from (default main)
#   DOTFILES_ARGS     installer options, e.g. "--preset workstation" or "--dry-run"

$ErrorActionPreference = 'Stop'
$distro = if ($env:DOTFILES_DISTRO) { $env:DOTFILES_DISTRO } else { 'archlinux' }
$ref = if ($env:DOTFILES_REF) { $env:DOTFILES_REF } else { 'main' }
$installerArgs = if ($env:DOTFILES_ARGS) { $env:DOTFILES_ARGS } else { '' }
$bootstrap = "https://raw.githubusercontent.com/nicentra/.dotfiles/$ref/bootstrap.sh"

function Get-WslDistro {
  # wsl.exe writes UTF-16; drop the NULs before comparing names.
  $names = (wsl.exe --list --quiet 2>$null) -replace "`0", ''
  return @($names | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  throw 'wsl.exe not found. This needs Windows 10 version 2004 or newer, or Windows 11.'
}

if ((Get-WslDistro) -notcontains $distro) {
  Write-Host "Installing WSL with $distro. If Windows asks to restart, restart and run this again." -ForegroundColor Cyan
  wsl.exe --install --distribution $distro
  if ($LASTEXITCODE -ne 0) { throw "wsl --install failed with exit code $LASTEXITCODE" }
  if ((Get-WslDistro) -notcontains $distro) {
    Write-Host 'Restart Windows to finish installing WSL, then run this again.' -ForegroundColor Yellow
    return
  }
}

# Some images (Arch's) start as root. The installer belongs to a normal user
# with sudo, so create one and make it the default.
$uid = (wsl.exe --distribution $distro -- id -u).Trim()
if ($uid -eq '0') {
  $user = Read-Host "Linux user name to create in $distro"
  if (-not ($user -match '^[a-z_][a-z0-9_-]*$')) { throw "Not a valid Linux user name: $user" }
  $setup = @"
set -e
if command -v pacman >/dev/null; then pacman -Syu --noconfirm --needed sudo; else apt-get update -qq && apt-get install -y -qq sudo; fi
id $user >/dev/null 2>&1 || useradd -m -s /bin/bash $user
echo '$user ALL=(ALL:ALL) ALL' > /etc/sudoers.d/$user
chmod 440 /etc/sudoers.d/$user
printf '[user]\ndefault=$user\n' >> /etc/wsl.conf
"@
  wsl.exe --distribution $distro --user root -- sh -c $setup
  if ($LASTEXITCODE -ne 0) { throw "creating $user failed" }
  Write-Host "Set a password for $user (sudo asks for it):" -ForegroundColor Cyan
  wsl.exe --distribution $distro --user root -- passwd $user
  wsl.exe --terminate $distro
}

Write-Host "Running the dotfiles installer in $distro" -ForegroundColor Cyan
# No double quotes in arguments to wsl.exe: Windows PowerShell 5.1 doesn't
# escape them for native programs. A file instead of a pipe keeps stdin on
# the terminal for the installer's questions.
$run = "f=`$(mktemp) && curl -fsSL $bootstrap -o `$f && sh `$f $installerArgs; rc=`$?; rm -f `$f; exit `$rc"
wsl.exe --distribution $distro --cd '~' -- sh -c $run
exit $LASTEXITCODE

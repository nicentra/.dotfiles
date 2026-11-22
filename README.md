# .dotfiles

My shell, git, editor and agent configuration, plus an installer that sets
up a fresh machine with these files and all the developer tools I use.

> **Status:** being rebuilt. The old 2019–2020 X11 setup (bspwm, i3,
> polybar, fish) is kept under the [`legacy-x11`](https://github.com/nicentra/.dotfiles/tree/legacy-x11)
> tag. The installer described below doesn't exist yet. See the
> [roadmap](#roadmap).

## Goal

One command on a fresh machine opens a TUI. It asks what to set up, shows
every step it will take, then installs the packages and links the dotfiles.

Targets are Arch, Debian 13, and Ubuntu 24.04 and 26.04. Windows comes
later.

```sh
# Linux (planned)
sh -c "$(curl -fsSL https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.sh)"
```

```powershell
# Windows (planned)
irm https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.ps1 | iex
```

`bootstrap.sh` installs git, curl and unzip. It unzips a pinned
[bun](https://bun.sh) into `~/.local/share/dotfiles/bun` without touching
shell rc files, clones this repo to `~/Projects/.dotfiles` and starts the
TUI. Afterwards a `dotfiles` command updates the machine by reapplying the
saved answers. `dotfiles --reconfigure` asks again, and `dotfiles --dry-run`
only shows what would change.

## Layout (planned)

```
bootstrap.sh, bootstrap.ps1   fetch the runtime, clone, start the installer
installer/                    TypeScript on bun: TUI on top of a headless engine
  manifest                    every tool, with install methods per platform
home/<package>/               GNU stow packages, one per component (zsh, git, …)
agents/                       agent instructions, settings and skills
```

- **Dotfiles** are linked into `$HOME` with [GNU stow](https://www.gnu.org/software/stow/),
  one package per component. Picking components in the TUI decides which
  packages are linked. Files that programs rewrite themselves are copied or
  merged in, not linked.
- **Tools** are installed with the native package manager where it has a
  current version. Otherwise the installer falls back to the official
  install script, then to a GitHub release binary in `~/.local/bin`. No
  installer is allowed to edit the shell rc files; this repo owns them.
- **Machine-specific settings** live outside the repo, for example the git
  identity and signing key in `~/.gitconfig.local`.

## Installer choices (planned)

- **Preset:** workstation, minimal server, or custom.
- **Shell:** zsh with oh-my-zsh plugins, starship, fastfetch on start, and
  zsh as the login shell.
- **Git:** name, email, signing key.
- **Node:** global version, managed by pnpm (`pnpm runtime set node <v> -g`),
  plus global packages.
- **Python:** global version, managed by uv (`uv python install <v> --default`),
  plus uv tools.
- **Bun:** installed alongside pnpm for non-Node work, plus global packages.
- **CLI tools:** a checklist, showing how each one will be installed on this
  OS.
- **Agent harnesses:** opt-in, nothing pre-selected. Claude Code, Codex,
  Antigravity, opencode. Their configs and skills are offered only for the
  harnesses picked.
- **Platform extras:** paru on Arch, WSL PATH tweaks, winget apps on
  Windows.

## Roadmap

1. Reset this repo and import the current configs as stow packages.
2. Installer engine and manifest, headless. Arch first, then Debian and
   Ubuntu, tested in Docker.
3. The TUI on top of the engine.
4. Agents: harnesses, instructions, settings, skills.
5. A neovim config.
6. Windows.

# .dotfiles

My shell, git, editor and agent configuration, plus an installer that sets
up a fresh machine with these files and all the developer tools I use.

Targets are Arch, Debian 13, and Ubuntu 24.04 and 26.04. Windows comes
later. The old 2019–2020 X11 setup (bspwm, i3, polybar, fish) is kept under
the [`legacy-x11`](https://github.com/nicentra/.dotfiles/tree/legacy-x11) tag.

## Install

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.sh)" - --preset workstation
```

`bootstrap.sh` installs git, curl and unzip. It unzips a pinned
[bun](https://bun.sh) into `~/.local/share/dotfiles/bun` without touching
shell rc files, clones this repo to `~/Projects/.dotfiles` and starts the
installer. Pass installer options after the `-`. From a clone,
`./bootstrap.sh --preset workstation` does the same.

Until the TUI exists ([roadmap](#roadmap)), the answers come from a preset
(`workstation` or `server`) or from a file (`--answers answers.json`, see
[`tests/answers/`](tests/answers/)). Anything missing is filled in from the
preset.

Afterwards, the `dotfiles` command reruns the installer:

```sh
dotfiles              # pull the repo, then reapply the saved answers
dotfiles --dry-run    # show the steps without running them
dotfiles --no-pull    # skip the git pull
```

The answers are saved in `~/.config/dotfiles/answers.json`. Each step checks
first, so a rerun only does what changed. Files that linking replaces are
moved to `~/.dotfiles-backup/<time>/`, and every run writes a log to
`~/.local/state/dotfiles/`.

## Layout

```
bootstrap.sh          fetch git and bun, clone, start the installer
installer/            TypeScript on bun
  src/manifest.ts     every tool, with install methods per platform
  src/plan.ts         answers + platform → steps
home/<package>/       GNU stow packages, one per component (see home/README.md)
copy/<package>/       configs that programs rewrite: copied once, not linked
tests/                container tests: stow smoke test, full install per distro
```

- **Dotfiles** are linked into `$HOME` with [GNU stow](https://www.gnu.org/software/stow/),
  one package per component.
- **Tools** come from the native package manager when it has a recent
  enough version. Otherwise they come from the upstream GitHub release,
  into `~/.local/bin`. Ubuntu 24.04, for example, gets fzf, neovim,
  fastfetch, lazygit and starship that way.
- **Runtimes:** pnpm manages Node (`pnpm runtime set node <v> -g`), uv manages
  Python (`uv python install <v> --default`), and bun is installed alongside
  for non-Node work.
- **Shell rc files belong to this repo.** Installers that append PATH lines
  anyway (bun's, Antigravity's) run inside a guard that restores the files
  afterwards.
- **Machine-specific settings** live outside the repo, for example the git
  identity and signing key in `~/.gitconfig.local`.

## Development

```sh
cd installer && bun install && bun test && bun run typecheck
docker run --rm -v "$PWD:/src:ro" ubuntu:24.04 sh /src/tests/install-e2e.sh workstation
```

CI runs the unit tests, the stow smoke test, and a full install from
`bootstrap.sh` on every target distro. Each install runs twice, and the
second run must change nothing.

## Roadmap

1. ~~Reset this repo and import the current configs as stow packages.~~
2. ~~Installer engine and manifest, headless, tested in Docker.~~
3. GitHub CLI login, SSH and GPG keys.
4. The TUI on top of the engine.
5. Agents: harnesses (opt-in), instructions, settings, skills.
6. ~~A neovim config.~~
7. Windows.

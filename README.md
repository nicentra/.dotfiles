# .dotfiles

My shell, git, editor and agent configuration, plus an installer that sets
up a fresh machine with these files and all the developer tools I use.

Targets are Arch, Debian 13, and Ubuntu 24.04 and 26.04, plus Windows as
the host of a WSL install. The old 2019–2020 X11 setup (bspwm, i3, polybar, fish) is kept under
the [`legacy-x11`](https://github.com/nicentra/.dotfiles/tree/legacy-x11) tag.

## Install

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.sh)"
```

`bootstrap.sh` installs git, curl and unzip. It unzips a pinned
[bun](https://bun.sh) into `~/.local/share/dotfiles/bun` without touching
shell rc files, clones this repo to `~/Projects/.dotfiles` and starts the
installer. That asks what to set up, one screen at a time:
- **Preset:** workstation or server.
- **Shell:** zsh, oh-my-zsh, starship, login shell.
- **Git and GitHub:** git identity, GitHub login, SSH and GPG keys.
- **Editors.**
- **CLI tools:** each shows how it would be installed here.
- **Runtimes:** the Node and Python versions and global packages, and bun.
- **paru** on Arch.

The last screen lists every step and asks before it installs anything.

Without a terminal, pass the answers instead: `--preset workstation`,
`--preset server`, or `--answers answers.json` (see
[`tests/answers/`](tests/answers/)), after a `-`:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.sh)" - --preset server
```

On Windows, run this in PowerShell:

```powershell
irm https://raw.githubusercontent.com/nicentra/.dotfiles/main/bootstrap.ps1 | iex
```

It installs WSL with Arch (`$env:DOTFILES_DISTRO` picks another distro).
If the distro starts as root, it creates a sudo user. Then it runs the
installer inside WSL. From there, the installer also sets up the Windows
side through WSL interop:
- winget apps: Windows Terminal, VS Code, Git for Windows and delta, and
  optionally Cursor and Docker Desktop.
- FiraCode Nerd Font Mono.
- Windows Terminal with Catppuccin Mocha and that font, from
  [`windows/terminal.json`](windows/terminal.json).
- The shared git config and identity for Git for Windows.
- The git-workflow skill and Claude Code settings on Windows.

Afterwards, the `dotfiles` command reruns the installer:

```sh
dotfiles                 # pull the repo, then reapply the saved answers
dotfiles --reconfigure   # ask again, starting from the saved answers
dotfiles --dry-run       # show the steps without running them
dotfiles --no-pull       # skip the git pull
```

On a workstation the installer also sets up GitHub. It logs in with
`gh` (in the browser), creates an SSH key if there's none and adds it to
the account. It then reuses or creates a GPG key, adds that too, and turns
on signed commits. These steps need you at the terminal, so runs without
one skip them and say so.

Agent harnesses are opt-in: nothing is picked by default. For the ones you
pick (Claude Code, Codex, Antigravity, opencode), the installer:
- installs each with its official script.
- links this repo's skills from [`agents/skills/`](agents/skills/), such as
  git-workflow and its `git wt` command, plus third-party skills through
  the [skills CLI](https://github.com/vercel-labs/skills).
- writes the git-workflow rules into each harness's global instructions,
  as a managed block that leaves the rest of the file alone.
- merges [`agents/claude/settings.json`](agents/claude/settings.json) into
  Claude Code's settings.

The answers are saved in `~/.config/dotfiles/answers.json`. Each step checks
first, so a rerun only does what changed. Files that linking replaces are
moved to `~/.dotfiles-backup/<time>/`, and every run writes a log to
`~/.local/state/dotfiles/`.

## Layout

```
bootstrap.sh          fetch git and bun, clone, start the installer
bootstrap.ps1         Windows: WSL with a distro, then bootstrap.sh inside it
installer/            TypeScript on bun
  src/manifest.ts     every tool, with install methods per platform
  src/plan.ts         answers + platform → steps
  src/ui/             the TUI (Ink)
home/<package>/       GNU stow packages, one per component (see home/README.md)
agents/               skills (git-workflow) and Claude Code settings
windows/              Windows Terminal settings
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
  identity and signing key in `~/.gitconfig`. The shared git settings are
  linked to `~/.config/git/config`, so `git config --global` writes to the
  per-machine file, not the repo.

## Development

```sh
cd installer && bun install        # also installs the git hooks (husky)
bun run lint                       # everything the hooks and CI check
docker run --rm -v "$PWD:/src:ro" ubuntu:24.04 sh /src/tests/install-e2e.sh workstation
```

Before every commit, [`tests/lint.sh`](tests/lint.sh) checks the staged
files:
- biome formats and lints TypeScript and JSON, and restages its fixes.
- The installer's typecheck and tests run when it changed.
- shellcheck checks sh and bash scripts, and `zsh -n` checks zsh files.
- gitleaks scans the staged changes for secrets.

The commit-msg hook requires a Conventional Commit header. The installer
sets `wt.postCreate` so that new `git wt` worktrees get the hooks too.

CI runs the same lint on every file, the stow smoke test, and a full
install from `bootstrap.sh` on every target distro. Each install runs
twice, and the second run must change nothing.

## Roadmap

1. ~~Reset this repo and import the current configs as stow packages.~~
2. ~~Installer engine and manifest, headless, tested in Docker.~~
3. ~~GitHub CLI login, SSH and GPG keys.~~
4. ~~The TUI on top of the engine.~~
5. ~~Agents: harnesses (opt-in), instructions, settings, skills.~~
6. ~~A neovim config.~~
7. ~~Windows, as the host of a WSL install.~~

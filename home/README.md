# Stow packages

Each directory here is a [GNU stow](https://www.gnu.org/software/stow/)
package. Its contents mirror `$HOME`, and stow links each file into place.

| Package     | Links                                                            | Expects               |
|-------------|------------------------------------------------------------------|-----------------------|
| `shell`     | `~/.config/shell/env.sh` (PATH and environment), `.profile`, `.bashrc`, `.bash_profile` | |
| `zsh`       | `.zshenv`, `.zshrc`, `.zsh/`                                     | `shell`; optional: oh-my-zsh with zsh-autosuggestions and zsh-syntax-highlighting, starship, fzf, zoxide, felix (`fx`) |
| `git`       | `.gitconfig`                                                     | git-delta             |
| `vim`       | `.vimrc`                                                         |                       |
| `starship`  | `~/.config/starship.toml`                                        | starship              |
| `fastfetch` | `~/.config/fastfetch/config.jsonc`                               | fastfetch             |

The zsh config skips any integration whose tool isn't installed, so it
starts cleanly on a minimal machine.

## Linking by hand

Until the installer exists:

```sh
cd ~/Projects/.dotfiles
stow shell zsh git vim starship fastfetch   # options come from .stowrc
stow -n -v zsh                              # dry run: show what would be linked
stow -D zsh                                 # unlink a package
```

Stow refuses to replace existing files. Move them aside first, for example
into `~/.dotfiles-backup/`.

## Per-machine files

The git identity and signing setup aren't in this repo. Create
`~/.gitconfig.local`, which `.gitconfig` includes:

```ini
[user]
	name = Your Name
	email = you@example.com
	signingkey = <gpg key id>   # optional, together with the two below
[commit]
	gpgsign = true
[tag]
	gpgsign = true
```

## Copied, not linked

Some programs rewrite their own config file, and some replace a symlink
with a regular file when they do. Those configs live in [`copy/`](../copy/) with
the same layout and are copied instead:

```sh
cp -n copy/btop/.config/btop/btop.conf ~/.config/btop/btop.conf
```

## Tests

[`tests/stow-smoke.sh`](../tests/stow-smoke.sh) links every package into an empty home in a fresh
container and checks that the shells start cleanly. CI runs it on Arch,
Debian 13 and Ubuntu 24.04 and 26.04:

```sh
docker run --rm -v "$PWD:/dotfiles:ro" archlinux:latest sh /dotfiles/tests/stow-smoke.sh full
```

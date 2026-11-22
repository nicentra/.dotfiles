---
name: git-workflow
description: How Git and GitHub work is done in this user's projects. Worktrees under ~/Worktrees with a draft PR from the start, Conventional Branch names, Conventional Commits, squash-only merges, cleanup of merged worktrees and branches, GitHub repo setup, and release-please releases. Load before creating a branch or worktree, committing, pushing, opening, editing or merging a PR, cleaning up branches, setting up a repository, or cutting a release.
---

# Git workflow

The rules are in the global CLAUDE.md. This file says how to follow them. The `git wt` script (`bin/git-wt` next to this file, on PATH as `git wt`) does the mechanical parts. Use it instead of hand-rolled `git worktree` / `gh pr create` / `gh pr merge` commands.

| Command | What it does |
|---|---|
| `git wt new <type>/<name>` | Worktree at `~/Worktrees/<project>/<type>/<name>` from a freshly fetched `origin/<default>`. Copies env files, installs dependencies, pushes, and opens a draft PR. Prints the path. |
| `git wt pr` | Opens the PR for the current branch if it has none (e.g. after a failed push). |
| `git wt merge [<pr>]` | Checks the title, marks the PR ready, squash-merges with title + description, and updates the main checkout. Also removes the worktree, unless run from inside it. |
| `git wt rm <path\|branch>` | Removes a worktree. Deletes its branch only if no commit would be lost. |
| `git wt sweep [--dry-run]` | Across every repo in `~/Projects`: removes worktrees and branches whose PR was merged, plus stale scratch worktrees and leftover remote branches. Fast-forwards the main checkouts. |
| `git wt ls` | Lists all worktrees with their PR state. |
| `git wt setup [--releases <type>]` | Applies GitHub settings and adds the PR-title check, PR template and `.worktreeinclude`. With `--releases`, also adds release-please. |

Hooks in `~/.claude/settings.json` wire this into Claude Code:
- `WorktreeCreate` and `WorktreeRemove` run `git wt`, so EnterWorktree and subagent isolation use the same layout.
- A `PreToolUse` guard blocks the commands listed under "Guard" below. When it blocks something, fix the command; don't work around the guard.

## 1. Start work

1. Pick the branch name: `<type>/<slug>`.
   - Types: `feat` (new behaviour), `fix` (bug fix), `chore` (anything else: docs, refactors, CI, deps). `hotfix/` and `release/` exist but are rarely needed.
   - Slug: 2–4 lowercase words joined with hyphens.
   - If a GitHub issue exists, prefix its number: `fix/42-null-guild-id`. The PR then gets `Closes #42`.
2. Create the worktree:
   - **Session started in the repo:** call EnterWorktree with `name: "<type>/<slug>"`. The hook creates the worktree, PR and all, and moves the session into it.
   - **Otherwise** (session started elsewhere, or already in a worktree session): run `git -C ~/Projects/<project> wt new <type>/<slug>`. Then either call EnterWorktree with `path:` set to the printed path, or keep working with absolute paths and `git -C <path>`.
   - **Session already in a feature-branch worktree made by another tool** (e.g. T3 Code): work there. Run `git wt pr` to make sure it has a PR.
3. Check what the script reported: copied env files, dependency install, PR URL. If the PR step failed (push, signing), fix the cause and run `git wt pr`.

**Draft PRs.** On GitHub Free, private repos have no draft PRs. There `git wt` opens a normal PR titled `[WIP] <title>`, and the PR-title check stays pending while the prefix is there. Treat a `[WIP]` PR exactly like a draft.

**Env files.** `git wt new` copies gitignored files listed in the repo's `.worktreeinclude` (gitignore syntax, same file Claude Code uses). Without that file it copies `.env`, `.env.*` and `.dev.vars`, but never `*prod*` env files. It also skips any file that is currently identical to a `*prod*` file, e.g. a `.env` that a script copied from `.env.prod.local`. If tests need another secret file, add it to `.worktreeinclude` in a PR rather than copying it by hand.

Repo-specific setup for new worktrees, such as generating `.env` from a dev template, goes in that clone's git config: `git -C ~/Projects/<project> config --add wt.postCreate "<command>"`. It runs in every new worktree after files are copied and dependencies installed. Two worktrees running dev servers at once can clash on ports or a shared local database. Change the port in the worktree's own `.env` copy.

## 2. Commit

- **Commit small:** one logical step per commit (a refactor, a slice of a feature, its tests), and each should build. Commit as soon as a step works, not at the end.
- **Stage explicitly:** `git add <paths>`. Never commit generated files, env files or unrelated changes.
- **Push after every commit** (or every few), so the PR shows progress and nothing exists only locally.
- **Message format:** Conventional Commits, `type(scope): subject`.
  - Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
  - Subject: imperative, lowercase start, no trailing period, under 72 characters.
  - Scope: optional, lowercase. If the repo's CLAUDE.md lists scopes, use those. Otherwise use the top-level area touched (`bot`, `api`, `web`, `db`) or leave it out.
  - Body: after a blank line, explain why the change was made and anything non-obvious, wrapped at about 72 columns. The diff already shows what changed.
  - Footers on the last lines: `BREAKING CHANGE: <what breaks and how to migrate>` (and `!` after the type/scope), `Closes #12`.
  - No Claude attribution trailers of any kind.

```bash
git add src/web/gif-preview.ts src/web/gif-preview.test.ts
git commit -m "$(cat <<'EOF'
feat(web): preview Klipy GIF links in the dashboard

Moderators had to open every Klipy link to see what it was. Resolve the
link to its media URL and render the GIF inline next to the message.
EOF
)"
git push
```

**Keeping up with the default branch:** `git fetch origin && git merge origin/<default>` inside the worktree. Squash merging throws the branch history away, so merge rather than rebase, and you never need to force-push. If a rebase is truly needed, push with `--force-with-lease`.

## 3. Ship (work is done)

1. Re-read the whole change: `git diff origin/<default>...HEAD` and `git log origin/<default>..HEAD --oneline`.
2. Rewrite the PR title and description. On merge they become the single commit on the default branch, and the title becomes the changelog line.
   - **Title:** a Conventional Commit header for the change as a whole (drop any `[WIP] ` prefix), e.g. `feat(web): preview Klipy GIF links`.
     - Use `feat` if users get new behaviour and `fix` if a bug goes away. `feat!`/`fix!` mark a breaking change.
     - One PR is one changelog entry. If it really contains two unrelated changes, split it.
   - **Description:** plain prose a future reader of `git log` can use. Sections: `## Why`, `## What changed`, `## How it was tested`. Footers (`BREAKING CHANGE: …`, `Closes #N`) go on the last lines. Keep any `Closes #N` that was already there.
   - Apply with `gh pr edit <n> --title "…" --body "$(cat <<'EOF' … EOF)"`.
3. If it is a real draft, run `gh pr ready <n>`. Check CI with `gh pr checks <n>`.
4. Tell the user it is ready, with the PR URL. Do not merge unless asked.

## 4. Merge (only when the user asks)

1. Run `git wt merge <n>`. It refuses titles that aren't Conventional Commits and `[WIP]` titles. It squash-merges with subject `<title> (#<n>)` and the description as the body (template comments removed), then fetches and fast-forwards the main checkout.
2. Clean up:
   - **Run from outside the worktree:** `git wt merge` already removed the worktree and the local and remote branches.
   - **Session inside the worktree (EnterWorktree):** call ExitWorktree with `action: "keep"`, then `git wt rm ~/Worktrees/<project>/<branch>`. Don't use ExitWorktree `remove`: after a squash merge the branch's commits aren't ancestors of the default branch, so Claude Code would ask to discard them.
   - **Plain `git -C <worktree>` session:** run `git wt rm ~/Worktrees/<project>/<branch>`.

If the user merged on GitHub themselves, run `git wt sweep`. It only removes branches whose merged PR contains the local tip, so unpushed work is never deleted. A worktree with uncommitted changes is reported and left alone. Ask before passing `--force` to `git wt rm`.

## 5. Scratch worktrees (subagents)

Worktree names without a type prefix are throwaway: subagent `isolation: "worktree"` and random EnterWorktree names. They become branch `scratch/<name>` at `~/Worktrees/<project>/scratch/<name>`, with no PR. `git wt sweep` removes them once they are over an hour old, clean, and have no commits of their own. Real work goes on a typed branch with a PR.

## 6. Set up a repository

Do this once per repository, and when the user asks to bring a repo in line:

```bash
git -C ~/Projects/<project> wt new chore/repo-setup
cd ~/Worktrees/<project>/chore/repo-setup   # or EnterWorktree / git -C
git wt setup                                # add --releases <type> to opt into releases
```

What `git wt setup` changes:
- **GitHub settings:** squash merge only, squash commit = PR title + description, head branches deleted on merge.
- **`.github/workflows/pr-title.yml`:** checks the PR title.
- **`.github/pull_request_template.md`.**
- **`.worktreeinclude`:** generated from the main checkout's ignored env files, prod files excluded.

It never overwrites existing files. Commit the files in logical commits (`ci: check pr titles for conventional commits`, `chore: add pr template`, `chore: list env files for new worktrees`), then ship the PR.

- **Personal private repos on GitHub Free:** rulesets and branch protection aren't available, so nothing makes the title check required. `git wt merge` and the guard enforce it instead.
- **Repos with no usable `origin`:** ask the user before creating a GitHub repo (`gh repo create`).

## 7. Releases (opt-in per project)

Only set up releases when the user asks for a project. Run `git wt setup --releases <type>` in a setup worktree. Types:
- `node`: bumps `package.json`
- `python`: bumps `pyproject.toml`
- `rust`: bumps `Cargo.toml`
- `go`: tags only
- `simple`: bumps `version.txt`

It adds `.github/workflows/release-please.yml`, `release-please-config.json` and `.release-please-manifest.json`. It also allows GitHub Actions to open PRs.

- **How it works:** every merge to the default branch updates one open release PR, titled `chore(<default>): release X.Y.Z`, which bumps the version file and `CHANGELOG.md`. Merging it, with `git wt merge <n>` like any PR, creates tag `vX.Y.Z` and a GitHub Release.
- **Version bumps** come from the squash commits since the last release: `fix`/`perf` → patch, `feat` → minor, `!`/`BREAKING CHANGE` → major. Below 1.0.0, breaking changes bump minor (`bump-minor-pre-major`). `chore`, `docs`, `refactor` and similar never trigger a release.
- **Nobody edits versions or the changelog by hand.**
- **Old history:** `bootstrap-sha` makes release-please ignore commits from before the setup.
- **Release jobs:** tags made with `GITHUB_TOKEN` don't trigger other workflows. Anything that should run on a release (Docker image, publishing) goes into `release-please.yml` as a job with `needs: release-please` and `if: needs.release-please.outputs.release_created == 'true'`. That job can use `needs.release-please.outputs.tag_name` and `outputs.version`.
- **Python:** `uv.lock` also records the project's version. After the first release, check that `uv lock --check` passes; if not, add a step that runs `uv lock` in the release PR.
- **Node:** `package.json` needs a `"version"` field. Add one if the setup warned about it.

## 8. Other people's repositories

Upstream projects (e.g. a clone of someone else's repo) follow their own CONTRIBUTING: branch names, commit style, PR process. Mark the clone with `git config workflow.conventions false`. The guard then skips the convention checks but keeps the safety checks. Still use worktrees under `~/Worktrees`.

## Guard

The `PreToolUse` hook (`git wt guard`) blocks:
- Claude attribution trailers and "Generated with Claude Code"
- `--no-verify`
- Plain force-push
- Pushing to, or committing on, the default branch (in repos with a remote)
- `gh pr merge` without `--squash`
- Non-draft `gh pr create`

Push checks only:
- gitleaks finds secrets in the commits being pushed. Remove the secret from those commits locally before pushing.

When conventions are on:
- Non-conventional commit headers
- Non-conventional `gh pr create`/`gh pr edit --title` values

## Windows

The same layout applies under `%USERPROFILE%` (`~/Projects`, `~/Worktrees`). `git wt` runs in Git Bash, which Claude Code uses for Bash and hooks. The Windows copy of this skill is synced from WSL with `install.sh --windows`. The skill lives in the dotfiles repo (`agents/skills/git-workflow`, linked into `~/.claude/skills`): edit it there, then rerun that.

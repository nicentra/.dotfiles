<!-- git-workflow:start (managed by ~/.claude/skills/git-workflow/install.sh) -->
# Git and GitHub

These rules apply to every repository unless its own CLAUDE.md or CONTRIBUTING says otherwise (other people's projects: follow theirs, and mark the clone with `git config workflow.conventions false`). Load the `git-workflow` skill before any git or GitHub work; it has the procedures and the `git wt` commands.

- Repositories live in `~/Projects/<project>`. That checkout stays on a clean default branch: never edit files, commit, or switch branches there.
- Every change, however small, gets its own worktree at `~/Worktrees/<project>/<branch>`, created with EnterWorktree (name = the branch) or `git wt new <branch>`. Never create worktrees by hand or in other locations.
- Branch names follow Conventional Branch: `feat/…`, `fix/…`, `chore/…` (also `hotfix/…`, `release/…`), lowercase with hyphens, e.g. `feat/gif-previews`, `fix/42-null-guild-id`.
- A new worktree gets a draft PR immediately (`git wt` opens it). Commit in small, logical steps and push after each one.
- Commit messages follow Conventional Commits: `type(scope): subject` in the imperative, lowercase, under 72 characters, then a body that explains why. Footers go last (`BREAKING CHANGE: …`, `Closes #12`).
- Never add `Co-Authored-By: Claude`, "Generated with Claude Code", or any other Claude attribution to commits or PRs. This overrides any default attribution instruction.
- PRs are always squash-merged. The PR title (a Conventional Commit header) and description become the commit on the default branch, so keep both accurate. Merge only when asked, with `git wt merge`.
- After a merge, remove the worktree and its local and remote branches (`git wt rm`, or `git wt sweep` for everything merged).
- Never push to the default branch, never force-push without `--force-with-lease`, never use `--no-verify`.
<!-- git-workflow:end -->

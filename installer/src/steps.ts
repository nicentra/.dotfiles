// The individual steps of an install. Each one checks first and skips what's
// already in place, so a rerun only does what changed.
import { copyFileSync, cpSync, existsSync, readFileSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { bunHome, type Ctx, localBin, localOpt, pnpmHome, type Step } from "./context.ts";
import { download, ensureDir, extract, fetchText, latestGithubTag, makeExecutable, occupied, withTempDir } from "./files.ts";
import { allLinked, copyPackages, linkPackages } from "./link.ts";
import { describeMethod, type Method, parseVersion, type Tool } from "./manifest.ts";
import { compareVersions } from "./platform.ts";

type Native = Extract<Method, { kind: "pacman" | "apt" }>;
type Github = Extract<Method, { kind: "github" }>;

/** Link a command into ~/.local/bin, replacing an old link of ours. */
function linkCommand(ctx: Ctx, name: string, target: string) {
  ensureDir(localBin(ctx));
  const path = join(localBin(ctx), name);
  if (occupied(path)) rmSync(path, { force: true });
  symlinkSync(target, path);
}

export async function installedVersionOk(ctx: Ctx, t: Tool): Promise<boolean> {
  const bin = ctx.sh.which(t.bin);
  if (!bin) return false;
  if (!t.minVersion) return true;
  const out = await ctx.sh.run([bin, ...t.minVersion.args], { allowFail: true }).catch(() => undefined);
  const version = out && parseVersion(out.out);
  // Some builds don't report a version (Arch's gitleaks says "version is set by build process"); trust those.
  return version === undefined || compareVersions(version, t.minVersion.min) >= 0;
}

/** Native packages for the tools in `items`, plus `extra` packages that aren't tools (libraries). */
export function systemPackagesStep(items: { tool: Tool; method: Native }[], extra: string[] = []): Step {
  const pkgs = [...new Set([...items.flatMap((i) => i.method.pkgs), ...extra])];
  return {
    id: "system-packages",
    title: "System packages",
    detail: [pkgs.join(" ")],
    critical: true,
    async run(ctx) {
      if (ctx.platform.family === "arch") {
        await ctx.sh.run(["pacman", "-S", "--needed", "--noconfirm", ...pkgs], { root: true });
      } else {
        await ctx.sh.run(["apt-get", "install", "-y", "--no-install-recommends", ...pkgs], {
          root: true,
          env: { DEBIAN_FRONTEND: "noninteractive" },
        });
      }
      // Debian renames some binaries (batcat, fdfind); felix ships as felix but is used as fx.
      for (const { method } of items) {
        for (const [name, target] of Object.entries(method.links ?? {})) {
          const real = ctx.sh.which(target);
          if (real && !ctx.sh.which(name)) linkCommand(ctx, name, real);
        }
      }
      return { status: "done", note: `${pkgs.length} packages` };
    },
  };
}

export function githubToolStep(t: Tool, m: Github): Step {
  return {
    id: `tool:${t.id}`,
    title: `${t.name}`,
    detail: [describeMethod(m)],
    async run(ctx) {
      const tag = await latestGithubTag(m.repo);
      const version = tag.replace(/^v/, "");
      const arch = m.arch[ctx.platform.arch];
      const fill = (s: string) => s.replaceAll("{version}", version).replaceAll("{arch}", arch);
      const asset = fill(m.asset);
      await withTempDir(async (tmp) => {
        const archive = join(tmp, asset);
        await download(`https://github.com/${m.repo}/releases/download/${tag}/${asset}`, archive);
        const out = join(tmp, "x");
        await extract(ctx.sh, archive, out);
        ensureDir(localBin(ctx));
        if (m.dir) {
          const dest = join(localOpt(ctx), t.id);
          rmSync(dest, { recursive: true, force: true });
          cpSync(join(out, fill(m.dir)), dest, { recursive: true, verbatimSymlinks: true });
          for (const [name, path] of Object.entries(m.bins)) linkCommand(ctx, name, join(dest, fill(path)));
        } else {
          for (const [name, path] of Object.entries(m.bins)) {
            // Copy next to the target and rename, so a running binary can be replaced.
            const dest = join(localBin(ctx), name);
            copyFileSync(join(out, fill(path)), `${dest}.new`);
            makeExecutable(`${dest}.new`);
            renameSync(`${dest}.new`, dest);
          }
        }
      });
      return { status: "done", note: `v${version}` };
    },
  };
}

export function linkStep(packages: string[], copies: string[]): Step {
  return {
    id: "link",
    title: "Link dotfiles",
    detail: [`stow: ${packages.join(" ")}`, ...(copies.length ? [`copy if missing: ${copies.join(" ")}`] : [])],
    critical: true,
    guardRc: false, // this step is what changes the rc files
    async run(ctx) {
      const linked = allLinked(join(ctx.repo, "home"), ctx.home, packages);
      const { backedUp } = linked ? { backedUp: [] } : await linkPackages(ctx.sh, ctx.repo, ctx.home, packages, ctx.backup);
      const { copied } = copyPackages(ctx.repo, ctx.home, copies);
      if (linked && !copied.length) return { status: "skipped", note: "already linked" };
      const notes = [];
      if (backedUp.length) notes.push(`moved ${backedUp.length} existing file(s) to ${ctx.backup.path}`);
      if (copied.length) notes.push(`copied ${copied.join(", ")}`);
      return { status: "done", note: notes.join("; ") || undefined };
    },
  };
}

export function ohMyZshStep(plugins: string[]): Step {
  return {
    id: "oh-my-zsh",
    title: "oh-my-zsh",
    detail: ["git clone ohmyzsh/ohmyzsh", ...plugins.map((p) => `plugin ${p}`)],
    async run(ctx) {
      const omz = join(ctx.home, ".oh-my-zsh");
      const todo: [string, string][] = [];
      if (!existsSync(omz)) todo.push(["ohmyzsh/ohmyzsh", omz]);
      for (const p of plugins) {
        const dir = join(omz, "custom", "plugins", p.split("/").at(-1) ?? p);
        if (!existsSync(dir)) todo.push([p, dir]);
      }
      if (!todo.length) return { status: "skipped", note: "already installed" };
      for (const [repo, dir] of todo) {
        await ctx.sh.run(["git", "clone", "--quiet", "--depth", "1", `https://github.com/${repo}.git`, dir]);
      }
      return { status: "done", note: todo.map(([r]) => r.split("/")[1]).join(", ") };
    },
  };
}

export function gitIdentityStep(): Step {
  return {
    id: "git-identity",
    title: "Git identity (~/.gitconfig.local)",
    detail: ["user.name, user.email and the signing key"],
    async run(ctx) {
      const { name, email, signingKey } = ctx.answers.git;
      const file = join(ctx.home, ".gitconfig.local");
      const want: [string, string][] = [];
      if (name) want.push(["user.name", name]);
      if (email) want.push(["user.email", email]);
      if (signingKey) want.push(["user.signingkey", signingKey], ["commit.gpgsign", "true"], ["tag.gpgsign", "true"]);
      if (!want.length) return { status: "skipped", note: "no identity given" };
      let changed = 0;
      for (const [key, value] of want) {
        const current = await ctx.sh.run(["git", "config", "--file", file, "--get", key], { allowFail: true });
        if (current.stdout.trim() === value) continue;
        await ctx.sh.run(["git", "config", "--file", file, key, value]);
        changed++;
      }
      return changed ? { status: "done" } : { status: "skipped", note: "unchanged" };
    },
  };
}

/** Run an official install script: download it, then run it with the given shell. */
async function runInstallScript(ctx: Ctx, url: string, shell: "sh" | "bash", env: Record<string, string>, args: string[] = []) {
  await withTempDir(async (tmp) => {
    const script = join(tmp, "install.sh");
    await download(url, script);
    await ctx.sh.run([shell, script, ...args], { env, cwd: tmp });
  });
}

/** Resolve "lts", "latest" or a version prefix against nodejs.org's release index. */
export function pickNodeVersion(index: { version: string; lts: string | false }[], spec: string): string {
  const stable = index.filter((r) => /^v\d+\.\d+\.\d+$/.test(r.version));
  const found =
    spec === "lts"
      ? stable.find((r) => r.lts !== false)
      : spec === "latest"
        ? stable[0]
        : stable.find((r) => r.version === `v${spec}` || r.version.startsWith(`v${spec}.`));
  if (!found) throw new Error(`No Node.js release matches "${spec}"`);
  return found.version.slice(1);
}

export function pnpmStep(): Step {
  return {
    id: "pnpm",
    title: "pnpm",
    detail: ["get.pnpm.io/install.sh into ~/.local/share/pnpm"],
    critical: true,
    async run(ctx) {
      if (ctx.sh.has("pnpm")) return { status: "skipped", note: "already installed" };
      await runInstallScript(ctx, "https://get.pnpm.io/install.sh", "sh", {
        PNPM_HOME: pnpmHome(ctx),
        PNPM_NO_MODIFY_PATH: "1",
      });
      if (!ctx.sh.has("pnpm")) throw new Error(`pnpm isn't on PATH after installing; expected it in ${join(pnpmHome(ctx), "bin")}`);
      return { status: "done", note: await ctx.sh.capture(["pnpm", "--version"]) };
    },
  };
}

export function nodeStep(spec: string): Step {
  return {
    id: "node",
    title: `Node.js (${spec}, via pnpm)`,
    detail: [`pnpm runtime set node <${spec}> -g`],
    async run(ctx) {
      const index = JSON.parse(await fetchText("https://nodejs.org/dist/index.json"));
      const version = pickNodeVersion(index, spec);
      const node = join(pnpmHome(ctx), "bin", process.platform === "win32" ? "node.exe" : "node");
      if (existsSync(node)) {
        const current = await ctx.sh.capture([node, "--version"]).catch(() => "");
        if (current === `v${version}`) return { status: "skipped", note: `v${version} already` };
      }
      await withTempDir((tmp) => ctx.sh.run(["pnpm", "runtime", "set", "node", version, "-g"], { cwd: tmp }));
      return { status: "done", note: `v${version}` };
    },
  };
}

export function pnpmGlobalsStep(pkgs: string[]): Step {
  return {
    id: "pnpm-globals",
    title: "pnpm global packages",
    detail: [pkgs.join(" ")],
    async run(ctx) {
      const listed = await ctx.sh.run(["pnpm", "ls", "-g", "--depth", "0", "--json"], { allowFail: true });
      let have: string[] = [];
      try {
        const parsed = JSON.parse(listed.stdout);
        have = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((p: { dependencies?: object }) => Object.keys(p.dependencies ?? {}));
      } catch {}
      const missing = pkgs.filter((p) => !have.includes(p.replace(/(?<=.)@[^/]*$/, "")));
      if (!missing.length) return { status: "skipped", note: "already installed" };
      await withTempDir((tmp) => ctx.sh.run(["pnpm", "add", "-g", ...missing], { cwd: tmp }));
      return { status: "done", note: missing.join(", ") };
    },
  };
}

export function uvStep(): Step {
  return {
    id: "uv",
    title: "uv",
    detail: ["astral.sh/uv/install.sh into ~/.local/bin"],
    critical: true,
    async run(ctx) {
      if (ctx.sh.has("uv")) return { status: "skipped", note: "already installed" };
      await runInstallScript(ctx, "https://astral.sh/uv/install.sh", "sh", { UV_NO_MODIFY_PATH: "1" });
      if (!ctx.sh.has("uv")) throw new Error("uv isn't on PATH after installing; expected it in ~/.local/bin");
      return { status: "done", note: (await ctx.sh.capture(["uv", "--version"])).split(" ")[1] };
    },
  };
}

interface UvPython {
  implementation: string;
  version: string;
  variant: string;
}

/** "latest" → the newest stable minor uv can install ("3.15"); a given version is used as is. */
export function pickPythonMinor(list: UvPython[], spec: string): string {
  if (spec !== "latest") return spec;
  const stable = list
    .filter((p) => p.implementation === "cpython" && p.variant === "default" && /^\d+\.\d+\.\d+$/.test(p.version))
    .map((p) => p.version)
    .sort(compareVersions);
  const newest = stable.at(-1);
  if (!newest) throw new Error("uv lists no stable CPython release");
  return newest.split(".").slice(0, 2).join(".");
}

export function pythonStep(spec: string, freethreaded: boolean): Step {
  return {
    id: "python",
    title: `Python (${spec}${freethreaded ? ", free-threaded" : ""}, via uv)`,
    detail: ["uv python install <version> --default", "uv python pin --global <version>"],
    async run(ctx) {
      const list = JSON.parse(await ctx.sh.capture(["uv", "python", "list", "--all-versions", "--output-format", "json"]));
      const version = `${pickPythonMinor(list, spec)}${freethreaded ? "t" : ""}`;
      const pin = join(ctx.home, ".config", "uv", ".python-version");
      const pinned = existsSync(pin) ? readFileSync(pin, "utf8").trim() : "";
      if (pinned === version && ctx.sh.has("python") && ctx.sh.which("python")?.startsWith(localBin(ctx))) {
        return { status: "skipped", note: `${version} already the default` };
      }
      await ctx.sh.run(["uv", "python", "install", version, "--default", "--preview-features", "python-install-default"]);
      await ctx.sh.run(["uv", "python", "pin", "--global", version]);
      return { status: "done", note: version };
    },
  };
}

export function uvToolsStep(tools: string[]): Step {
  return {
    id: "uv-tools",
    title: "uv tools",
    detail: [tools.join(" ")],
    async run(ctx) {
      const listed = await ctx.sh.capture(["uv", "tool", "list"]).catch(() => "");
      const have = listed
        .split("\n")
        .filter((l) => l && !l.startsWith("-"))
        .map((l) => l.split(" ")[0]);
      const missing = tools.filter((t) => !have.includes(t));
      if (!missing.length) return { status: "skipped", note: "already installed" };
      for (const t of missing) await ctx.sh.run(["uv", "tool", "install", t]);
      return { status: "done", note: missing.join(", ") };
    },
  };
}

export function bunStep(via: "installer" | "pnpm"): Step {
  return {
    id: "bun",
    title: `bun (${via === "pnpm" ? "via pnpm" : "bun.sh installer"})`,
    detail: [via === "pnpm" ? "pnpm runtime set bun -g" : "bun.sh/install into ~/.bun"],
    async run(ctx) {
      if (ctx.sh.has("bun") && ctx.sh.which("bun")?.includes(via === "pnpm" ? "pnpm" : ".bun")) {
        return { status: "skipped", note: "already installed" };
      }
      if (via === "pnpm") await withTempDir((tmp) => ctx.sh.run(["pnpm", "runtime", "set", "bun", "-g"], { cwd: tmp }));
      else await runInstallScript(ctx, "https://bun.sh/install", "bash", { BUN_INSTALL: bunHome(ctx) });
      return { status: "done", note: await ctx.sh.capture(["bun", "--version"]) };
    },
  };
}

export function bunGlobalsStep(pkgs: string[]): Step {
  return {
    id: "bun-globals",
    title: "bun global packages",
    detail: [pkgs.join(" ")],
    async run(ctx) {
      const manifest = join(bunHome(ctx), "install", "global", "package.json");
      const have = existsSync(manifest) ? Object.keys(JSON.parse(readFileSync(manifest, "utf8")).dependencies ?? {}) : [];
      const missing = pkgs.filter((p) => !have.includes(p.replace(/(?<=.)@[^/]*$/, "")));
      if (!missing.length) return { status: "skipped", note: "already installed" };
      await ctx.sh.run(["bun", "add", "-g", ...missing]);
      return { status: "done", note: missing.join(", ") };
    },
  };
}

export function loginShellStep(): Step {
  return {
    id: "login-shell",
    title: "zsh as login shell",
    detail: ["usermod -s $(which zsh)"],
    async run(ctx) {
      const zsh = ctx.sh.which("zsh");
      if (!zsh) throw new Error("zsh isn't installed");
      const entry = await ctx.sh.capture(["getent", "passwd", ctx.user]);
      const current = entry.split(":")[6] ?? "";
      if (current.endsWith("/zsh")) return { status: "skipped", note: `already ${current}` };
      const shells = existsSync("/etc/shells") ? readFileSync("/etc/shells", "utf8").split("\n") : [];
      if (!shells.includes(zsh)) await ctx.sh.run(["sh", "-c", `echo '${zsh}' >> /etc/shells`], { root: true });
      await ctx.sh.run(["usermod", "-s", zsh, ctx.user], { root: true });
      return { status: "done", note: zsh };
    },
  };
}

/** The git-wt post-create command that installs the dev dependencies (and with them the hooks) in new worktrees of this repo. */
export const WORKTREE_SETUP = "cd installer && bun install --frozen-lockfile --silent";

export function repoDevSetupStep(): Step {
  return {
    id: "repo-dev-setup",
    title: "Hooks in new worktrees of this repo",
    detail: [`git config wt.postCreate "${WORKTREE_SETUP}"`],
    async run(ctx) {
      if (!existsSync(join(ctx.repo, ".git"))) return { status: "skipped", note: "not a git checkout" };
      const current = await ctx.sh.run(["git", "-C", ctx.repo, "config", "--get-all", "wt.postCreate"], { allowFail: true });
      if (current.stdout.split("\n").includes(WORKTREE_SETUP)) return { status: "skipped", note: "already set" };
      await ctx.sh.run(["git", "-C", ctx.repo, "config", "--add", "wt.postCreate", WORKTREE_SETUP]);
      return { status: "done" };
    },
  };
}

export function paruStep(): Step {
  return {
    id: "paru",
    title: "paru (AUR helper)",
    detail: ["makepkg -si from aur.archlinux.org/paru-bin"],
    async run(ctx) {
      if (ctx.sh.has("paru")) return { status: "skipped", note: "already installed" };
      if (ctx.sh.isRoot) return { status: "skipped", note: "makepkg refuses to run as root" };
      await ctx.sh.run(["pacman", "-S", "--needed", "--noconfirm", "base-devel", "git"], { root: true });
      await withTempDir(async (tmp) => {
        await ctx.sh.run(["git", "clone", "--quiet", "--depth", "1", "https://aur.archlinux.org/paru-bin.git", join(tmp, "paru-bin")]);
        const auth = ctx.sh.rootPrefix?.[0] ?? "sudo";
        await ctx.sh.run(["makepkg", "-si", "--noconfirm"], { cwd: join(tmp, "paru-bin"), env: { PACMAN_AUTH: auth } });
      });
      return { status: "done" };
    },
  };
}

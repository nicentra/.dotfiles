// Downloads, archives, backups and temporary directories.
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { Shell } from "./shell.ts";

export function tempDir(prefix = "dotfiles-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Run fn with a fresh temporary directory that's removed afterwards. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = tempDir();
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${url} (HTTP ${res.status})`);
  mkdirSync(dirname(dest), { recursive: true });
  await Bun.write(dest, res);
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${url} (HTTP ${res.status})`);
  return res.text();
}

/**
 * The latest release tag of a GitHub repo, read from the redirect of
 * /releases/latest. That avoids the API and its rate limit for anonymous
 * requests, which shared CI runners hit quickly.
 */
export async function latestGithubTag(repo: string): Promise<string> {
  const res = await fetch(`https://github.com/${repo}/releases/latest`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const tag = location.match(/\/releases\/tag\/([^/?#]+)$/)?.[1];
  if (!tag) throw new Error(`Couldn't find the latest release of ${repo} (HTTP ${res.status}).`);
  return decodeURIComponent(tag);
}

export async function extract(sh: Shell, archive: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true });
  if (/\.(tar\.gz|tgz)$/.test(archive)) await sh.run(["tar", "-xzf", archive, "-C", dest]);
  else if (/\.tar\.xz$/.test(archive)) await sh.run(["tar", "-xJf", archive, "-C", dest]);
  else if (archive.endsWith(".zip")) {
    if (process.platform === "win32") {
      await sh.run(["powershell", "-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${archive}' -DestinationPath '${dest}'`]);
    } else {
      await sh.run(["unzip", "-q", "-o", archive, "-d", dest]);
    }
  } else throw new Error(`Don't know how to extract ${archive}`);
}

export function makeExecutable(path: string) {
  if (process.platform !== "win32") chmodSync(path, 0o755);
}

/** True if something (a file, directory or symlink, even a broken one) is at path. */
export function occupied(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves files out of the way into one timestamped backup directory per run,
 * keeping their path relative to $HOME.
 */
export class Backup {
  private dir: string | undefined;
  readonly moved: string[] = [];

  constructor(
    readonly home: string,
    private readonly stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15),
  ) {}

  get path(): string {
    return join(this.home, ".dotfiles-backup", this.stamp);
  }

  /** Move path (inside $HOME) into the backup. Returns where it went. */
  move(path: string): string {
    this.dir ??= this.path;
    const rel = relative(this.home, path);
    if (rel.startsWith("..")) throw new Error(`Won't back up ${path}: it's outside ${this.home}`);
    const dest = join(this.dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(path, dest);
    this.moved.push(rel);
    return dest;
  }
}

export function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

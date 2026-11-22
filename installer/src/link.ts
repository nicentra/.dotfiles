// Linking home/<package> into $HOME with GNU stow, after moving whatever is in
// the way into the backup; and seeding the copy/<package> files.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { type Backup, occupied } from "./files.ts";
import type { Shell } from "./shell.ts";

/** Files of a package, relative to the package directory. */
export function packageFiles(pkgDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(pkgDir, path));
    }
  };
  walk(pkgDir);
  return out.sort();
}

/** Whether target is a symlink that resolves to source. */
export function linksTo(target: string, source: string): boolean {
  try {
    if (!lstatSync(target).isSymbolicLink()) return false;
    return resolve(dirname(target), readlinkSync(target)) === resolve(source);
  } catch {
    return false;
  }
}

/**
 * Paths in $HOME that would stop stow from linking these packages: anything
 * where a package file goes that isn't already the right link, and files
 * where a package needs a directory.
 */
export function conflicts(homeDir: string, home: string, packages: string[]): string[] {
  const found = new Set<string>();
  for (const pkg of packages) {
    const pkgDir = join(homeDir, pkg);
    for (const rel of packageFiles(pkgDir)) {
      // Each parent must be a real directory (stow runs with --no-folding).
      const parts = rel.split("/");
      let blocked = false;
      for (let i = 1; i < parts.length; i++) {
        const parent = join(home, ...parts.slice(0, i));
        if (!occupied(parent)) break;
        const st = lstatSync(parent);
        if (!st.isDirectory()) {
          found.add(parent);
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const target = join(home, rel);
      if (occupied(target) && !linksTo(target, join(pkgDir, rel))) found.add(target);
    }
  }
  return [...found].sort();
}

/** Whether every file of these packages is already linked into $HOME. */
export function allLinked(homeDir: string, home: string, packages: string[]): boolean {
  return packages.every((pkg) => packageFiles(join(homeDir, pkg)).every((rel) => linksTo(join(home, rel), join(homeDir, pkg, rel))));
}

/** Links that earlier versions of this repo made and no package provides any more. */
export const LEGACY_LINKS = [
  ".gitconfig", // now ~/.config/git/config; ~/.gitconfig is a per-machine file
];

/** Remove legacy links that point into home/, freeing their place. Returns the removed paths, relative to $HOME. */
export function removeLegacyLinks(homeDir: string, home: string): string[] {
  const removed: string[] = [];
  for (const rel of LEGACY_LINKS) {
    const path = join(home, rel);
    try {
      if (!lstatSync(path).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    if (!resolve(dirname(path), readlinkSync(path)).startsWith(homeDir + sep)) continue;
    rmSync(path);
    removed.push(rel);
  }
  return removed;
}

export interface LinkResult {
  linked: string[];
  backedUp: string[];
}

export async function linkPackages(sh: Shell, repo: string, home: string, packages: string[], backup: Backup): Promise<LinkResult> {
  const homeDir = join(repo, "home");
  const backedUp = conflicts(homeDir, home, packages).map((p) => {
    backup.move(p);
    return relative(home, p);
  });
  await sh.run(["stow", `--dir=${homeDir}`, `--target=${home}`, "--no-folding", "--restow", ...packages]);
  return { linked: packages, backedUp };
}

export interface CopyResult {
  copied: string[];
  /** Already there with different content: the existing copy is kept. */
  kept: string[];
}

/** Copy copy/<package> files into $HOME where they don't exist yet. Programs rewrite these, so an existing file wins. */
export function copyPackages(repo: string, home: string, packages: string[]): CopyResult {
  const result: CopyResult = { copied: [], kept: [] };
  for (const pkg of packages) {
    const pkgDir = join(repo, "copy", pkg);
    if (!existsSync(pkgDir)) continue;
    for (const rel of packageFiles(pkgDir)) {
      const src = join(pkgDir, rel);
      const dest = join(home, rel);
      if (!occupied(dest)) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
        result.copied.push(rel);
      } else if (readFileSync(dest, "utf8") !== readFileSync(src, "utf8")) {
        result.kept.push(rel);
      }
    }
  }
  return result;
}

import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { conflicts, copyPackages, packageFiles, removeLegacyLinks } from "../src/link.ts";
import { tmp } from "./helpers.ts";

function fakeRepo() {
  const repo = tmp("repo-");
  mkdirSync(join(repo, "home", "zsh", ".zsh"), { recursive: true });
  writeFileSync(join(repo, "home", "zsh", ".zshrc"), "zshrc\n");
  writeFileSync(join(repo, "home", "zsh", ".zsh", "aliases.zsh"), "aliases\n");
  mkdirSync(join(repo, "copy", "btop", ".config", "btop"), { recursive: true });
  writeFileSync(join(repo, "copy", "btop", ".config", "btop", "btop.conf"), "theme=default\n");
  return repo;
}

describe("link", () => {
  test("lists package files relative to the package", () => {
    expect(packageFiles(join(fakeRepo(), "home", "zsh"))).toEqual([".zsh/aliases.zsh", ".zshrc"]);
  });

  test("finds existing files but not our own links", () => {
    const repo = fakeRepo();
    const home = tmp("home-");
    writeFileSync(join(home, ".zshrc"), "old\n");
    mkdirSync(join(home, ".zsh"));
    symlinkSync(join(repo, "home", "zsh", ".zsh", "aliases.zsh"), join(home, ".zsh", "aliases.zsh"));
    expect(conflicts(join(repo, "home"), home, ["zsh"])).toEqual([join(home, ".zshrc")]);
  });

  test("a file where a directory belongs is a conflict", () => {
    const repo = fakeRepo();
    const home = tmp("home-");
    writeFileSync(join(home, ".zsh"), "not a dir\n");
    expect(conflicts(join(repo, "home"), home, ["zsh"])).toEqual([join(home, ".zsh")]);
  });

  test("copies only what's missing and keeps changed copies", () => {
    const repo = fakeRepo();
    const home = tmp("home-");
    expect(copyPackages(repo, home, ["btop"])).toEqual({ copied: [".config/btop/btop.conf"], kept: [] });
    writeFileSync(join(home, ".config", "btop", "btop.conf"), "theme=dracula\n");
    expect(copyPackages(repo, home, ["btop"])).toEqual({ copied: [], kept: [".config/btop/btop.conf"] });
    expect(readFileSync(join(home, ".config", "btop", "btop.conf"), "utf8")).toBe("theme=dracula\n");
  });

  test("removes old links into the repo, and nothing else", () => {
    const repo = fakeRepo();
    const home = tmp("home-");
    symlinkSync(join(repo, "home", "git", ".gitconfig"), join(home, ".gitconfig")); // dangling, like after the move
    expect(removeLegacyLinks(join(repo, "home"), home)).toEqual([".gitconfig"]);
    expect(existsSync(join(home, ".gitconfig")) || lstatSync(join(home, ".gitconfig"), { throwIfNoEntry: false })).toBeFalsy();

    const other = tmp("other-");
    writeFileSync(join(other, "gitconfig"), "[user]\n");
    symlinkSync(join(other, "gitconfig"), join(home, ".gitconfig")); // the user's own link
    expect(removeLegacyLinks(join(repo, "home"), home)).toEqual([]);
  });
});

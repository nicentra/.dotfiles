import { describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RcGuard } from "../src/rcguard.ts";
import { tmp } from "./helpers.ts";

describe("RcGuard", () => {
  test("undoes lines appended to a regular file", () => {
    const home = tmp();
    writeFileSync(join(home, ".bashrc"), "original\n");
    const guard = new RcGuard(home);
    appendFileSync(join(home, ".bashrc"), 'export PATH="$HOME/.foo/bin:$PATH"\n');
    expect(guard.restore()).toEqual([{ file: ".bashrc", what: "content" }]);
    expect(readFileSync(join(home, ".bashrc"), "utf8")).toBe("original\n");
  });

  test("undoes writes through a symlink, in the linked file", () => {
    const home = tmp();
    const repoFile = join(tmp(), "zshrc");
    writeFileSync(repoFile, "ours\n");
    symlinkSync(repoFile, join(home, ".zshrc"));
    const guard = new RcGuard(home);
    appendFileSync(join(home, ".zshrc"), "theirs\n");
    guard.restore();
    expect(readFileSync(repoFile, "utf8")).toBe("ours\n");
    expect(lstatSync(join(home, ".zshrc")).isSymbolicLink()).toBe(true);
  });

  test("puts back a symlink an installer replaced with a file", () => {
    const home = tmp();
    const repoFile = join(tmp(), "profile");
    writeFileSync(repoFile, "ours\n");
    symlinkSync(repoFile, join(home, ".profile"));
    const guard = new RcGuard(home);
    rmSync(join(home, ".profile"));
    writeFileSync(join(home, ".profile"), "ours\nexport PATH=x\n"); // what sed -i does
    expect(guard.restore()).toEqual([{ file: ".profile", what: "link" }]);
    expect(readlinkSync(join(home, ".profile"))).toBe(repoFile);
    expect(readFileSync(repoFile, "utf8")).toBe("ours\n");
  });

  test("removes rc files an installer created", () => {
    const home = tmp();
    const guard = new RcGuard(home);
    writeFileSync(join(home, ".zshrc"), "new\n");
    guard.restore();
    expect(existsSync(join(home, ".zshrc"))).toBe(false);
  });

  test("leaves untouched files alone", () => {
    const home = tmp();
    writeFileSync(join(home, ".bashrc"), "same\n");
    expect(new RcGuard(home).restore()).toEqual([]);
  });
});

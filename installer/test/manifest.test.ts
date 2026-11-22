import { describe, expect, test } from "bun:test";
import { parseVersion, resolveMethod, TOOLS, tool } from "../src/manifest.ts";
import { platform, probe } from "./helpers.ts";

describe("manifest", () => {
  test("tool ids are unique", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("GitHub methods cover both CPU types and fill in the arch", () => {
    for (const t of TOOLS) {
      for (const m of t.methods) {
        if (m.kind !== "github") continue;
        expect(Object.keys(m.arch).sort(), t.id).toEqual(["arm64", "x64"]);
        expect(m.asset, t.id).toContain("{arch}");
      }
    }
  });

  test("everything installs from pacman on Arch", async () => {
    for (const t of TOOLS) {
      expect((await resolveMethod(t, platform("arch"), probe()))?.kind, t.id).toBe("pacman");
    }
  });

  test("Debian 13 uses apt unless it's too old or missing", async () => {
    const pick = async (id: string) => (await resolveMethod(tool(id), platform("debian13"), probe("debian13")))?.kind;
    expect(await pick("fzf")).toBe("apt"); // 0.60 has --zsh
    expect(await pick("neovim")).toBe("apt"); // 0.10.4
    expect(await pick("lazygit")).toBe("apt");
    expect(await pick("gitleaks")).toBe("github"); // apt's 8.16 has no `gitleaks git`
    expect(await pick("ghq")).toBe("github");
    expect(await pick("felix")).toBeUndefined();
  });

  test("Ubuntu 24.04 falls back to GitHub releases for old or missing packages", async () => {
    const pick = async (id: string) => (await resolveMethod(tool(id), platform("ubuntu2404"), probe("ubuntu2404")))?.kind;
    expect(await pick("fzf")).toBe("github"); // 0.44 has no --zsh
    expect(await pick("neovim")).toBe("github"); // 0.9.5
    expect(await pick("fastfetch")).toBe("github");
    expect(await pick("lazygit")).toBe("github");
    expect(await pick("starship")).toBe("github");
    expect(await pick("bat")).toBe("apt");
    expect(await pick("reflector")).toBeUndefined(); // Arch only
  });

  test("parseVersion finds the first version number", () => {
    expect(parseVersion("NVIM v0.12.6\nBuild type: Release")).toBe("0.12.6");
    expect(parseVersion("0.75.0 (b3f2a1c)")).toBe("0.75.0");
    expect(parseVersion("version is set by build process")).toBeUndefined();
  });
});

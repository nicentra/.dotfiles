import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeAnswers, presetAnswers } from "../src/answers.ts";
import { buildPlan, windowsSteps } from "../src/plan.ts";
import { platformFromOsRelease } from "../src/platform.ts";
import { FONT, hasFont, mergeTerminalSettings, withoutWindowsPath } from "../src/windows.ts";
import { fakeCtx, OS_RELEASE, platform, tmp } from "./helpers.ts";

const wsl = platformFromOsRelease(OS_RELEASE.arch, "x64", true);

describe("Windows Terminal settings", () => {
  const ours = {
    profiles: { defaults: { colorScheme: "Catppuccin Mocha", font: { face: "FiraCode Nerd Font Mono", size: 11 } } },
    schemes: [{ name: "Catppuccin Mocha", background: "#1E1E2E" }],
  };
  test("profile defaults are merged, the rest of the settings stay", () => {
    const settings = { defaultProfile: "{x}", profiles: { defaults: { opacity: 90 }, list: [{ name: "PowerShell" }] }, schemes: [] };
    expect(mergeTerminalSettings(settings, ours)).toEqual({
      defaultProfile: "{x}",
      profiles: {
        defaults: { opacity: 90, colorScheme: "Catppuccin Mocha", font: { face: "FiraCode Nerd Font Mono", size: 11 } },
        list: [{ name: "PowerShell" }],
      },
      schemes: [{ name: "Catppuccin Mocha", background: "#1E1E2E" }],
    });
  });
  test("a scheme with the same name is replaced, other schemes stay", () => {
    const settings = { profiles: {}, schemes: [{ name: "Dracula" }, { name: "Catppuccin Mocha", background: "#000000" }] };
    expect(mergeTerminalSettings(settings, ours).schemes).toEqual([
      { name: "Dracula" },
      { name: "Catppuccin Mocha", background: "#1E1E2E" },
    ]);
  });
});

describe("font", () => {
  test("found in either font directory", () => {
    const system = tmp();
    const user = tmp();
    expect(hasFont([system, user], FONT.files)).toBe(false);
    writeFileSync(join(user, "FiraCodeNerdFont-Regular.ttf"), ""); // not the Mono variant
    expect(hasFont([system, user], FONT.files)).toBe(false);
    writeFileSync(join(user, "FiraCodeNerdFontMono-Regular.ttf"), "");
    expect(hasFont([system, user, "/nonexistent"], FONT.files)).toBe(true);
  });
});

describe("Windows steps", () => {
  test("only on WSL", async () => {
    const ids = async (p: typeof wsl) => (await buildPlan(fakeCtx(p, presetAnswers("workstation")))).steps.map((s) => s.id);
    expect(await ids(platform("arch"))).not.toContain("windows-apps");
    expect(await ids(wsl)).toEqual(expect.arrayContaining(["windows-apps", "windows-font", "windows-terminal", "windows-git"]));
  });
  test("git for Windows brings Git and delta along", () => {
    const a = normalizeAnswers({ windows: { apps: ["Anysphere.Cursor"], git: true } });
    expect(windowsSteps(a)[0]?.detail[0]?.split(" ")).toEqual(["Anysphere.Cursor", "Git.Git", "dandavison.delta"]);
  });
  test("Claude on Windows only with Claude Code picked", () => {
    expect(windowsSteps(presetAnswers("workstation")).map((s) => s.id)).not.toContain("windows-claude");
    const a = normalizeAnswers({ agents: { harnesses: ["claude"] } });
    expect(windowsSteps(a).map((s) => s.id)).toContain("windows-claude");
  });
  test("nothing for a server", () => {
    expect(windowsSteps(presetAnswers("server"))).toEqual([]);
  });
});

describe("wsl.conf", () => {
  test("adds the key to an existing [interop] section", () => {
    expect(withoutWindowsPath("[boot]\nsystemd=true\n\n[interop]\nenabled = true\n")).toBe(
      "[boot]\nsystemd=true\n\n[interop]\nappendWindowsPath = false\nenabled = true\n",
    );
  });
  test("adds the section when there's none", () => {
    expect(withoutWindowsPath("[boot]\nsystemd=true\n")).toBe("[boot]\nsystemd=true\n\n[interop]\nappendWindowsPath = false\n");
    expect(withoutWindowsPath("")).toBe("[interop]\nappendWindowsPath = false\n");
  });
  test("turns an existing setting off, once", () => {
    const on = "[interop]\nappendWindowsPath = true\n";
    expect(withoutWindowsPath(on)).toBe("[interop]\nappendWindowsPath = false\n");
    expect(withoutWindowsPath(withoutWindowsPath(on))).toBe(withoutWindowsPath(on));
  });
  test("is off unless chosen", () => {
    expect(windowsSteps(presetAnswers("workstation")).map((s) => s.id)).not.toContain("wsl-path");
    expect(windowsSteps(normalizeAnswers({ windows: { trimPath: true } })).map((s) => s.id)).toContain("wsl-path");
  });
});

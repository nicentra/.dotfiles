import { describe, expect, test } from "bun:test";
import { normalizeAnswers, presetAnswers } from "../src/answers.ts";
import { buildPlan, dotfilePackages, wantedTools } from "../src/plan.ts";
import { fakeCtx, platform, probe } from "./helpers.ts";

const ids = async (...args: Parameters<typeof fakeCtx>) => (await buildPlan(fakeCtx(...args))).steps.map((s) => s.id);

describe("plan", () => {
  test("workstation on a fresh Arch", async () => {
    expect(await ids(platform("arch"), presetAnswers("workstation"))).toEqual([
      "system-packages", "link", "oh-my-zsh", "git-identity",
      "pnpm", "node", "uv", "python", "uv-tools", "bun", "login-shell", "paru",
    ]);
  });

  test("Ubuntu 24.04 adds GitHub releases for what apt lacks", async () => {
    const steps = await ids(platform("ubuntu2404"), presetAnswers("workstation"), { probe: probe("ubuntu2404") });
    expect(steps.filter((s) => s.startsWith("tool:"))).toEqual([
      "tool:fzf", "tool:lazygit", "tool:gitleaks", "tool:ghq", "tool:fastfetch", "tool:neovim", "tool:starship",
    ]);
    expect(steps).not.toContain("paru");
  });

  test("notes tools that can't be installed here", async () => {
    const plan = await buildPlan(fakeCtx(platform("debian13"), presetAnswers("workstation"), { probe: probe("debian13") }));
    expect(plan.notes).toEqual(["felix: no way to install it on Debian 13, skipped"]);
  });

  test("server: no runtimes, no paru", async () => {
    expect(await ids(platform("arch"), presetAnswers("server"))).toEqual([
      "system-packages", "link", "oh-my-zsh", "git-identity", "login-shell",
    ]);
  });

  test("installed tools are left out of the package step", async () => {
    const plan = await buildPlan(fakeCtx(platform("arch"), presetAnswers("server"), {
      present: ["git", "curl", "unzip", "stow", "delta", "zsh", "starship", "vim", "rsync", "tree", "jq", "bat", "fzf", "zoxide", "htop"],
    }));
    expect(plan.steps.map((s) => s.id)).not.toContain("system-packages");
  });

  test("bun via pnpm needs pnpm even without Node", async () => {
    const a = normalizeAnswers({ preset: "server", bun: { enabled: true, via: "pnpm" } });
    expect(await ids(platform("arch"), a)).toContain("pnpm");
  });

  test("dependencies come along: delta for .gitconfig, starship and zsh for the shell", () => {
    const a = normalizeAnswers({ preset: "server", tools: [] });
    expect(wantedTools(a)).toEqual(["git", "curl", "unzip", "delta", "vim", "zsh", "stow", "starship"]);
  });

  test("dotfile packages follow the choices", () => {
    expect(dotfilePackages(presetAnswers("workstation"))).toEqual({
      link: ["shell", "git", "dotfiles", "zsh", "starship", "vim", "fastfetch"],
      copy: ["btop"],
    });
  });
});

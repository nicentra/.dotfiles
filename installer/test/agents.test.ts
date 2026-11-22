import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BLOCK_END,
  BLOCK_START,
  claudeSettingsStep,
  HARNESSES,
  harness,
  instructionsStep,
  ownSkillStep,
  parseSkill,
  upsertBlock,
} from "../src/agents.ts";
import { normalizeAnswers, presetAnswers } from "../src/answers.ts";
import { agentSteps } from "../src/plan.ts";
import { fakeCtx, platform } from "./helpers.ts";

const block = `${BLOCK_START} (managed) -->\n# Rules\n${BLOCK_END}\n`;

describe("upsertBlock", () => {
  test("an empty file gets just the block", () => expect(upsertBlock("", block)).toBe(block));
  test("appends after existing text", () => expect(upsertBlock("# Mine\n", block)).toBe(`# Mine\n\n${block}`));
  test("replaces an older block in place", () => {
    const old = `# Mine\n\n${BLOCK_START} (managed) -->\nold\n${BLOCK_END}\n# After\n`;
    expect(upsertBlock(old, block)).toBe(`# Mine\n\n${block}# After\n`);
  });
  test("is stable", () => expect(upsertBlock(upsertBlock("# Mine\n", block), block)).toBe(upsertBlock("# Mine\n", block)));
});

describe("skills", () => {
  test("parses owner/repo@skill, and our own skills by name", () => {
    expect(parseSkill("anthropics/skills@frontend-design")).toEqual({ source: "anthropics/skills", name: "frontend-design" });
    expect(parseSkill("git-workflow")).toEqual({ name: "git-workflow" });
  });

  test("our skill is linked through the shared directory, and what was there is backed up", async () => {
    const ctx = fakeCtx(platform("arch"), presetAnswers("workstation"));
    mkdirSync(join(ctx.home, ".config", "opencode", "skills", "git-workflow"), { recursive: true }); // a stale copy
    const result = await ownSkillStep("git-workflow", [harness("codex"), harness("opencode")]).run(ctx);
    expect(result.status).toBe("done");
    const canonical = join(ctx.home, ".agents", "skills", "git-workflow");
    expect(resolve(readlinkSync(canonical))).toBe(join(ctx.repo, "agents", "skills", "git-workflow"));
    expect(readlinkSync(join(ctx.home, ".config", "opencode", "skills", "git-workflow"))).toBe(canonical);
    expect(lstatSync(join(ctx.home, ".local", "bin", "git-wt")).isSymbolicLink()).toBe(true);
    expect(ctx.backup.moved).toEqual([".config/opencode/skills/git-workflow"]);
    expect((await ownSkillStep("git-workflow", [harness("codex"), harness("opencode")]).run(ctx)).status).toBe("skipped");
  });
});

describe("agent steps", () => {
  test("nothing without a harness", () => {
    expect(agentSteps(presetAnswers("workstation"), [])).toEqual([]);
  });

  test("harnesses, skills, instructions, then Claude settings", () => {
    const a = normalizeAnswers({ agents: { harnesses: ["claude", "codex"] } });
    expect(agentSteps(a, []).map((s) => s.id)).toEqual([
      "agent:claude",
      "agent:codex",
      "skill:git-workflow",
      "skill:frontend-design",
      "skill:find-skills",
      "agent-instructions",
      "claude-settings",
    ]);
  });

  test("Claude settings only with Claude", () => {
    const a = normalizeAnswers({ agents: { harnesses: ["opencode"] } });
    expect(agentSteps(a, []).map((s) => s.id)).not.toContain("claude-settings");
  });

  test("every harness has an install script and a skills id", () => {
    for (const h of HARNESSES) {
      expect(h.install.url, h.id).toStartWith("https://");
      expect(h.skillsAgent, h.id).toBeTruthy();
    }
  });
});

describe("instructions and settings", () => {
  test("the git-workflow block goes into each harness's instructions file, once", async () => {
    const ctx = fakeCtx(platform("arch"), presetAnswers("workstation"));
    mkdirSync(join(ctx.home, ".codex"), { recursive: true });
    writeFileSync(join(ctx.home, ".codex", "AGENTS.md"), "# My own notes\n");
    const step = instructionsStep([harness("codex"), harness("opencode")]);
    expect((await step.run(ctx)).status).toBe("done");
    const codex = readFileSync(join(ctx.home, ".codex", "AGENTS.md"), "utf8");
    expect(codex).toStartWith("# My own notes\n");
    expect(codex).toContain(BLOCK_START);
    expect(existsSync(join(ctx.home, ".config", "opencode", "AGENTS.md"))).toBe(true);
    expect((await step.run(ctx)).status).toBe("skipped");
  });

  test("Claude settings are merged: ours win, the rest stays, the original is kept once", async () => {
    const ctx = fakeCtx(platform("arch"), presetAnswers("workstation"));
    const file = join(ctx.home, ".claude", "settings.json");
    mkdirSync(join(ctx.home, ".claude"));
    writeFileSync(file, JSON.stringify({ theme: "light", hooks: { Stop: [] } }));
    expect((await claudeSettingsStep().run(ctx)).status).toBe("done");
    const merged = JSON.parse(readFileSync(file, "utf8"));
    expect(merged).toMatchObject({ theme: "dark", editorMode: "vim", hooks: { Stop: [] } });
    expect(existsSync(`${file}.bak-dotfiles`)).toBe(true);
    expect((await claudeSettingsStep().run(ctx)).status).toBe("skipped");
  });
});

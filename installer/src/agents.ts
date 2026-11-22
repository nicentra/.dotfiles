// Agent harnesses (opt-in), their skills, global instructions and settings.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mergeDeep } from "./answers.ts";
import type { Ctx, Step } from "./context.ts";
import { runInstallScript } from "./steps.ts";

export interface Harness {
  id: string;
  name: string;
  bin: string;
  install: { url: string; shell: "sh" | "bash"; env?: Record<string, string>; args?: string[] };
  /** The agent's id in the skills CLI (vercel-labs/skills). */
  skillsAgent: string;
  /** Global skills directory, relative to $HOME. */
  skillsDir: string;
  /** Global instructions file, relative to $HOME. */
  instructions: string;
  /** How to sign in after installing. */
  signIn: string;
}

export const HARNESSES: Harness[] = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    install: { url: "https://claude.ai/install.sh", shell: "bash" },
    skillsAgent: "claude-code",
    skillsDir: ".claude/skills",
    instructions: ".claude/CLAUDE.md",
    signIn: "run claude and follow the login",
  },
  {
    id: "codex",
    name: "Codex CLI",
    bin: "codex",
    install: { url: "https://chatgpt.com/codex/install.sh", shell: "sh", env: { CODEX_NON_INTERACTIVE: "1" } },
    skillsAgent: "codex",
    skillsDir: ".agents/skills",
    instructions: ".codex/AGENTS.md",
    signIn: "codex login",
  },
  {
    id: "antigravity",
    name: "Antigravity CLI",
    bin: "agy",
    install: { url: "https://antigravity.google/cli/install.sh", shell: "bash" },
    skillsAgent: "antigravity-cli",
    skillsDir: ".gemini/config/skills",
    instructions: ".gemini/GEMINI.md",
    signIn: "run agy and follow the login",
  },
  {
    id: "opencode",
    name: "opencode",
    bin: "opencode",
    install: { url: "https://opencode.ai/install", shell: "bash", args: ["--no-modify-path"] },
    skillsAgent: "opencode",
    // The skills CLI has opencode read the shared ~/.agents/skills globally.
    skillsDir: ".agents/skills",
    instructions: ".config/opencode/AGENTS.md",
    signIn: "opencode auth login",
  },
];

/** Skills the TUI offers. Ours are directories under agents/skills/; the rest are owner/repo@skill for the skills CLI. */
export const KNOWN_SKILLS = [
  { id: "git-workflow", label: "git-workflow: worktrees, Conventional Commits, git wt (this repo)" },
  { id: "anthropics/skills@frontend-design", label: "frontend-design (anthropics/skills)" },
  { id: "vercel-labs/skills@find-skills", label: "find-skills (vercel-labs/skills)" },
];

/** The skills CLI, pinned, run through the bun that runs the installer. */
const SKILLS_CLI = "skills@1.9.0";

export function harness(id: string): Harness {
  const h = HARNESSES.find((x) => x.id === id);
  if (!h) throw new Error(`Unknown agent harness "${id}"`);
  return h;
}

/** "owner/repo@skill" → { source: "owner/repo", name: "skill" }; ours have no "@". */
export function parseSkill(spec: string): { source?: string; name: string } {
  const at = spec.lastIndexOf("@");
  return at > 0 ? { source: spec.slice(0, at), name: spec.slice(at + 1) } : { name: spec };
}

/** The canonical location skills share, which the per-agent directories link to. */
const canonicalSkills = (home: string) => join(home, ".agents", "skills");

function linkTarget(path: string): string | undefined {
  try {
    return lstatSync(path).isSymbolicLink() ? resolve(dirname(path), readlinkSync(path)) : undefined;
  } catch {
    return undefined;
  }
}

/** Where a path finally points, following every link; undefined when it doesn't exist. */
function realTarget(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Make `path` a symlink to `target`, moving anything else in the way to the
 * backup. A link that already ends at the same file counts: git-workflow's
 * installer links git-wt through ~/.claude/skills, this through ~/.agents/skills.
 * Returns whether it changed.
 */
function ensureLink(ctx: Ctx, path: string, target: string): boolean {
  const current = linkTarget(path);
  if (current === resolve(target)) return false;
  if (current && realTarget(path) !== undefined && realTarget(path) === realTarget(target)) return false;
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) rmSync(path);
    else ctx.backup.move(path);
  } catch {}
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
  return true;
}

export function harnessStep(h: Harness): Step {
  return {
    id: `agent:${h.id}`,
    title: h.name,
    detail: [`official installer: ${h.install.url}`],
    async run(ctx) {
      if (ctx.sh.has(h.bin)) return { status: "skipped", note: "already installed" };
      await runInstallScript(ctx, h.install.url, h.install.shell, h.install.env ?? {}, h.install.args);
      if (!ctx.sh.has(h.bin)) throw new Error(`${h.bin} isn't on PATH after installing ${h.name}`);
      return { status: "done", note: `sign in: ${h.signIn}` };
    },
  };
}

/** A skill from this repo: link it into the shared skills directory and each harness's. */
export function ownSkillStep(name: string, harnesses: Harness[]): Step {
  return {
    id: `skill:${name}`,
    title: `${name} skill`,
    detail: [`link agents/skills/${name} for ${harnesses.map((h) => h.name).join(", ")}`],
    async run(ctx) {
      const source = join(ctx.repo, "agents", "skills", name);
      const canonical = join(canonicalSkills(ctx.home), name);
      let changed = ensureLink(ctx, canonical, source);
      for (const dir of new Set(harnesses.map((h) => h.skillsDir).filter((d) => d !== ".agents/skills"))) {
        changed = ensureLink(ctx, join(ctx.home, dir, name), canonical) || changed;
      }
      // git-workflow brings git wt and, for Claude, its hooks, attribution settings and CLAUDE.md block.
      if (name === "git-workflow") {
        changed = ensureLink(ctx, join(ctx.home, ".local", "bin", "git-wt"), join(canonical, "bin", "git-wt")) || changed;
        if (harnesses.some((h) => h.id === "claude")) {
          const watched = [join(ctx.home, ".claude", "settings.json"), join(ctx.home, ".claude", "CLAUDE.md")];
          const before = watched.map((f) => (existsSync(f) ? readFileSync(f, "utf8") : ""));
          await ctx.sh.run(["bash", join(canonical, "install.sh")]);
          const after = watched.map((f) => (existsSync(f) ? readFileSync(f, "utf8") : ""));
          changed = changed || before.some((b, i) => b !== after[i]);
        }
      }
      return changed ? { status: "done" } : { status: "skipped", note: "already linked" };
    },
  };
}

export const BLOCK_START = "<!-- git-workflow:start";
export const BLOCK_END = "<!-- git-workflow:end -->";

/** Put `block` (which carries its own start and end markers) into `text`: replace the old block, or append. */
export function upsertBlock(text: string, block: string): string {
  const body = block.endsWith("\n") ? block : `${block}\n`;
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END, start);
  if (start >= 0 && end >= 0) {
    let after = end + BLOCK_END.length;
    if (text[after] === "\n") after++;
    return text.slice(0, start) + body + text.slice(after);
  }
  if (!text.trim()) return body;
  return `${text.replace(/\n*$/, "\n")}\n${body}`;
}

/** The git-workflow rules as each harness's global instructions. */
export function instructionsStep(harnesses: Harness[]): Step {
  return {
    id: "agent-instructions",
    title: "Global agent instructions",
    detail: harnesses.map((h) => `~/${h.instructions}`),
    async run(ctx) {
      const block = readFileSync(join(ctx.repo, "agents", "skills", "git-workflow", "CLAUDE.global.md"), "utf8");
      const changed: string[] = [];
      for (const h of harnesses) {
        const file = join(ctx.home, h.instructions);
        const before = existsSync(file) ? readFileSync(file, "utf8") : "";
        const after = upsertBlock(before, block);
        if (after === before) continue;
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, after);
        changed.push(`~/${h.instructions}`);
      }
      return changed.length ? { status: "done", note: changed.join(", ") } : { status: "skipped", note: "up to date" };
    },
  };
}

/** Merge agents/claude/settings.json into ~/.claude/settings.json. Claude Code rewrites that file, so it's merged, not linked. */
export function claudeSettingsStep(): Step {
  return {
    id: "claude-settings",
    title: "Claude Code settings",
    detail: ["merge agents/claude/settings.json into ~/.claude/settings.json"],
    async run(ctx) {
      const file = join(ctx.home, ".claude", "settings.json");
      const ours = JSON.parse(readFileSync(join(ctx.repo, "agents", "claude", "settings.json"), "utf8"));
      const before = existsSync(file) ? readFileSync(file, "utf8") : "";
      const merged = mergeDeep(before.trim() ? JSON.parse(before) : {}, ours);
      const after = `${JSON.stringify(merged, null, 2)}\n`;
      if (before.trim() && JSON.stringify(JSON.parse(before)) === JSON.stringify(merged)) return { status: "skipped", note: "up to date" };
      mkdirSync(dirname(file), { recursive: true });
      if (before && !existsSync(`${file}.bak-dotfiles`)) copyFileSync(file, `${file}.bak-dotfiles`); // the original, once
      writeFileSync(file, after);
      return { status: "done" };
    },
  };
}

/** A third-party skill through the skills CLI, linked for each harness. */
export function externalSkillStep(spec: string, harnesses: Harness[]): Step {
  const { source, name } = parseSkill(spec);
  return {
    id: `skill:${name}`,
    title: `${name} skill`,
    detail: [`skills add ${source} -s ${name} for ${harnesses.map((h) => h.name).join(", ")}`],
    async run(ctx) {
      if (!source) throw new Error(`Skill "${spec}" needs a source: owner/repo@skill`);
      const installed = existsSync(join(canonicalSkills(ctx.home), name, "SKILL.md"));
      const linked = harnesses.every((h) => existsSync(join(ctx.home, h.skillsDir, name, "SKILL.md")));
      if (installed && linked) return { status: "skipped", note: "already installed" };
      const agents = harnesses.flatMap((h) => ["-a", h.skillsAgent]);
      await ctx.sh.run([process.execPath, "x", SKILLS_CLI, "add", source, "-g", ...agents, "-s", name, "-y"], {
        env: { DO_NOT_TRACK: "1", DISABLE_TELEMETRY: "1" },
        cwd: ctx.home,
      });
      return { status: "done" };
    },
  };
}

// What the TUI offers, worked out before it renders: which tools exist on
// this platform and how each would be installed, and Node's current versions.
import type { Ctx } from "../context.ts";
import { fetchText } from "../files.ts";
import { describeMethod, resolveMethod, TOOLS } from "../manifest.ts";
import { installedVersionOk, pickNodeVersion } from "../steps.ts";

/** Always installed, or chosen on another screen (shell, editors), so the tool list doesn't repeat them. */
export const IMPLIED_TOOLS = new Set(["git", "curl", "unzip", "stow", "delta", "zsh", "starship", "vim", "neovim"]);

export interface ToolChoice {
  id: string;
  label: string;
  /** "installed", or how it would be installed here: "pacman", "apt", "GitHub release". */
  how: string;
}

/** The optional tools that can be installed here, in manifest order. Tools with no method here aren't offered. */
export async function toolChoices(ctx: Ctx): Promise<ToolChoice[]> {
  const out: ToolChoice[] = [];
  for (const t of TOOLS) {
    if (IMPLIED_TOOLS.has(t.id)) continue;
    if (await installedVersionOk(ctx, t)) {
      out.push({ id: t.id, label: `${t.name}: ${t.description}`, how: "installed" });
      continue;
    }
    const m = await resolveMethod(t, ctx.platform, ctx.probe);
    if (!m) continue;
    out.push({ id: t.id, label: `${t.name}: ${t.description}`, how: describeMethod(m).split(":")[0] ?? "" });
  }
  return out;
}

export interface NodeVersions {
  lts?: string;
  latest?: string;
}

/** Current LTS and latest Node.js, or nothing when nodejs.org can't be reached. */
export async function nodeVersions(): Promise<NodeVersions> {
  try {
    const index = JSON.parse(await fetchText("https://nodejs.org/dist/index.json"));
    return { lts: pickNodeVersion(index, "lts"), latest: pickNodeVersion(index, "latest") };
  } catch {
    return {};
  }
}

/** "ruff, black  mypy" → ["ruff", "black", "mypy"]. */
export function splitList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The tool list after the user's selection, in the previous order (so the
 * saved answers don't churn), keeping tools this platform doesn't offer,
 * e.g. felix in answers copied from an Arch machine.
 */
export function mergeToolSelection(previous: string[], offered: string[], selected: string[]): string[] {
  const kept = previous.filter((id) => !offered.includes(id) || selected.includes(id));
  return [...kept, ...selected.filter((id) => !kept.includes(id))];
}

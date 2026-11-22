// Answers + platform → the ordered steps of an install.
import type { Answers } from "./answers.ts";
import type { Ctx, Step } from "./context.ts";
import { type Method, type Tool, TOOLS, resolveMethod, tool } from "./manifest.ts";
import {
  bunGlobalsStep, bunStep, githubToolStep, gitIdentityStep, installedVersionOk, linkStep, loginShellStep, nodeStep,
  ohMyZshStep, paruStep, pnpmGlobalsStep, pnpmStep, pythonStep, systemPackagesStep, uvStep, uvToolsStep,
} from "./steps.ts";

export interface Plan {
  steps: Step[];
  /** Things worth telling the user that aren't steps, e.g. tools with no install method here. */
  notes: string[];
}

/** Tools the answers need, including the ones other choices depend on. */
export function wantedTools(a: Answers): string[] {
  const ids = new Set<string>(["git", "curl", "unzip", "stow", "delta" /* .gitconfig pages through it */]);
  if (a.shell.zsh) ids.add("zsh");
  if (a.shell.starship) ids.add("starship");
  if (a.editors.vim) ids.add("vim");
  if (a.editors.neovim) ids.add("neovim");
  for (const t of a.tools) ids.add(t);
  // Keep the manifest order, so the plan reads the same every time.
  return TOOLS.map((t) => t.id).filter((id) => ids.has(id));
}

/** home/<package>s to link and copy/<package>s to seed. */
export function dotfilePackages(a: Answers): { link: string[]; copy: string[] } {
  const link = ["shell", "git", "dotfiles"];
  if (a.shell.zsh) link.push("zsh");
  if (a.shell.starship) link.push("starship");
  if (a.editors.vim) link.push("vim");
  if (a.editors.neovim) link.push("nvim");
  if (a.tools.includes("fastfetch")) link.push("fastfetch");
  const copy = a.tools.includes("btop") ? ["btop"] : [];
  return { link, copy };
}

export async function buildPlan(ctx: Ctx): Promise<Plan> {
  const a = ctx.answers;
  const notes: string[] = [];
  const steps: Step[] = [];

  const native: { tool: Tool; method: Extract<Method, { kind: "pacman" | "apt" }> }[] = [];
  const github: Step[] = [];
  const unknown = a.tools.filter((id) => !TOOLS.some((t) => t.id === id));
  if (unknown.length) notes.push(`Unknown tools in the answers, ignored: ${unknown.join(", ")}`);

  for (const id of wantedTools(a)) {
    const t = tool(id);
    if (await installedVersionOk(ctx, t)) continue;
    const m = await resolveMethod(t, ctx.platform, ctx.probe);
    if (!m) {
      notes.push(`${t.name}: no way to install it on ${ctx.platform.label}, skipped`);
      continue;
    }
    if (m.kind === "pacman" || m.kind === "apt") native.push({ tool: t, method: m });
    else if (m.kind === "github") github.push(githubToolStep(t, m));
  }

  // Libraries the runtimes need that minimal images lack: nodejs.org's Node links libatomic.
  const libs: string[] = [];
  if (a.node.enabled && ctx.platform.family === "debian" && !(await ctx.probe.nativeInstalled("libatomic1"))) libs.push("libatomic1");

  if (native.length || libs.length) steps.push(systemPackagesStep(native, libs));
  const pkgs = dotfilePackages(a);
  steps.push(linkStep(pkgs.link, pkgs.copy));
  if (a.shell.zsh && a.shell.ohMyZsh) steps.push(ohMyZshStep(a.shell.plugins));
  steps.push(...github);
  steps.push(gitIdentityStep());

  if (a.node.enabled || a.bun.via === "pnpm") steps.push(pnpmStep());
  if (a.node.enabled) {
    steps.push(nodeStep(a.node.version));
    if (a.node.globals.length) steps.push(pnpmGlobalsStep(a.node.globals));
  }
  if (a.python.enabled) {
    steps.push(uvStep(), pythonStep(a.python.version, a.python.freethreaded));
    if (a.python.tools.length) steps.push(uvToolsStep(a.python.tools));
  }
  if (a.bun.enabled) {
    steps.push(bunStep(a.bun.via));
    if (a.bun.globals.length) steps.push(bunGlobalsStep(a.bun.globals));
  }

  if (a.shell.zsh && a.shell.loginShell && ctx.platform.os === "linux") steps.push(loginShellStep());
  if (a.extras.paru && ctx.platform.family === "arch") steps.push(paruStep());
  return { steps, notes };
}

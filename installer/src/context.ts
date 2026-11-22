import { join } from "node:path";
import type { Answers } from "./answers.ts";
import { Backup } from "./files.ts";
import type { Probe } from "./manifest.ts";
import type { Platform } from "./platform.ts";
import type { Shell } from "./shell.ts";

export interface Ctx {
  platform: Platform;
  answers: Answers;
  home: string;
  /** Repo root (the directory with home/, copy/ and installer/). */
  repo: string;
  user: string;
  sh: Shell;
  probe: Probe;
  backup: Backup;
}

export type StepResult = { status: "done" | "skipped"; note?: string };

export interface Step {
  id: string;
  title: string;
  /** What the step will do, for --dry-run and the review screen. */
  detail: string[];
  /** A failure here stops the run; other failures are reported at the end. */
  critical?: boolean;
  /** Undo rc-file edits made while this step runs (default true). */
  guardRc?: boolean;
  run(ctx: Ctx): Promise<StepResult>;
}

export const localBin = (ctx: Pick<Ctx, "home">) => join(ctx.home, ".local", "bin");
export const localOpt = (ctx: Pick<Ctx, "home">) => join(ctx.home, ".local", "opt");
export const pnpmHome = (ctx: Pick<Ctx, "home">) => join(ctx.home, ".local", "share", "pnpm");
export const bunHome = (ctx: Pick<Ctx, "home">) => join(ctx.home, ".bun");

/**
 * The same PATH order as home/shell/.config/shell/env.sh, so tools installed
 * by earlier steps are found by later ones in this process.
 */
export function prependToolPaths(home: string) {
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = [
    join(home, ".local", "bin"),
    join(home, ".local", "share", "pnpm", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".opencode", "bin"),
    join(home, ".cargo", "bin"),
  ];
  const current = (process.env.PATH ?? "").split(sep).filter((d) => d && !dirs.includes(d));
  process.env.PATH = [...dirs, ...current].join(sep);
}

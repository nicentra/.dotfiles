// Runs the steps of a plan in order and reports on them.
import type { Ctx, Step, StepResult } from "./context.ts";
import { RcGuard } from "./rcguard.ts";

export interface Reporter {
  start(index: number, total: number, step: Step): void;
  finish(index: number, total: number, step: Step, result: StepResult, ms: number): void;
  fail(index: number, total: number, step: Step, error: Error, ms: number): void;
  note(message: string): void;
}

export interface RunSummary {
  done: Step[];
  skipped: Step[];
  failed: { step: Step; error: Error }[];
  /** Steps not run because a critical step failed. */
  notRun: Step[];
}

export async function runSteps(ctx: Ctx, steps: Step[], reporter: Reporter): Promise<RunSummary> {
  const summary: RunSummary = { done: [], skipped: [], failed: [], notRun: [] };
  for (const [i, step] of steps.entries()) {
    ctx.sh.log.section(step.title);
    reporter.start(i, steps.length, step);
    const guard = step.guardRc === false ? undefined : new RcGuard(ctx.home);
    const started = performance.now();
    try {
      const result = await step.run(ctx);
      (result.status === "done" ? summary.done : summary.skipped).push(step);
      reporter.finish(i, steps.length, step, result, performance.now() - started);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      ctx.sh.log.write(`FAILED: ${error.stack ?? error.message}`);
      summary.failed.push({ step, error });
      reporter.fail(i, steps.length, step, error, performance.now() - started);
      if (step.critical) {
        summary.notRun.push(...steps.slice(i + 1));
        break;
      }
    } finally {
      const restored = guard?.restore() ?? [];
      if (restored.length) {
        const files = [...new Set(restored.map((r) => `~/${r.file}`))].join(", ");
        reporter.note(`  undid the installer's changes to ${files}`);
        ctx.sh.log.write(`restored rc files: ${JSON.stringify(restored)}`);
      }
    }
  }
  return summary;
}

const color = (code: number) => (s: string) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
export const dim = color(2);
export const green = color(32);
export const red = color(31);
export const yellow = color(33);
export const bold = color(1);

export function consoleReporter(): Reporter {
  const counter = (i: number, n: number) => dim(`[${String(i + 1).padStart(String(n).length)}/${n}]`);
  const secs = (ms: number) => dim(`${(ms / 1000).toFixed(1)}s`);
  return {
    start(i, n, step) {
      if (process.stdout.isTTY) process.stdout.write(`${counter(i, n)} ${step.title} …`);
    },
    finish(i, n, step, result, ms) {
      const status = result.status === "done" ? green("done") : dim("skipped");
      const line = `${counter(i, n)} ${step.title} ${status}${result.note ? ` ${dim(`(${result.note})`)}` : ""} ${secs(ms)}`;
      process.stdout.write(process.stdout.isTTY ? `\r\x1b[2K${line}\n` : `${line}\n`);
    },
    fail(i, n, step, error, ms) {
      const line = `${counter(i, n)} ${step.title} ${red("failed")} ${secs(ms)}`;
      process.stdout.write(process.stdout.isTTY ? `\r\x1b[2K${line}\n` : `${line}\n`);
      process.stdout.write(`${error.message.replace(/^/gm, "    ")}\n`);
    },
    note(message) {
      process.stdout.write(`${dim(message)}\n`);
    },
  };
}

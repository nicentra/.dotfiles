// dotfiles installer. Run through bootstrap.sh on a fresh machine, or through
// the `dotfiles` command afterwards.
import { homedir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Answers, type Preset, answersPath, loadAnswers, presetAnswers, saveAnswers } from "./answers.ts";
import { type Ctx, prependToolPaths } from "./context.ts";
import { Backup } from "./files.ts";
import type { Probe } from "./manifest.ts";
import { buildPlan } from "./plan.ts";
import { detectPlatform } from "./platform.ts";
import { bold, consoleReporter, dim, green, red, runSteps, yellow } from "./runner.ts";
import { Log, Shell, detectRootPrefix } from "./shell.ts";

const HELP = `Usage: dotfiles [options]

Without options, reapplies the saved answers (~/.config/dotfiles/answers.json),
or asks what to set up when there are none.

  --preset <name>     Start from a preset: workstation or server
  --answers <file>    Use the answers in this file
  --reconfigure       Ask again, even if answers are saved
  -y, --yes           Don't ask anything (needs saved answers, --answers or --preset)
  -n, --dry-run       Show the steps without running them
  -h, --help          Show this help
`;

async function main(argv: string[]): Promise<number> {
  const { values: opts } = parseArgs({
    args: argv,
    options: {
      preset: { type: "string" },
      answers: { type: "string" },
      reconfigure: { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      "dry-run": { type: "boolean", short: "n" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const home = homedir();
  const repo = resolve(import.meta.dir, "..", "..");
  const platform = detectPlatform();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const log = new Log(join(home, ".local", "state", "dotfiles", `install-${stamp}.log`));
  prependToolPaths(home);
  const sh = new Shell(log, detectRootPrefix());

  const saved = answersPath(home);
  let answers: Answers | undefined;
  if (opts.answers) answers = loadAnswers(resolve(opts.answers));
  else if (opts.preset) {
    if (!["workstation", "server"].includes(opts.preset)) throw new Error(`Unknown preset "${opts.preset}" (workstation, server)`);
    answers = presetAnswers(opts.preset as Preset);
  } else if (!opts.reconfigure) answers = loadAnswers(saved);
  if (!answers) {
    // The TUI comes in the next phase; until then answers have to come from a file or preset.
    process.stderr.write(`No saved answers. Pass --preset workstation, --preset server or --answers <file>.\n\n${HELP}`);
    return 2;
  }

  process.stdout.write(`${bold("dotfiles")} ${dim(`on ${platform.label}, ${platform.arch}`)}\n`);
  if (sh.rootPrefix === undefined) {
    throw new Error("Installing packages needs root, and neither sudo nor doas is installed. Install sudo (as root) and rerun.");
  }

  if (!opts["dry-run"] && platform.family === "debian") {
    process.stdout.write(dim("Refreshing the apt package index …\n"));
    await sh.run(["apt-get", "update"], { root: true, env: { DEBIAN_FRONTEND: "noninteractive" } });
  }

  const probe: Probe = {
    async aptCandidate(pkg) {
      const out = await sh.run(["apt-cache", "policy", pkg], { allowFail: true }).catch(() => undefined);
      const v = out?.stdout.match(/Candidate:\s*(\S+)/)?.[1];
      return v && v !== "(none)" ? v : undefined;
    },
    async nativeInstalled(pkg) {
      if (platform.family === "arch") return sh.ok(["pacman", "-Q", pkg]);
      const out = await sh.run(["dpkg-query", "-W", "-f=${Status}", pkg], { allowFail: true }).catch(() => undefined);
      return out?.stdout.includes("install ok installed") ?? false;
    },
  };
  const ctx: Ctx = { platform, answers, home, repo, user: userInfo().username, sh, probe, backup: new Backup(home, stamp) };
  const plan = await buildPlan(ctx);

  if (opts["dry-run"]) {
    for (const [i, step] of plan.steps.entries()) {
      process.stdout.write(`${dim(`${i + 1}.`)} ${step.title}\n${step.detail.map((d) => dim(`     ${d}\n`)).join("")}`);
    }
    for (const n of plan.notes) process.stdout.write(`${yellow("note")} ${n}\n`);
    return 0;
  }

  // Save first, so a rerun after a failure picks up the same choices.
  if (!opts.answers || resolve(opts.answers) !== saved) saveAnswers(saved, answers);
  for (const n of plan.notes) process.stdout.write(`${yellow("note")} ${n}\n`);

  const summary = await runSteps(ctx, plan.steps, consoleReporter());

  const parts = [
    green(`${summary.done.length} done`),
    dim(`${summary.skipped.length} already in place`),
    ...(summary.failed.length ? [red(`${summary.failed.length} failed`)] : []),
    ...(summary.notRun.length ? [yellow(`${summary.notRun.length} not run`)] : []),
  ];
  process.stdout.write(`\n${parts.join(", ")}\n`);
  if (ctx.backup.moved.length) process.stdout.write(`Replaced files are in ${ctx.backup.path}\n`);
  process.stdout.write(dim(`Log: ${log.path}\n`));
  if (summary.failed.length) return 1;
  process.stdout.write("Open a new terminal (or run exec zsh -l) to use the new setup.\n");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: Error) => {
    process.stderr.write(`${red("error")} ${e.message}\n`);
    process.exit(1);
  },
);

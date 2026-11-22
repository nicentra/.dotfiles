// Running commands: root via sudo or doas, everything written to the log file.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Log {
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }
  write(text: string) {
    appendFileSync(this.path, text.endsWith("\n") ? text : `${text}\n`);
  }
  section(title: string) {
    this.write(`\n=== ${new Date().toISOString()} ${title}`);
  }
}

export interface RunOptions {
  /** Run as root (prefixed with sudo or doas unless already root). */
  root?: boolean;
  env?: Record<string, string | undefined>;
  cwd?: string;
  stdin?: string;
  /** Don't throw on a non-zero exit. */
  allowFail?: boolean;
}

export interface RunResult {
  code: number;
  /** stdout and stderr, interleaved as they arrived. */
  out: string;
  stdout: string;
}

export class CommandError extends Error {
  constructor(
    readonly cmd: string[],
    readonly result: RunResult,
  ) {
    const tail = result.out.trim().split("\n").slice(-15).join("\n");
    super(`${cmd.join(" ")} exited with ${result.code}${tail ? `\n${tail}` : ""}`);
  }
}

/** How to become root: [] when already root, undefined when there's no way. */
export function detectRootPrefix(which: (bin: string) => string | null = Bun.which): string[] | undefined {
  if (process.getuid?.() === 0) return [];
  if (which("sudo")) return ["sudo"];
  if (which("doas")) return ["doas"];
  return undefined;
}

export class Shell {
  constructor(
    readonly log: Log,
    readonly rootPrefix: string[] | undefined,
  ) {}

  get isRoot() {
    return this.rootPrefix?.length === 0;
  }

  which(bin: string): string | null {
    return Bun.which(bin, { PATH: process.env.PATH ?? "" });
  }

  has(bin: string): boolean {
    return this.which(bin) !== null;
  }

  async run(cmd: string[], opts: RunOptions = {}): Promise<RunResult> {
    let full = cmd;
    if (opts.root) {
      if (!this.rootPrefix) throw new Error(`"${cmd.join(" ")}" needs root, but neither sudo nor doas is installed.`);
      // doas drops the environment, so pass variables through env(1) for both.
      const vars = Object.entries(opts.env ?? {}).flatMap(([k, v]) => (v === undefined ? [] : [`${k}=${v}`]));
      full = [...this.rootPrefix, ...(vars.length ? ["env", ...vars] : []), ...cmd];
    }
    this.log.write(`$ ${full.join(" ")}`);
    const proc = Bun.spawn(full, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdin: opts.stdin === undefined ? "ignore" : new Blob([opts.stdin]),
      stdout: "pipe",
      stderr: "pipe",
    });
    let out = "";
    let stdout = "";
    const pump = async (stream: ReadableStream<Uint8Array>, isStdout: boolean) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        out += text;
        if (isStdout) stdout += text;
        this.log.write(text);
      }
    };
    await Promise.all([pump(proc.stdout, true), pump(proc.stderr, false)]);
    const code = await proc.exited;
    const result = { code, out, stdout };
    if (code !== 0) {
      this.log.write(`(exit ${code})`);
      if (!opts.allowFail) throw new CommandError(full, result);
    }
    return result;
  }

  /** True when the command exits 0. Never throws for a non-zero exit. */
  async ok(cmd: string[], opts: RunOptions = {}): Promise<boolean> {
    try {
      return (await this.run(cmd, { ...opts, allowFail: true })).code === 0;
    } catch {
      return false; // e.g. the command doesn't exist
    }
  }

  /** stdout, trimmed. Throws on failure. */
  async capture(cmd: string[], opts: RunOptions = {}): Promise<string> {
    return (await this.run(cmd, opts)).stdout.trim();
  }
}

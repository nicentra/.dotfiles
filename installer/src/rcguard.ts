// Tool installers love appending PATH lines to shell rc files. This repo owns
// those files (they're symlinks into it), so every installer runs inside a
// guard that puts them back exactly as they were.
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RC_FILES = [
  ".zshrc",
  ".zshenv",
  ".zprofile",
  ".zlogin",
  ".bashrc",
  ".bash_profile",
  ".bash_login",
  ".profile",
  ".config/fish/config.fish",
];

type Snapshot =
  | { kind: "missing" }
  | { kind: "file"; content: string }
  | { kind: "link"; target: string; content: string | undefined };

function snap(path: string): Snapshot {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return { kind: "missing" };
  }
  if (st.isSymbolicLink()) {
    const target = readlinkSync(path);
    return { kind: "link", target, content: existsSync(path) ? readFileSync(path, "utf8") : undefined };
  }
  return { kind: "file", content: readFileSync(path, "utf8") };
}

export interface Restored {
  file: string;
  what: "content" | "link" | "removed";
}

export class RcGuard {
  private readonly before = new Map<string, Snapshot>();

  constructor(
    readonly home: string,
    readonly files = RC_FILES,
  ) {
    for (const f of files) this.before.set(f, snap(join(home, f)));
  }

  /** Undo any change to the rc files since the guard was created. */
  restore(): Restored[] {
    const restored: Restored[] = [];
    for (const [file, was] of this.before) {
      const path = join(this.home, file);
      const now = snap(path);
      if (was.kind === "missing") {
        if (now.kind !== "missing") {
          rmSync(path, { force: true });
          restored.push({ file, what: "removed" });
        }
        continue;
      }
      if (was.kind === "file") {
        if (now.kind !== "file" || now.content !== was.content) {
          if (now.kind === "link") rmSync(path, { force: true });
          writeFileSync(path, was.content);
          restored.push({ file, what: "content" });
        }
        continue;
      }
      // Was a symlink. An installer either wrote through it (changing the
      // file in the repo) or replaced it with a regular file (sed -i does).
      if (now.kind !== "link" || now.target !== was.target) {
        rmSync(path, { force: true });
        symlinkSync(was.target, path);
        restored.push({ file, what: "link" });
      }
      if (was.content !== undefined && existsSync(path) && readFileSync(path, "utf8") !== was.content) {
        writeFileSync(realpathSync(path), was.content);
        restored.push({ file, what: "content" });
      }
    }
    return restored;
  }
}

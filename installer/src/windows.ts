// The Windows side of a WSL machine, driven from inside WSL through interop:
// winget apps, the Nerd Font, Windows Terminal, git config and Claude Code.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mergeClaudeSettings } from "./agents.ts";
import { mergeDeep } from "./answers.ts";
import type { Step } from "./context.ts";
import { download, extract, latestGithubTag } from "./files.ts";
import type { Shell } from "./shell.ts";

const SYSTEM32 = "/mnt/c/Windows/System32";
const CMD = `${SYSTEM32}/cmd.exe`;
const POWERSHELL = `${SYSTEM32}/WindowsPowerShell/v1.0/powershell.exe`;
/** Windows tools complain about UNC working directories, so run them from a Windows path. */
const WIN_CWD = "/mnt/c";

export const WINDOWS_APPS = [
  { id: "Microsoft.WindowsTerminal", name: "Windows Terminal" },
  { id: "Microsoft.VisualStudioCode", name: "Visual Studio Code" },
  { id: "Anysphere.Cursor", name: "Cursor" },
  { id: "Docker.DockerDesktop", name: "Docker Desktop" },
  { id: "Git.Git", name: "Git for Windows (Claude Code on Windows needs it)" },
  { id: "dandavison.delta", name: "delta (the shared git config pages through it)" },
];

/** The font the Windows Terminal settings use; not on winget, so it comes from the Nerd Fonts release. */
export const FONT = { family: "FiraCode Nerd Font Mono", asset: "FiraCode.zip", files: /^FiraCodeNerdFontMono-.*\.ttf$/i };

export interface WindowsHost {
  /** %USERPROFILE%, %LOCALAPPDATA% and %TEMP% as WSL paths. */
  profile: string;
  localAppData: string;
  temp: string;
  winget: string;
}

let cached: WindowsHost | undefined;

/** Read the Windows user's folders through cmd.exe and wslpath. */
export async function windowsHost(sh: Shell): Promise<WindowsHost> {
  if (cached) return cached;
  const env = async (name: string) => {
    const win = (await sh.capture([CMD, "/c", `echo %${name}%`], { cwd: WIN_CWD })).replace(/\r/g, "").trim();
    if (!win || win.startsWith("%")) throw new Error(`Couldn't read %${name}% from Windows`);
    return sh.capture(["wslpath", "-u", win]);
  };
  const [profile, localAppData, temp] = await Promise.all([env("USERPROFILE"), env("LOCALAPPDATA"), env("TEMP")]);
  const winget = sh.which("winget.exe") ?? join(localAppData, "Microsoft", "WindowsApps", "winget.exe");
  cached = { profile, localAppData, temp, winget };
  return cached;
}

const winPath = (sh: Shell, path: string) => sh.capture(["wslpath", "-w", path]);

export function windowsAppsStep(ids: string[]): Step {
  return {
    id: "windows-apps",
    title: "Windows apps (winget)",
    detail: [ids.join(" ")],
    // winget may need someone to approve an admin prompt on the Windows desktop.
    interactive: true,
    async run(ctx) {
      const host = await windowsHost(ctx.sh);
      const flags = ["--exact", "--accept-source-agreements", "--disable-interactivity"];
      const installed: string[] = [];
      for (const id of ids) {
        // Exit codes, not output: winget prints in the Windows display language.
        if (await ctx.sh.ok([host.winget, "list", "--id", id, ...flags], { cwd: WIN_CWD })) continue;
        await ctx.sh.run([host.winget, "install", "--id", id, "--silent", "--accept-package-agreements", ...flags], { cwd: WIN_CWD });
        installed.push(id);
      }
      return installed.length ? { status: "done", note: installed.join(", ") } : { status: "skipped", note: "already installed" };
    },
  };
}

/** Whether a font file matching `pattern` is in one of these font directories. */
export function hasFont(dirs: string[], pattern: RegExp): boolean {
  return dirs.some((d) => existsSync(d) && readdirSync(d).some((f) => pattern.test(f)));
}

const INSTALL_FONT_PS1 = `param([string]$Source)
$ErrorActionPreference = 'Stop'
# Per-user install: no admin needed.
$dir = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts'
New-Item -ItemType Directory -Force $dir | Out-Null
$reg = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
Get-ChildItem -Path $Source -Filter '*.ttf' | ForEach-Object {
  $dest = Join-Path $dir $_.Name
  Copy-Item $_.FullName $dest -Force
  New-ItemProperty -Path $reg -Name ($_.BaseName + ' (TrueType)') -Value $dest -PropertyType String -Force | Out-Null
}
`;

export function windowsFontStep(): Step {
  return {
    id: "windows-font",
    title: `${FONT.family} for Windows`,
    detail: [`ryanoasis/nerd-fonts ${FONT.asset}, installed for this user`],
    async run(ctx) {
      const host = await windowsHost(ctx.sh);
      const dirs = ["/mnt/c/Windows/Fonts", join(host.localAppData, "Microsoft", "Windows", "Fonts")];
      if (hasFont(dirs, FONT.files)) return { status: "skipped", note: "already installed" };
      const tag = await latestGithubTag("ryanoasis/nerd-fonts");
      // Work in the Windows temp directory, so PowerShell can read the files.
      const work = join(host.temp, `dotfiles-font-${Date.now()}`);
      try {
        const zip = join(work, FONT.asset);
        await download(`https://github.com/ryanoasis/nerd-fonts/releases/download/${tag}/${FONT.asset}`, zip);
        await extract(ctx.sh, zip, join(work, "all"));
        const fonts = join(work, "fonts");
        mkdirSync(fonts, { recursive: true });
        for (const f of readdirSync(join(work, "all")).filter((n) => FONT.files.test(n)))
          copyFileSync(join(work, "all", f), join(fonts, f));
        writeFileSync(join(work, "install-font.ps1"), INSTALL_FONT_PS1);
        const script = await winPath(ctx.sh, join(work, "install-font.ps1"));
        await ctx.sh.run(
          [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Source", await winPath(ctx.sh, fonts)],
          {
            cwd: WIN_CWD,
          },
        );
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
      return { status: "done", note: tag };
    },
  };
}

type Json = Record<string, unknown>;

/** Windows Terminal settings with ours on top: profile defaults merged, color schemes replaced by name. */
export function mergeTerminalSettings(settings: Json, ours: Json): Json {
  const merged = mergeDeep(settings, { profiles: ours.profiles }) as Json;
  const schemes = (settings.schemes as { name?: string }[] | undefined) ?? [];
  const add = (ours.schemes as { name: string }[] | undefined) ?? [];
  merged.schemes = [...schemes.filter((s) => !add.some((a) => a.name === s.name)), ...add];
  return merged;
}

export function windowsTerminalStep(): Step {
  return {
    id: "windows-terminal",
    title: "Windows Terminal settings",
    detail: ["Catppuccin Mocha and the Nerd Font as defaults (windows/terminal.json)"],
    async run(ctx) {
      const host = await windowsHost(ctx.sh);
      const file = join(host.localAppData, "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json");
      if (!existsSync(file)) return { status: "skipped", note: "Windows Terminal hasn't been started yet" };
      let settings: Json;
      try {
        settings = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        return { status: "skipped", note: "settings.json has comments or isn't JSON; left alone" };
      }
      const ours = JSON.parse(readFileSync(join(ctx.repo, "windows", "terminal.json"), "utf8"));
      const merged = mergeTerminalSettings(settings, ours);
      if (JSON.stringify(merged) === JSON.stringify(settings)) return { status: "skipped", note: "up to date" };
      if (!existsSync(`${file}.bak-dotfiles`)) copyFileSync(file, `${file}.bak-dotfiles`);
      writeFileSync(file, `${JSON.stringify(merged, null, 4)}\n`);
      return { status: "done" };
    },
  };
}

export function windowsGitStep(): Step {
  return {
    id: "windows-git",
    title: "git config for Windows",
    detail: ["shared settings to %USERPROFILE%\\.config\\git\\config, name and email to %USERPROFILE%\\.gitconfig"],
    async run(ctx) {
      const host = await windowsHost(ctx.sh);
      const changed: string[] = [];
      // A copy: Git for Windows can't follow a link into the WSL filesystem.
      const shared = join(host.profile, ".config", "git", "config");
      const source = readFileSync(join(ctx.repo, "home", "git", ".config", "git", "config"), "utf8");
      if (!existsSync(shared) || readFileSync(shared, "utf8") !== source) {
        mkdirSync(dirname(shared), { recursive: true });
        writeFileSync(shared, source);
        changed.push("shared settings");
      }
      // Identity only: signing needs a GPG key on the Windows side, which is a separate choice there.
      const file = join(host.profile, ".gitconfig");
      for (const [key, value] of [
        ["user.name", ctx.answers.git.name],
        ["user.email", ctx.answers.git.email],
      ] as const) {
        if (!value) continue;
        const current = await ctx.sh.run(["git", "config", "--file", file, "--get", key], { allowFail: true });
        if (current.stdout.trim() === value) continue;
        await ctx.sh.run(["git", "config", "--file", file, key, value]);
        changed.push(key);
      }
      return changed.length ? { status: "done", note: changed.join(", ") } : { status: "skipped", note: "up to date" };
    },
  };
}

export function windowsClaudeStep(): Step {
  return {
    id: "windows-claude",
    title: "Claude Code on Windows",
    detail: ["git-workflow install.sh --windows", "merge agents/claude/settings.json into the Windows settings"],
    async run(ctx) {
      const host = await windowsHost(ctx.sh);
      const settings = join(host.profile, ".claude", "settings.json");
      const watched = [settings, join(host.profile, ".claude", "CLAUDE.md")];
      const read = () => watched.map((f) => (existsSync(f) ? readFileSync(f, "utf8") : ""));
      const before = read();
      // git-workflow mirrors itself to the Windows profile: skill, git-wt, hooks, CLAUDE.md block.
      await ctx.sh.run(["bash", join(ctx.repo, "agents", "skills", "git-workflow", "install.sh"), "--windows"], { cwd: WIN_CWD });
      const merged = mergeClaudeSettings(ctx.repo, settings);
      const after = read();
      return merged || before.some((b, i) => b !== after[i]) ? { status: "done" } : { status: "skipped", note: "up to date" };
    },
  };
}

/** Windows commands worth keeping in WSL once Windows' PATH is gone, as links in ~/.local/bin. */
export const WINDOWS_COMMANDS = ["code", "cursor", "explorer.exe", "clip.exe", "cmd.exe", "powershell.exe", "wt.exe", "winget.exe"];

/** /etc/wsl.conf with [interop] appendWindowsPath = false, keeping everything else. */
export function withoutWindowsPath(conf: string): string {
  const lines = conf.split("\n");
  let section = "";
  let interop = -1;
  for (const [i, line] of lines.entries()) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) {
      section = header[1]?.trim().toLowerCase() ?? "";
      if (section === "interop") interop = i;
      continue;
    }
    if (section === "interop" && /^\s*appendWindowsPath\s*=/i.test(line)) {
      lines[i] = "appendWindowsPath = false";
      return lines.join("\n");
    }
  }
  if (interop >= 0) lines.splice(interop + 1, 0, "appendWindowsPath = false");
  else {
    while (lines.length && lines.at(-1)?.trim() === "") lines.pop();
    lines.push(...(lines.length ? [""] : []), "[interop]", "appendWindowsPath = false");
  }
  const out = lines.join("\n");
  return out.endsWith("\n") ? out : `${out}\n`;
}

export function trimWslPathStep(): Step {
  return {
    id: "wsl-path",
    title: "Drop Windows' PATH from WSL",
    detail: ["[interop] appendWindowsPath = false in /etc/wsl.conf", `links in ~/.local/bin: ${WINDOWS_COMMANDS.join(", ")}`],
    async run(ctx) {
      const bin = join(ctx.home, ".local", "bin");
      const linked: string[] = [];
      // Link while Windows' PATH is still there to find them; later runs find the links.
      for (const name of WINDOWS_COMMANDS) {
        const found = ctx.sh.which(name);
        if (!found || found.startsWith(`${bin}/`)) continue;
        mkdirSync(bin, { recursive: true });
        rmSync(join(bin, name), { force: true });
        symlinkSync(found, join(bin, name));
        linked.push(name);
      }
      const conf = existsSync("/etc/wsl.conf") ? readFileSync("/etc/wsl.conf", "utf8") : "";
      const wanted = withoutWindowsPath(conf);
      const confChanged = wanted !== conf;
      if (confChanged) await ctx.sh.run(["tee", "/etc/wsl.conf"], { root: true, stdin: wanted });
      if (!confChanged && !linked.length) return { status: "skipped", note: "already off" };
      const notes = [
        ...(linked.length ? [`linked ${linked.join(", ")}`] : []),
        ...(confChanged ? ["takes effect after wsl --shutdown"] : []),
      ];
      return { status: "done", note: notes.join("; ") };
    },
  };
}

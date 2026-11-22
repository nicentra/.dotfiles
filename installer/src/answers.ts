// What to set up. The TUI fills this in; reruns read it back from disk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Preset = "workstation" | "server" | "custom";

export interface Answers {
  version: 1;
  preset: Preset;
  shell: {
    zsh: boolean;
    ohMyZsh: boolean;
    /** oh-my-zsh custom plugins, as GitHub owner/repo. */
    plugins: string[];
    starship: boolean;
    /** Make zsh the login shell. */
    loginShell: boolean;
  };
  git: {
    name: string;
    email: string;
    /** GPG key id; empty for unsigned commits. */
    signingKey: string;
  };
  github: {
    /** Log in to GitHub with gh (interactive: browser login). */
    login: boolean;
    /** Create ~/.ssh/id_ed25519 if missing and add it to the GitHub account. */
    ssh: boolean;
    /** Use or create a GPG signing key, add it to GitHub, sign commits and tags. */
    gpg: boolean;
  };
  editors: { vim: boolean; neovim: boolean };
  /** Manifest ids of the CLI tools to install. */
  tools: string[];
  node: {
    enabled: boolean;
    /** "lts", "latest", or a version such as "26" or "26.13.1". Installed with pnpm. */
    version: string;
    /** pnpm global packages. */
    globals: string[];
  };
  python: {
    enabled: boolean;
    /** "latest" (newest stable) or a version such as "3.15". Installed with uv. */
    version: string;
    freethreaded: boolean;
    /** uv tools. */
    tools: string[];
  };
  bun: {
    enabled: boolean;
    /** bun's own installer, or pnpm's runtime manager. */
    via: "installer" | "pnpm";
    globals: string[];
  };
  agents: {
    /** Harness ids from the manifest. Nothing is installed unless picked. */
    harnesses: string[];
  };
  extras: {
    /** Arch: install the paru AUR helper. */
    paru: boolean;
  };
}

export const OMZ_PLUGINS = ["zsh-users/zsh-autosuggestions", "zsh-users/zsh-syntax-highlighting"];

export const WORKSTATION_TOOLS = [
  "curl",
  "wget",
  "unzip",
  "rsync",
  "tree",
  "jq",
  "yq",
  "bat",
  "fzf",
  "zoxide",
  "chafa",
  "gh",
  "delta",
  "lazygit",
  "gitleaks",
  "ghq",
  "btop",
  "htop",
  "fastfetch",
  "felix",
  "xdg-utils",
];

export const SERVER_TOOLS = ["curl", "unzip", "rsync", "tree", "jq", "bat", "fzf", "zoxide", "delta", "htop"];

export function presetAnswers(preset: Preset): Answers {
  const server = preset === "server";
  return {
    version: 1,
    preset,
    shell: { zsh: true, ohMyZsh: true, plugins: [...OMZ_PLUGINS], starship: true, loginShell: true },
    git: { name: "", email: "", signingKey: "" },
    github: { login: !server, ssh: !server, gpg: !server },
    editors: { vim: true, neovim: !server },
    tools: [...(server ? SERVER_TOOLS : WORKSTATION_TOOLS)],
    node: { enabled: !server, version: "lts", globals: [] },
    python: { enabled: !server, version: "latest", freethreaded: false, tools: server ? [] : ["ruff"] },
    bun: { enabled: !server, via: "installer", globals: [] },
    agents: { harnesses: [] },
    extras: { paru: !server },
  };
}

export function answersPath(home: string): string {
  return join(home, ".config", "dotfiles", "answers.json");
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Values from `over` win; missing keys come from `base`. Arrays are replaced, not merged. */
export function mergeDeep<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? mergeDeep((base as Plain)[k], v) : v;
  return out as T;
}

/** Fill in defaults for keys an older answers file doesn't have yet, and check the types. */
export function normalizeAnswers(raw: unknown): Answers {
  if (!isPlain(raw)) throw new Error("answers must be a JSON object");
  const preset = (raw.preset as Preset | undefined) ?? "custom";
  if (!["workstation", "server", "custom"].includes(preset)) throw new Error(`unknown preset "${preset}"`);
  const base = presetAnswers(preset === "server" ? "server" : "workstation");
  const merged = mergeDeep(base, raw);
  merged.preset = preset;
  checkShape(base, merged, "answers");
  return merged;
}

function checkShape(expected: unknown, actual: unknown, path: string) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.some((x) => typeof x !== "string")) throw new Error(`${path} must be a list of strings`);
    return;
  }
  if (isPlain(expected)) {
    if (!isPlain(actual)) throw new Error(`${path} must be an object`);
    for (const k of Object.keys(expected)) checkShape(expected[k], actual[k], `${path}.${k}`);
    return;
  }
  if (typeof actual !== typeof expected) throw new Error(`${path} must be a ${typeof expected}`);
}

export function loadAnswers(path: string): Answers | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return normalizeAnswers(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
}

export function saveAnswers(path: string, answers: Answers) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(answers, null, 2)}\n`);
}

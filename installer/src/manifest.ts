// Every CLI tool the installer offers, with the ways to install it. The first
// method that applies to the platform wins, so list the native package
// first, then fallbacks.
import type { Arch, Family, Platform } from "./platform.ts";
import { compareVersions } from "./platform.ts";

export type Method =
  | { kind: "pacman"; pkgs: string[]; links?: Record<string, string> }
  | {
      kind: "apt";
      pkgs: string[];
      /** Skip apt when its candidate version is older than this. */
      min?: string;
      /** Commands to add to ~/.local/bin, e.g. { bat: "batcat" } where Debian renamed the binary. */
      links?: Record<string, string>;
    }
  | {
      kind: "github";
      repo: string;
      /** Asset file name; {version} is the tag without "v", {arch} comes from `arch`. */
      asset: string;
      arch: Record<Arch, string>;
      /** Directory in the archive to keep as a whole under ~/.local/opt/<tool id>. */
      dir?: string;
      /** Command name → path in the archive (inside `dir` if given). */
      bins: Record<string, string>;
    }
  | { kind: "winget"; id: string };

export type Group = "core" | "git" | "system" | "editor" | "shell" | "extra";

export interface Tool {
  id: string;
  name: string;
  group: Group;
  description: string;
  /** The command whose presence means it's installed. */
  bin: string;
  /** An installed copy older than this doesn't count, e.g. Ubuntu 24.04's fzf has no `fzf --zsh`. */
  minVersion?: { args: string[]; min: string };
  methods: Method[];
}

const native = (pacman: string, apt = pacman, extra: { min?: string; aptLinks?: Record<string, string> } = {}): Method[] => [
  { kind: "pacman", pkgs: [pacman] },
  { kind: "apt", pkgs: [apt], min: extra.min, links: extra.aptLinks },
];

export const TOOLS: Tool[] = [
  // core
  { id: "git", name: "git", group: "core", description: "Version control", bin: "git", methods: native("git") },
  { id: "curl", name: "curl", group: "core", description: "HTTP client", bin: "curl", methods: native("curl") },
  { id: "wget", name: "wget", group: "core", description: "HTTP downloader", bin: "wget", methods: native("wget") },
  { id: "unzip", name: "unzip", group: "core", description: "Zip archives", bin: "unzip", methods: native("unzip") },
  { id: "rsync", name: "rsync", group: "core", description: "File sync", bin: "rsync", methods: native("rsync") },
  { id: "tree", name: "tree", group: "core", description: "Directory trees", bin: "tree", methods: native("tree") },
  { id: "jq", name: "jq", group: "core", description: "JSON processor", bin: "jq", methods: native("jq") },
  { id: "yq", name: "yq", group: "core", description: "jq for YAML, XML and TOML", bin: "yq", methods: native("yq") },
  {
    id: "bat",
    name: "bat",
    group: "core",
    description: "cat with syntax highlighting",
    bin: "bat",
    methods: native("bat", "bat", { aptLinks: { bat: "batcat" } }),
  },
  {
    id: "fzf",
    name: "fzf",
    group: "core",
    description: "Fuzzy finder (Ctrl-R, Ctrl-T)",
    bin: "fzf",
    minVersion: { args: ["--version"], min: "0.48" }, // `fzf --zsh`
    methods: [
      ...native("fzf", "fzf", { min: "0.48" }),
      {
        kind: "github",
        repo: "junegunn/fzf",
        asset: "fzf-{version}-linux_{arch}.tar.gz",
        arch: { x64: "amd64", arm64: "arm64" },
        bins: { fzf: "fzf" },
      },
    ],
  },
  { id: "zoxide", name: "zoxide", group: "core", description: "Smarter cd (z)", bin: "zoxide", methods: native("zoxide") },
  { id: "ripgrep", name: "ripgrep", group: "core", description: "Fast grep (rg)", bin: "rg", methods: native("ripgrep") },
  {
    id: "fd",
    name: "fd",
    group: "core",
    description: "Fast find",
    bin: "fd",
    methods: native("fd", "fd-find", { aptLinks: { fd: "fdfind" } }),
  },
  {
    id: "shellcheck",
    name: "ShellCheck",
    group: "core",
    description: "Shell script linter (this repo's hooks use it)",
    bin: "shellcheck",
    methods: native("shellcheck"),
  },
  { id: "chafa", name: "chafa", group: "core", description: "Images in the terminal", bin: "chafa", methods: native("chafa") },

  // git
  { id: "gh", name: "GitHub CLI", group: "git", description: "GitHub from the terminal", bin: "gh", methods: native("github-cli", "gh") },
  {
    id: "delta",
    name: "delta",
    group: "git",
    description: "Pager for git diffs (used by .gitconfig)",
    bin: "delta",
    methods: native("git-delta"),
  },
  {
    id: "lazygit",
    name: "lazygit",
    group: "git",
    description: "Git TUI",
    bin: "lazygit",
    methods: [
      ...native("lazygit"),
      {
        kind: "github",
        repo: "jesseduffield/lazygit",
        asset: "lazygit_{version}_linux_{arch}.tar.gz",
        arch: { x64: "x86_64", arm64: "arm64" },
        bins: { lazygit: "lazygit" },
      },
    ],
  },
  {
    id: "gitleaks",
    name: "gitleaks",
    group: "git",
    description: "Secret scanner (used by the git-wt guard)",
    bin: "gitleaks",
    minVersion: { args: ["version"], min: "8.19" }, // `gitleaks git`
    methods: [
      { kind: "pacman", pkgs: ["gitleaks"] },
      {
        kind: "github",
        repo: "gitleaks/gitleaks",
        asset: "gitleaks_{version}_linux_{arch}.tar.gz",
        arch: { x64: "x64", arm64: "arm64" },
        bins: { gitleaks: "gitleaks" },
      },
    ],
  },
  {
    id: "openssh",
    name: "OpenSSH",
    group: "git",
    description: "ssh and ssh-keygen",
    bin: "ssh-keygen",
    methods: native("openssh", "openssh-client"),
  },
  {
    id: "gnupg",
    name: "GnuPG",
    group: "git",
    description: "gpg, for signed commits",
    bin: "gpg",
    // Debian only recommends a pinentry, and --no-install-recommends skips it: no passphrase prompt without one.
    methods: [
      { kind: "pacman", pkgs: ["gnupg"] },
      { kind: "apt", pkgs: ["gnupg", "pinentry-curses"] },
    ],
  },
  {
    id: "ghq",
    name: "ghq",
    group: "git",
    description: "Clone repos into a tidy tree",
    bin: "ghq",
    methods: [
      { kind: "pacman", pkgs: ["ghq"] },
      {
        kind: "github",
        repo: "x-motemen/ghq",
        asset: "ghq_linux_{arch}.zip",
        arch: { x64: "amd64", arm64: "arm64" },
        bins: { ghq: "ghq_linux_{arch}/ghq" },
      },
    ],
  },

  // system
  { id: "btop", name: "btop", group: "system", description: "Resource monitor", bin: "btop", methods: native("btop") },
  { id: "htop", name: "htop", group: "system", description: "Process viewer", bin: "htop", methods: native("htop") },
  {
    id: "fastfetch",
    name: "fastfetch",
    group: "system",
    description: "System info, shown when a terminal opens",
    bin: "fastfetch",
    methods: [
      ...native("fastfetch"),
      {
        kind: "github",
        repo: "fastfetch-cli/fastfetch",
        asset: "fastfetch-linux-{arch}.tar.gz",
        arch: { x64: "amd64", arm64: "aarch64" },
        dir: "fastfetch-linux-{arch}",
        bins: { fastfetch: "usr/bin/fastfetch" },
      },
    ],
  },
  {
    id: "felix",
    name: "felix",
    group: "system",
    description: "File manager (fx). Arch only: no Linux binaries upstream",
    bin: "fx",
    methods: [{ kind: "pacman", pkgs: ["felix-rs"], links: { fx: "felix" } }],
  },
  { id: "xdg-utils", name: "xdg-utils", group: "system", description: "xdg-open", bin: "xdg-open", methods: native("xdg-utils") },
  {
    id: "reflector",
    name: "reflector",
    group: "system",
    description: "Arch mirror list ranking",
    bin: "reflector",
    methods: [{ kind: "pacman", pkgs: ["reflector"] }],
  },
  {
    id: "ex-vi-compat",
    name: "ex-vi-compat",
    group: "editor",
    description: "vi and ex commands via vim (Arch)",
    bin: "vi",
    methods: [{ kind: "pacman", pkgs: ["ex-vi-compat"] }],
  },

  // editors and shell
  { id: "vim", name: "vim", group: "editor", description: "Vim", bin: "vim", methods: native("vim") },
  {
    id: "neovim",
    name: "neovim",
    group: "editor",
    description: "Neovim",
    bin: "nvim",
    minVersion: { args: ["--version"], min: "0.10" },
    methods: [
      ...native("neovim", "neovim", { min: "0.10" }),
      {
        kind: "github",
        repo: "neovim/neovim",
        asset: "nvim-linux-{arch}.tar.gz",
        arch: { x64: "x86_64", arm64: "arm64" },
        dir: "nvim-linux-{arch}",
        bins: { nvim: "bin/nvim" },
      },
    ],
  },
  { id: "zsh", name: "zsh", group: "shell", description: "Z shell", bin: "zsh", methods: native("zsh") },
  { id: "stow", name: "GNU stow", group: "shell", description: "Links the dotfiles", bin: "stow", methods: native("stow") },
  {
    id: "starship",
    name: "starship",
    group: "shell",
    description: "Prompt",
    bin: "starship",
    methods: [
      ...native("starship"),
      {
        kind: "github",
        repo: "starship/starship",
        asset: "starship-{arch}-unknown-linux-musl.tar.gz",
        arch: { x64: "x86_64", arm64: "aarch64" },
        bins: { starship: "starship" },
      },
    ],
  },

  // extras
  {
    id: "nvidia-container-toolkit",
    name: "NVIDIA Container Toolkit",
    group: "extra",
    description: "GPUs in Docker containers (Arch)",
    bin: "nvidia-ctk",
    methods: [{ kind: "pacman", pkgs: ["nvidia-container-toolkit"] }],
  },
];

export function tool(id: string): Tool {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tool "${id}"`);
  return t;
}

/** What the resolver needs to know about the machine, so tests can fake it. */
export interface Probe {
  /** apt's candidate version for a package, or undefined if it has none. */
  aptCandidate(pkg: string): Promise<string | undefined>;
  /** Whether a native package (pacman or dpkg) is installed. */
  nativeInstalled(pkg: string): Promise<boolean>;
}

export function methodApplies(m: Method, family: Family): boolean {
  switch (m.kind) {
    case "pacman":
      return family === "arch";
    case "apt":
      return family === "debian";
    case "github":
      return family !== "windows";
    case "winget":
      return family === "windows";
  }
}

/** The method to install a tool with on this platform, or undefined if there's none. */
export async function resolveMethod(t: Tool, platform: Platform, probe: Probe): Promise<Method | undefined> {
  for (const m of t.methods) {
    if (!methodApplies(m, platform.family)) continue;
    if (m.kind === "apt") {
      const [pkg] = m.pkgs;
      const candidate = pkg && (await probe.aptCandidate(pkg));
      if (!candidate) continue;
      if (m.min && compareVersions(candidate, m.min) < 0) continue;
    }
    return m;
  }
  return undefined;
}

export function describeMethod(m: Method): string {
  switch (m.kind) {
    case "pacman":
      return `pacman: ${m.pkgs.join(" ")}`;
    case "apt":
      return `apt: ${m.pkgs.join(" ")}`;
    case "github":
      return `GitHub release: ${m.repo}`;
    case "winget":
      return `winget: ${m.id}`;
  }
}

/** First version number in a command's output: "NVIM v0.12.6" → "0.12.6". */
export function parseVersion(output: string): string | undefined {
  return output.match(/\d+\.\d+(?:\.\d+)?/)?.[0];
}

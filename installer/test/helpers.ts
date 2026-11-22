import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Answers } from "../src/answers.ts";
import type { Ctx } from "../src/context.ts";
import { Backup } from "../src/files.ts";
import type { Probe } from "../src/manifest.ts";
import { type Platform, platformFromOsRelease } from "../src/platform.ts";
import { Log, Shell } from "../src/shell.ts";

export const tmp = (prefix = "dotfiles-test-") => mkdtempSync(join(tmpdir(), prefix));

export const OS_RELEASE = {
  arch: 'NAME="Arch Linux"\nPRETTY_NAME="Arch Linux"\nID=arch\nBUILD_ID=rolling\n',
  debian13: 'PRETTY_NAME="Debian GNU/Linux 13 (trixie)"\nNAME="Debian GNU/Linux"\nVERSION_ID="13"\nID=debian\n',
  ubuntu2404: 'PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n',
  ubuntu2604: 'PRETTY_NAME="Ubuntu 26.04 LTS"\nNAME="Ubuntu"\nVERSION_ID="26.04"\nID=ubuntu\nID_LIKE=debian\n',
};

export const platform = (key: keyof typeof OS_RELEASE): Platform => platformFromOsRelease(OS_RELEASE[key], "x64", false);

/** apt candidate versions, as `apt-cache policy` reported them in the real images. */
export const APT: Record<string, Record<string, string>> = {
  debian13: {
    git: "1:2.47.3-0+deb13u1",
    curl: "8.14.1-2",
    wget: "1.25.0-2",
    unzip: "6.0-29",
    rsync: "3.5.0",
    tree: "2.2.1-1",
    jq: "1.7.1-6",
    yq: "3.4.3-2",
    bat: "0.25.0-2",
    fzf: "0.60.3-1",
    zoxide: "0.9.7-1",
    ripgrep: "14.1.1-1",
    "fd-find": "10.2.0-1",
    chafa: "1.14.5-1",
    gh: "2.46.0-3",
    "git-delta": "0.18.2-4",
    lazygit: "0.50.0+ds1-1",
    gitleaks: "8.16.0-1",
    btop: "1.3.2-0.1",
    htop: "3.4.1-5",
    fastfetch: "2.40.4+dfsg-1",
    "xdg-utils": "1.2.1-2",
    vim: "2:9.1.1230-2",
    neovim: "0.10.4-8",
    zsh: "5.9-8",
    stow: "2.4.1-2",
    starship: "1.22.1-5",
    gnupg: "2.4.7-21+deb13u1",
    "pinentry-curses": "1.3.1-2",
    "openssh-client": "1:10.0p1-7+deb13u4",
  },
  ubuntu2404: {
    git: "1:2.43.0-1ubuntu7.4",
    curl: "8.5.0-2ubuntu10",
    wget: "1.21.4-1ubuntu4",
    unzip: "6.0-28ubuntu4",
    rsync: "3.2.7-1",
    tree: "2.1.1-2",
    jq: "1.7.1-3",
    yq: "3.1.0-3",
    bat: "0.24.0-1build1",
    fzf: "0.44.1-1ubuntu0.3",
    zoxide: "0.9.3-1",
    ripgrep: "14.1.0-1",
    "fd-find": "9.0.0-1",
    chafa: "1.14.0-1.1",
    gh: "2.45.0-1",
    "git-delta": "0.16.5-5",
    gitleaks: "8.16.0-1",
    btop: "1.3.0-1",
    htop: "3.3.0-4",
    "xdg-utils": "1.1.3-4.1",
    vim: "2:9.1.0016-1",
    neovim: "0.9.5-6ubuntu2",
    zsh: "5.9-6ubuntu2",
    stow: "2.3.1-1",
    gnupg: "2.4.4-2ubuntu17.6",
    "pinentry-curses": "1.2.1-3ubuntu5",
    "openssh-client": "1:9.6p1-3ubuntu13.20",
  },
};

export const probe = (key?: keyof typeof APT, installed: string[] = []): Probe => ({
  aptCandidate: async (pkg) => (key ? APT[key]?.[pkg] : undefined),
  nativeInstalled: async (pkg) => installed.includes(pkg),
});

/** A Shell that finds no commands and records what it would run. */
export class FakeShell extends Shell {
  readonly ran: string[][] = [];
  constructor(private readonly present: string[] = []) {
    super(new Log(join(tmp(), "test.log")), []);
  }
  override which(bin: string) {
    return this.present.includes(bin) ? `/usr/bin/${bin}` : null;
  }
  override async run(cmd: string[]) {
    this.ran.push(cmd);
    return { code: 0, out: "", stdout: "" };
  }
}

export function fakeCtx(p: Platform, answers: Answers, opts: { probe?: Probe; present?: string[] } = {}): Ctx {
  const home = tmp("dotfiles-home-");
  return {
    platform: p,
    answers,
    home,
    repo: join(import.meta.dir, "..", ".."),
    user: "tester",
    sh: new FakeShell(opts.present),
    probe: opts.probe ?? probe(),
    backup: new Backup(home, "test"),
    interactive: false,
  };
}

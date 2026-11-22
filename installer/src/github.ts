// GitHub CLI login, SSH key and GPG signing key. These steps need a person at
// the terminal (browser login, key passphrases), so they're interactive and
// skipped in runs without one.
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import type { Ctx, Step } from "./context.ts";
import { withTempDir } from "./files.ts";

const HOST = "github.com";

/** Scopes from `gh auth status`: "- Token scopes: 'admin:public_key', 'gist', 'repo'". */
export function parseScopes(status: string): string[] {
  const line = status.match(/Token scopes:\s*(.*)/)?.[1] ?? "";
  return line
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

/** Scopes the chosen setup needs that the token lacks. admin:x covers write:x. */
export function missingScopes(have: string[], need: string[]): string[] {
  return need.filter((s) => !have.includes(s) && !have.includes(s.replace(/^(read|write):/, "admin:")));
}

/** The address GitHub keeps for users who hide theirs. */
export function noreplyEmail(id: number, login: string): string {
  return `${id}+${login}@users.noreply.github.com`;
}

/** "ssh-ed25519 AAAA… comment" → "ssh-ed25519 AAAA…": GitHub stores keys without the comment. */
export function sshKeyBody(publicKey: string): string {
  return publicKey.trim().split(/\s+/).slice(0, 2).join(" ");
}

/** known_hosts lines for github.com from the ssh_keys of GitHub's /meta. */
export function knownHostsLines(sshKeys: string[]): string[] {
  return sshKeys.map((k) => `${HOST} ${k}`);
}

export interface GpgKey {
  keyId: string;
  fingerprint: string;
  emails: string[];
  /** Usable for signing: not expired or revoked, and has the sign capability. */
  canSign: boolean;
}

/** Secret keys from `gpg --list-secret-keys --with-colons`. */
export function parseGpgSecretKeys(colons: string): GpgKey[] {
  const keys: GpgKey[] = [];
  let current: GpgKey | undefined;
  for (const line of colons.split("\n")) {
    const f = line.split(":");
    if (f[0] === "sec") {
      const validity = f[1] ?? "";
      const caps = f[11] ?? "";
      current = { keyId: f[4] ?? "", fingerprint: "", emails: [], canSign: !/[erd]/.test(validity) && /S/.test(caps) };
      keys.push(current);
    } else if (f[0] === "fpr" && current && !current.fingerprint) {
      current.fingerprint = f[9] ?? "";
    } else if (f[0] === "uid" && current) {
      const email = (f[9] ?? "").match(/<([^>]+)>/)?.[1];
      if (email) current.emails.push(email.toLowerCase());
    } else if (f[0] === "ssb") {
      current = undefined; // subkeys and their uids don't count
    }
  }
  return keys;
}

/** The key to sign with: the configured one if it exists, else a signing key for the email. */
export function pickSigningKey(keys: GpgKey[], email: string, preferred: string): GpgKey | undefined {
  const usable = keys.filter((k) => k.canSign);
  if (preferred) {
    const p = preferred.toUpperCase();
    const found = usable.find((k) => k.keyId.endsWith(p) || k.fingerprint.endsWith(p));
    if (found) return found;
  }
  return usable.find((k) => k.emails.includes(email.toLowerCase()));
}

async function loggedIn(ctx: Ctx): Promise<{ ok: boolean; out: string }> {
  const r = await ctx.sh.run(["gh", "auth", "status", "--hostname", HOST], { allowFail: true });
  return { ok: r.code === 0, out: r.out };
}

/** Logged in with a token that has this scope (or the admin one covering it). */
async function canUse(ctx: Ctx, scope: string): Promise<boolean> {
  const s = await loggedIn(ctx);
  return s.ok && missingScopes(parseScopes(s.out), [scope]).length === 0;
}

/** Scopes the setup needs: uploading SSH and GPG keys. */
function neededScopes(ctx: Ctx): string[] {
  const { ssh, gpg } = ctx.answers.github;
  return [...(ssh ? ["admin:public_key"] : []), ...(gpg ? ["write:gpg_key"] : [])];
}

export function githubLoginStep(): Step {
  return {
    id: "github-login",
    title: "GitHub CLI login",
    detail: ["gh auth login (browser), with the scopes to add SSH and GPG keys"],
    interactive: true,
    async run(ctx) {
      const need = neededScopes(ctx);
      const status = await loggedIn(ctx);
      let did = "";
      if (!status.ok) {
        await ctx.sh.interactive([
          "gh",
          "auth",
          "login",
          "--hostname",
          HOST,
          "--git-protocol",
          "ssh",
          "--web",
          "--skip-ssh-key",
          ...(need.length ? ["--scopes", need.join(",")] : []),
        ]);
        did = "logged in";
      } else {
        const missing = missingScopes(parseScopes(status.out), need);
        if (missing.length) {
          await ctx.sh.interactive(["gh", "auth", "refresh", "--hostname", HOST, "--scopes", missing.join(",")]);
          did = `added scopes ${missing.join(", ")}`;
        }
      }
      // Fill in a missing git identity from the GitHub account.
      const git = ctx.answers.git;
      if (!git.name || !git.email) {
        const user = JSON.parse(await ctx.sh.capture(["gh", "api", "user"])) as {
          id: number;
          login: string;
          name: string | null;
          email: string | null;
        };
        git.name ||= user.name || user.login;
        git.email ||= user.email || noreplyEmail(user.id, user.login);
        did = [did, `identity ${git.name} <${git.email}>`].filter(Boolean).join("; ");
      }
      const who = (await ctx.sh.run(["gh", "api", "user", "--jq", ".login"], { allowFail: true })).stdout.trim();
      return did ? { status: "done", note: did } : { status: "skipped", note: `logged in as ${who}` };
    },
  };
}

export function sshKeyStep(): Step {
  return {
    id: "ssh-key",
    title: "SSH key for GitHub",
    detail: ["ssh-keygen -t ed25519 if there's no key", "gh ssh-key add", "github.com host keys into ~/.ssh/known_hosts"],
    interactive: true,
    async run(ctx) {
      const dir = join(ctx.home, ".ssh");
      const key = join(dir, "id_ed25519");
      const label = `${ctx.user}@${hostname()}`;
      const done: string[] = [];
      if (!existsSync(`${key}.pub`)) {
        mkdirSync(dir, { recursive: true });
        chmodSync(dir, 0o700);
        process.stdout.write("Creating an SSH key. A passphrase is optional but recommended.\n");
        await ctx.sh.interactive(["ssh-keygen", "-t", "ed25519", "-C", ctx.answers.git.email || label, "-f", key]);
        done.push("created ~/.ssh/id_ed25519");
      }
      if (!(await canUse(ctx, "admin:public_key"))) {
        return {
          status: done.length ? "done" : "skipped",
          note: "gh isn't logged in with admin:public_key, so the key wasn't added to GitHub",
        };
      }

      const pub = readFileSync(`${key}.pub`, "utf8");
      const keys = JSON.parse(await ctx.sh.capture(["gh", "api", "user/keys"])) as { key: string }[];
      if (!keys.some((k) => sshKeyBody(k.key) === sshKeyBody(pub))) {
        await ctx.sh.run(["gh", "ssh-key", "add", `${key}.pub`, "--title", label]);
        done.push("added to GitHub");
      }
      // Trust GitHub's host keys from its API (over HTTPS) instead of on first connect.
      const known = join(dir, "known_hosts");
      if (!(await ctx.sh.ok(["ssh-keygen", "-F", HOST, "-f", known]))) {
        const meta = JSON.parse(await ctx.sh.capture(["gh", "api", "meta"])) as { ssh_keys: string[] };
        appendFileSync(known, `${knownHostsLines(meta.ssh_keys).join("\n")}\n`);
        done.push("added github.com to known_hosts");
      }
      return done.length ? { status: "done", note: done.join(", ") } : { status: "skipped", note: "key already on GitHub" };
    },
  };
}

export function gpgKeyStep(): Step {
  return {
    id: "gpg-key",
    title: "GPG key for signed commits",
    detail: ["reuse a signing key for the git email, or gpg --quick-generate-key", "gh gpg-key add", "sign commits and tags"],
    interactive: true,
    async run(ctx) {
      const git = ctx.answers.git;
      if (!git.name || !git.email) return { status: "skipped", note: "needs a git name and email first" };
      const list = async () =>
        parseGpgSecretKeys((await ctx.sh.run(["gpg", "--list-secret-keys", "--with-colons"], { allowFail: true })).stdout);
      const done: string[] = [];
      let hint = "";
      let key = pickSigningKey(await list(), git.email, git.signingKey);
      if (!key) {
        process.stdout.write(`Creating a GPG signing key for ${git.name} <${git.email}>. Pick a passphrase when asked.\n`);
        // pinentry needs to know the terminal.
        await ctx.sh.interactive([
          "sh",
          "-c",
          'GPG_TTY=$(tty) exec gpg --quick-generate-key "$1" ed25519 sign never',
          "-",
          `${git.name} <${git.email}>`,
        ]);
        key = pickSigningKey(await list(), git.email, "");
        if (!key) throw new Error("gpg didn't create a signing key");
        done.push(`created ${key.keyId}`);
      }
      if (git.signingKey !== key.keyId) {
        git.signingKey = key.keyId;
        const file = join(ctx.home, ".gitconfig");
        for (const [k, v] of [
          ["user.signingkey", key.keyId],
          ["commit.gpgsign", "true"],
          ["tag.gpgsign", "true"],
        ] as const) {
          await ctx.sh.run(["git", "config", "--file", file, k, v]);
        }
        done.push("commits and tags signed");
      }
      if (!(await canUse(ctx, "write:gpg_key"))) {
        hint = "not on GitHub yet: gh needs the write:gpg_key scope (rerun dotfiles with GitHub login on)";
      } else {
        const onGithub = JSON.parse(await ctx.sh.capture(["gh", "api", "user/gpg_keys"])) as { key_id: string }[];
        if (!onGithub.some((k) => k.key_id.toUpperCase() === key.keyId.toUpperCase())) {
          const armored = await ctx.sh.capture(["gpg", "--armor", "--export", key.fingerprint || key.keyId]);
          await withTempDir(async (tmp) => {
            const file = join(tmp, "key.asc");
            await Bun.write(file, `${armored}\n`);
            await ctx.sh.run(["gh", "gpg-key", "add", file, "--title", `${ctx.user}@${hostname()}`]);
          });
          done.push("added to GitHub");
        }
      }
      const note = [...done, hint].filter(Boolean).join("; ");
      return done.length ? { status: "done", note } : { status: "skipped", note: note || `signing with ${key.keyId}` };
    },
  };
}

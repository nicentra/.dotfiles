import { describe, expect, test } from "bun:test";
import { normalizeAnswers } from "../src/answers.ts";
import type { Step } from "../src/context.ts";
import {
  knownHostsLines,
  missingScopes,
  noreplyEmail,
  parseGpgSecretKeys,
  parseScopes,
  pickSigningKey,
  sshKeyBody,
} from "../src/github.ts";
import { type Reporter, runSteps } from "../src/runner.ts";
import { fakeCtx, platform } from "./helpers.ts";

const STATUS = `github.com
  ✓ Logged in to github.com account octo (/home/octo/.config/gh/hosts.yml)
  - Active account: true
  - Git operations protocol: ssh
  - Token: gho_************************************
  - Token scopes: 'admin:public_key', 'gist', 'read:org', 'repo'
`;

// gpg --list-secret-keys --with-colons, shortened to the fields the parser reads.
const GPG = [
  "sec:u:255:22:01E1A98B7F3D1A59:1700000000:::u:::scESC:::+:::ed25519:::0:",
  "fpr:::::::::ABCD0123ABCD0123ABCD012301E1A98B7F3D1A59:",
  "uid:u::::1700000000::A1B2::Octo Cat <Octo@Example.com>::::::::::0:",
  "ssb:u:255:18:BDDADBAC15F02F52:1700000000::::::e:::+:::cv25519::",
  "fpr:::::::::SUBKEYFINGERPRINT:",
  "sec:e:255:22:00000000DEADBEEF:1500000000:1600000000::u:::scESC:::+:::ed25519:::0:",
  "uid:e::::1500000000::C3D4::Octo Cat <octo@example.com>::::::::::0:",
  "sec:u:255:22:1111222233334444:1700000000:::u:::eE:::+:::ed25519:::0:",
  "uid:u::::1700000000::E5F6::Octo Cat <octo@example.com>::::::::::0:",
].join("\n");

describe("gh scopes", () => {
  test("parses the scopes line", () => {
    expect(parseScopes(STATUS)).toEqual(["admin:public_key", "gist", "read:org", "repo"]);
  });
  test("asks only for what's missing; admin covers write", () => {
    expect(missingScopes(parseScopes(STATUS), ["admin:public_key", "write:gpg_key"])).toEqual(["write:gpg_key"]);
    expect(missingScopes(["admin:gpg_key"], ["write:gpg_key"])).toEqual([]);
  });
});

describe("gpg keys", () => {
  const keys = parseGpgSecretKeys(GPG);
  test("parses primary keys with fingerprint, emails and whether they can sign", () => {
    expect(keys).toEqual([
      { keyId: "01E1A98B7F3D1A59", fingerprint: "ABCD0123ABCD0123ABCD012301E1A98B7F3D1A59", emails: ["octo@example.com"], canSign: true },
      { keyId: "00000000DEADBEEF", fingerprint: "", emails: ["octo@example.com"], canSign: false }, // expired
      { keyId: "1111222233334444", fingerprint: "", emails: ["octo@example.com"], canSign: false }, // encryption only
    ]);
  });
  test("picks the configured key, else a signing key for the email", () => {
    expect(pickSigningKey(keys, "octo@example.com", "")?.keyId).toBe("01E1A98B7F3D1A59");
    expect(pickSigningKey(keys, "OCTO@example.com", "7F3D1A59")?.keyId).toBe("01E1A98B7F3D1A59");
    expect(pickSigningKey(keys, "someone@else.com", "")).toBeUndefined();
    expect(pickSigningKey(keys, "octo@example.com", "00000000DEADBEEF")?.keyId).toBe("01E1A98B7F3D1A59"); // expired one is skipped
  });
});

describe("ssh and identity helpers", () => {
  test("compares keys without their comment", () => {
    expect(sshKeyBody("ssh-ed25519 AAAAC3Nza octo@laptop\n")).toBe("ssh-ed25519 AAAAC3Nza");
  });
  test("known_hosts lines are for github.com", () => {
    expect(knownHostsLines(["ssh-ed25519 AAAAC3"])).toEqual(["github.com ssh-ed25519 AAAAC3"]);
  });
  test("noreply email", () => {
    expect(noreplyEmail(583231, "octocat")).toBe("583231+octocat@users.noreply.github.com");
  });
});

describe("interactive steps", () => {
  test("are skipped without a terminal, with a hint", async () => {
    let ran = false;
    const step: Step = {
      id: "x",
      title: "X",
      detail: [],
      interactive: true,
      async run() {
        ran = true;
        return { status: "done" };
      },
    };
    const ctx = fakeCtx(platform("arch"), normalizeAnswers({}));
    const notes: string[] = [];
    const reporter: Reporter = {
      start() {},
      finish: (_i, _n, _s, r) => notes.push(r.note ?? ""),
      fail() {},
      note() {},
    };
    const summary = await runSteps(ctx, [step], reporter);
    expect(ran).toBe(false);
    expect(summary.skipped).toEqual([step]);
    expect(notes[0]).toContain("needs a terminal");
  });
});

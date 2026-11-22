import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { type Answers, presetAnswers } from "../src/answers.ts";
import type { Plan } from "../src/plan.ts";
import { Wizard, type WizardProps } from "../src/ui/Wizard.tsx";
import { platform } from "./helpers.ts";

const ENTER = "\r";
const DOWN = "\u001B[B";
const ESC = "\u001B";
const tick = () => new Promise((r) => setTimeout(r, 25));

const plan: Plan = {
  steps: [
    { id: "link", title: "Link dotfiles", detail: ["stow: shell git"], run: async () => ({ status: "done" }) },
    { id: "github-login", title: "GitHub CLI login", detail: [], interactive: true, run: async () => ({ status: "done" }) },
  ],
  notes: ["felix: no way to install it on Debian 13, skipped"],
};

function start(overrides: Partial<WizardProps> = {}) {
  let done: Answers | undefined | "pending" = "pending";
  const props: WizardProps = {
    platform: platform("arch"),
    initial: { ...presetAnswers("workstation"), git: { name: "Octo Cat", email: "octo@example.com", signingKey: "" } },
    tools: [
      { id: "fzf", label: "fzf: Fuzzy finder", how: "installed" },
      { id: "lazygit", label: "lazygit: Git TUI", how: "pacman" },
    ],
    node: { lts: "26.13.1", latest: "27.1.0" },
    preview: async () => plan,
    onDone: (a) => {
      done = a;
    },
    ...overrides,
  };
  const ui = render(<Wizard {...props} />);
  const press = async (...keys: string[]) => {
    for (const k of keys) {
      ui.stdin.write(k);
      await tick();
    }
  };
  /** Press Enter until the review screen shows. */
  const toReview = async () => {
    for (let i = 0; i < 30 && !ui.lastFrame()?.includes("Install now?"); i++) await press(ENTER);
  };
  return { ui, press, toReview, result: () => done, props };
}

describe("wizard", () => {
  test("Enter all the way keeps the starting answers", async () => {
    const w = start();
    await w.toReview();
    expect(w.ui.lastFrame()).toContain("Link dotfiles");
    expect(w.ui.lastFrame()).toContain("(asks you)");
    expect(w.ui.lastFrame()).toContain("note: felix");
    await w.press(ENTER); // ConfirmInput defaults to yes
    expect(w.result()).toEqual(w.props.initial);
  });

  test("picking Server starts from the server preset and keeps the identity", async () => {
    const w = start();
    await w.press(DOWN, ENTER);
    await w.toReview();
    await w.press(ENTER);
    const a = w.result() as Answers;
    expect(a.preset).toBe("server");
    expect(a.node.enabled).toBe(false);
    expect(a.git.name).toBe("Octo Cat");
  });

  test("deselecting a tool removes it", async () => {
    const w = start();
    for (let i = 0; i < 10 && !w.ui.lastFrame()?.includes("how each gets installed"); i++) await w.press(ENTER);
    await w.press(" ", ENTER); // the cursor starts on fzf
    await w.toReview();
    await w.press(ENTER);
    expect((w.result() as Answers).tools).not.toContain("fzf");
    expect((w.result() as Answers).tools).toContain("lazygit");
  });

  test("choosing not to install Node skips its packages screen", async () => {
    const w = start();
    for (let i = 0; i < 10 && !w.ui.lastFrame()?.includes("managed by pnpm"); i++) await w.press(ENTER);
    await w.press(DOWN, DOWN, ENTER); // LTS, Latest, Don't install
    expect(w.ui.lastFrame()).not.toContain("Global pnpm packages");
    expect(w.ui.lastFrame()).toContain("Python");
  });

  test("Esc goes back a screen", async () => {
    const w = start();
    await w.press(ENTER);
    expect(w.ui.lastFrame()).toContain("Shell");
    await w.press(ESC);
    expect(w.ui.lastFrame()).toContain("What is this machine?");
  });

  test("n on the review cancels", async () => {
    const w = start();
    await w.toReview();
    await w.press("n");
    expect(w.result()).toBeUndefined();
  });

  test("Arch extras only show on Arch", async () => {
    const w = start({ platform: platform("ubuntu2404") });
    const seen: string[] = [];
    for (let i = 0; i < 30 && !w.ui.lastFrame()?.includes("Install now?"); i++) {
      seen.push(w.ui.lastFrame() ?? "");
      await w.press(ENTER);
    }
    expect(seen.join("\n")).not.toContain("Arch extras");
  });
});

describe("mergeToolSelection", () => {
  test("keeps the order and the tools this platform doesn't offer", async () => {
    const { mergeToolSelection } = await import("../src/ui/choices.ts");
    expect(mergeToolSelection(["felix", "fzf", "bat"], ["fzf", "bat", "lazygit"], ["bat", "lazygit"])).toEqual(["felix", "bat", "lazygit"]);
  });
});

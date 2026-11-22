// The questions, one screen at a time. Every screen starts on the current
// answer, so Enter keeps it; Esc goes back; the last screen shows the plan.
import { ConfirmInput, MultiSelect, Select, Spinner, TextInput } from "@inkjs/ui";
import { Box, Text, useInput, useWindowSize } from "ink";
import { type ReactNode, useEffect, useState } from "react";
import { HARNESSES, KNOWN_SKILLS } from "../agents.ts";
import { type Answers, type Preset, presetAnswers } from "../answers.ts";
import type { Plan } from "../plan.ts";
import type { Platform } from "../platform.ts";
import { FONT, WINDOWS_APPS } from "../windows.ts";
import { mergeToolSelection, type NodeVersions, splitList, type ToolChoice } from "./choices.ts";

export interface WizardProps {
  platform: Platform;
  /** Where the answers start: the saved ones, or the workstation preset. */
  initial: Answers;
  /** Saved answers, offered as a starting point on the first screen. */
  saved?: Answers;
  tools: ToolChoice[];
  node: NodeVersions;
  preview(answers: Answers): Promise<Plan>;
  onDone(answers: Answers | undefined): void;
}

type Update = (a: Answers) => Answers;
interface ScreenProps {
  a: Answers;
  p: WizardProps;
  next(update?: Update): void;
  cancel(): void;
}
interface Screen {
  id: string;
  title: string;
  hint?: string;
  when?(a: Answers, p: WizardProps): boolean;
  render(s: ScreenProps): ReactNode;
}

type Option = { label: string; value: string };
/** Select starts on its first option and only reports a change, so put the current choice first. */
const currentFirst = (options: Option[], current: string) => [
  ...options.filter((o) => o.value === current),
  ...options.filter((o) => o.value !== current),
];

/** Toggles for boolean fields of one section of the answers. */
function toggles<K extends "shell" | "github" | "editors" | "extras">(
  section: K,
  options: { key: keyof Answers[K] & string; label: string }[],
): Screen["render"] {
  return ({ a, next }) => (
    <MultiSelect
      options={options.map((o) => ({ label: o.label, value: o.key }))}
      defaultValue={options.filter((o) => a[section][o.key]).map((o) => o.key)}
      onSubmit={(on) =>
        next((x) => ({ ...x, [section]: { ...x[section], ...Object.fromEntries(options.map((o) => [o.key, on.includes(o.key)])) } }))
      }
    />
  );
}

function listInput(get: (a: Answers) => string[], set: (a: Answers, v: string[]) => Answers, placeholder: string): Screen["render"] {
  return ({ a, next }) => (
    <TextInput defaultValue={get(a).join(" ")} placeholder={placeholder} onSubmit={(v) => next((x) => set(x, splitList(v)))} />
  );
}

const SCREENS: Screen[] = [
  {
    id: "preset",
    title: "What is this machine?",
    render: ({ a, p, next }) => (
      <Select
        options={currentFirst(
          [
            { label: "Workstation: shell, editors, CLI tools, Node, Python, bun, GitHub", value: "workstation" },
            { label: "Server: shell, git, vim and the core tools", value: "server" },
            ...(p.saved ? [{ label: "My saved answers", value: "saved" }] : []),
          ],
          p.saved ? "saved" : a.preset === "server" ? "server" : "workstation",
        )}
        onChange={(v) => next(() => (v === "saved" && p.saved ? p.saved : { ...presetAnswers(v as Preset), git: a.git }))}
      />
    ),
  },
  {
    id: "shell",
    title: "Shell",
    hint: "space toggles, enter continues",
    render: toggles("shell", [
      { key: "zsh", label: "zsh, with this repo's config" },
      { key: "ohMyZsh", label: "oh-my-zsh with autosuggestions and syntax highlighting" },
      { key: "starship", label: "starship prompt" },
      { key: "loginShell", label: "zsh as login shell" },
    ]),
  },
  {
    id: "git-name",
    title: "Git name",
    hint: "leave empty to take it from GitHub",
    render: ({ a, next }) => (
      <TextInput
        defaultValue={a.git.name}
        placeholder="Your Name"
        onSubmit={(v) => next((x) => ({ ...x, git: { ...x.git, name: v.trim() } }))}
      />
    ),
  },
  {
    id: "git-email",
    title: "Git email",
    hint: "leave empty to take it from GitHub",
    render: ({ a, next }) => (
      <TextInput
        defaultValue={a.git.email}
        placeholder="you@example.com"
        onSubmit={(v) => next((x) => ({ ...x, git: { ...x.git, email: v.trim() } }))}
      />
    ),
  },
  {
    id: "github",
    title: "GitHub",
    hint: "these ask for a browser login and key passphrases while installing",
    render: toggles("github", [
      { key: "login", label: "Log in with the GitHub CLI" },
      { key: "ssh", label: "SSH key, added to GitHub" },
      { key: "gpg", label: "GPG key for signed commits, added to GitHub" },
    ]),
  },
  {
    id: "editors",
    title: "Editors",
    render: toggles("editors", [
      { key: "vim", label: "vim, with a small vimrc" },
      { key: "neovim", label: "neovim, with this repo's config" },
    ]),
  },
  {
    id: "tools",
    title: "CLI tools",
    hint: "space toggles; how each gets installed here is in brackets",
    render: ({ a, p, next }) => (
      <MultiSelect
        visibleOptionCount={12}
        options={p.tools.map((t) => ({ label: `${t.label} [${t.how}]`, value: t.id }))}
        defaultValue={a.tools.filter((id) => p.tools.some((t) => t.id === id))}
        onSubmit={(on) =>
          next((x) => ({
            ...x,
            tools: mergeToolSelection(
              x.tools,
              p.tools.map((t) => t.id),
              on,
            ),
          }))
        }
      />
    ),
  },
  {
    id: "node",
    title: "Node.js (managed by pnpm)",
    render: ({ a, p, next }) => {
      const options: Option[] = [
        { label: `LTS${p.node.lts ? ` (v${p.node.lts})` : ""}`, value: "lts" },
        { label: `Latest${p.node.latest ? ` (v${p.node.latest})` : ""}`, value: "latest" },
        ...(["lts", "latest"].includes(a.node.version) ? [] : [{ label: `Keep ${a.node.version}`, value: a.node.version }]),
        { label: "Don't install Node", value: "none" },
      ];
      return (
        <Select
          options={currentFirst(options, a.node.enabled ? a.node.version : "none")}
          onChange={(v) => next((x) => ({ ...x, node: { ...x.node, enabled: v !== "none", version: v === "none" ? x.node.version : v } }))}
        />
      );
    },
  },
  {
    id: "node-globals",
    title: "Global pnpm packages",
    hint: "space-separated, may be empty",
    when: (a) => a.node.enabled,
    render: listInput(
      (a) => a.node.globals,
      (a, v) => ({ ...a, node: { ...a.node, globals: v } }),
      "e.g. tsx npm-check-updates",
    ),
  },
  {
    id: "python",
    title: "Python (managed by uv)",
    render: ({ a, next }) => {
      const options: Option[] = [
        { label: "Latest stable", value: "latest" },
        { label: "3.14", value: "3.14" },
        { label: "3.13", value: "3.13" },
        { label: "3.12", value: "3.12" },
        ...(["latest", "3.14", "3.13", "3.12"].includes(a.python.version) ? [] : [{ label: a.python.version, value: a.python.version }]),
        { label: "Don't install Python", value: "none" },
      ];
      return (
        <Select
          options={currentFirst(options, a.python.enabled ? a.python.version : "none")}
          onChange={(v) =>
            next((x) => ({ ...x, python: { ...x.python, enabled: v !== "none", version: v === "none" ? x.python.version : v } }))
          }
        />
      );
    },
  },
  {
    id: "python-freethreaded",
    title: "Use the free-threaded build (no GIL)?",
    hint: "y or n",
    when: (a) => a.python.enabled,
    render: ({ a, next }) => (
      <ConfirmInput
        defaultChoice={a.python.freethreaded ? "confirm" : "cancel"}
        onConfirm={() => next((x) => ({ ...x, python: { ...x.python, freethreaded: true } }))}
        onCancel={() => next((x) => ({ ...x, python: { ...x.python, freethreaded: false } }))}
      />
    ),
  },
  {
    id: "python-tools",
    title: "uv tools",
    hint: "space-separated, may be empty",
    when: (a) => a.python.enabled,
    render: listInput(
      (a) => a.python.tools,
      (a, v) => ({ ...a, python: { ...a.python, tools: v } }),
      "e.g. ruff",
    ),
  },
  {
    id: "bun",
    title: "bun (alongside pnpm, for non-Node work)",
    render: ({ a, next }) => (
      <Select
        options={currentFirst(
          [
            { label: "Install with bun's installer", value: "installer" },
            { label: "Install through pnpm (pnpm runtime set bun)", value: "pnpm" },
            { label: "Don't install bun", value: "none" },
          ],
          a.bun.enabled ? a.bun.via : "none",
        )}
        onChange={(v) =>
          next((x) => ({
            ...x,
            bun: { ...x.bun, enabled: v !== "none", via: v === "pnpm" ? "pnpm" : v === "none" ? x.bun.via : "installer" },
          }))
        }
      />
    ),
  },
  {
    id: "bun-globals",
    title: "Global bun packages",
    hint: "space-separated, may be empty",
    when: (a) => a.bun.enabled,
    render: listInput(
      (a) => a.bun.globals,
      (a, v) => ({ ...a, bun: { ...a.bun, globals: v } }),
      "e.g. @biomejs/biome",
    ),
  },
  {
    id: "extras",
    title: "Arch extras",
    when: (_a, p) => p.platform.family === "arch",
    render: toggles("extras", [{ key: "paru", label: "paru, an AUR helper" }]),
  },
  {
    id: "agents",
    title: "Agent harnesses",
    hint: "nothing is installed unless you pick it; space toggles",
    render: ({ a, next }) => (
      <MultiSelect
        options={HARNESSES.map((h) => ({ label: h.name, value: h.id }))}
        defaultValue={a.agents.harnesses}
        onSubmit={(on) => next((x) => ({ ...x, agents: { ...x.agents, harnesses: on } }))}
      />
    ),
  },
  {
    id: "agents-setup",
    title: "Agent setup",
    when: (a) => a.agents.harnesses.length > 0,
    render: ({ a, next }) => {
      const options = [
        { label: "The git-workflow rules as global instructions for each harness", value: "instructions" },
        ...(a.agents.harnesses.includes("claude")
          ? [{ label: "Claude Code settings from this repo (model, theme, vim mode)", value: "claudeSettings" }]
          : []),
      ];
      return (
        <MultiSelect
          options={options}
          defaultValue={options.filter((o) => a.agents[o.value as "instructions" | "claudeSettings"]).map((o) => o.value)}
          onSubmit={(on) =>
            next((x) => ({
              ...x,
              agents: {
                ...x.agents,
                instructions: on.includes("instructions"),
                claudeSettings: x.agents.harnesses.includes("claude") ? on.includes("claudeSettings") : x.agents.claudeSettings,
              },
            }))
          }
        />
      );
    },
  },
  {
    id: "skills",
    title: "Skills",
    hint: "linked for every harness you picked",
    when: (a) => a.agents.harnesses.length > 0,
    render: ({ a, next }) => {
      const known = [
        ...KNOWN_SKILLS,
        ...a.agents.skills.filter((id) => !KNOWN_SKILLS.some((k) => k.id === id)).map((id) => ({ id, label: id })),
      ];
      return (
        <MultiSelect
          options={known.map((k) => ({ label: k.label, value: k.id }))}
          defaultValue={a.agents.skills}
          onSubmit={(on) => next((x) => ({ ...x, agents: { ...x.agents, skills: on } }))}
        />
      );
    },
  },
  {
    id: "windows",
    title: "Windows (this WSL's host)",
    hint: "set up from here through WSL interop",
    when: (_a, p) => p.platform.wsl,
    render: ({ a, next }) => {
      const options = [
        { label: `${FONT.family}, for this user`, value: "font" },
        { label: "Windows Terminal: Catppuccin Mocha and that font as defaults", value: "terminal" },
        { label: "git config and identity for Git for Windows", value: "git" },
        ...(a.agents.harnesses.includes("claude")
          ? [{ label: "git-workflow skill and Claude Code settings on Windows", value: "claude" }]
          : []),
      ];
      type Key = "font" | "terminal" | "git" | "claude";
      return (
        <MultiSelect
          options={options}
          defaultValue={options.filter((o) => a.windows[o.value as Key]).map((o) => o.value)}
          onSubmit={(on) =>
            next((x) => ({
              ...x,
              windows: {
                ...x.windows,
                font: on.includes("font"),
                terminal: on.includes("terminal"),
                git: on.includes("git"),
                claude: x.agents.harnesses.includes("claude") ? on.includes("claude") : x.windows.claude,
              },
            }))
          }
        />
      );
    },
  },
  {
    id: "windows-apps",
    title: "Windows apps (winget)",
    hint: "space toggles; already installed ones are skipped",
    when: (_a, p) => p.platform.wsl,
    render: ({ a, next }) => (
      <MultiSelect
        options={WINDOWS_APPS.map((w) => ({ label: w.name, value: w.id }))}
        defaultValue={a.windows.apps}
        onSubmit={(on) => next((x) => ({ ...x, windows: { ...x.windows, apps: on } }))}
      />
    ),
  },
  {
    id: "review",
    title: "Ready to install",
    render: ({ a, p, next, cancel }) => <Review answers={a} preview={p.preview} onConfirm={() => next()} onCancel={cancel} />,
  },
];

/** Cut text to fit `width` columns. */
const fit = (text: string, width: number) => (text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text);

function Review({
  answers,
  preview,
  onConfirm,
  onCancel,
}: {
  answers: Answers;
  preview: WizardProps["preview"];
  onConfirm(): void;
  onCancel(): void;
}) {
  const [plan, setPlan] = useState<Plan | Error>();
  const { columns } = useWindowSize();
  useEffect(() => {
    preview(answers).then(setPlan, setPlan);
  }, [answers, preview]);
  if (!plan) return <Spinner label="Working out the steps" />;
  if (plan instanceof Error) return <Text color="red">Couldn't work out the steps: {plan.message}</Text>;
  return (
    <Box flexDirection="column">
      {plan.steps.map((s, i) => {
        const asks = s.interactive ? " (asks you)" : "";
        // padding (2) + "NN. " (4) + " · " (3), plus a column so the terminal never wraps
        const room = (columns || 100) - 10 - s.title.length - asks.length;
        return (
          <Text key={s.id}>
            <Text dimColor>{String(i + 1).padStart(2)}.</Text> {s.title}
            {asks ? <Text color="yellow">{asks}</Text> : null}
            {s.detail[0] && room > 10 ? <Text dimColor> · {fit(s.detail[0], room)}</Text> : null}
          </Text>
        );
      })}
      {plan.notes.map((n) => (
        <Text key={n} color="yellow">
          {fit(`note: ${n}`, (columns || 100) - 3)}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text>Install now? </Text>
        <ConfirmInput onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
    </Box>
  );
}

/** The screens that apply to these answers, in order. */
export function visibleScreens(a: Answers, p: WizardProps): Screen[] {
  return SCREENS.filter((s) => !s.when || s.when(a, p));
}

export function Wizard(p: WizardProps) {
  const [answers, setAnswers] = useState(p.initial);
  const [history, setHistory] = useState<string[]>(["preset"]);
  const current = history.at(-1) ?? "preset";
  const screens = visibleScreens(answers, p);
  const index = screens.findIndex((s) => s.id === current);
  const screen = screens[index];

  useInput((_input, key) => {
    if (key.escape && history.length > 1) setHistory((h) => h.slice(0, -1));
  });

  if (!screen) return null;
  const next = (update?: Update) => {
    const updated = update ? update(answers) : answers;
    setAnswers(updated);
    const following = visibleScreens(updated, p);
    const at = following.findIndex((s) => s.id === current);
    const nextScreen = following[at + 1];
    if (nextScreen) setHistory((h) => [...h, nextScreen.id]);
    else p.onDone(updated);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text bold>dotfiles</Text>
        <Text dimColor>
          {" "}
          · {p.platform.label} · {index + 1}/{screens.length}
        </Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">
          {screen.title}
        </Text>
        {screen.hint ? <Text dimColor>{screen.hint}</Text> : null}
      </Box>
      <Box marginTop={1} key={screen.id}>
        {screen.render({ a: answers, p, next, cancel: () => p.onDone(undefined) })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ move · space toggle · enter continue{history.length > 1 ? " · esc back" : ""} · ctrl+c quit</Text>
      </Box>
    </Box>
  );
}

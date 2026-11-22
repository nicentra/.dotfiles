import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadAnswers, mergeDeep, normalizeAnswers, presetAnswers, saveAnswers } from "../src/answers.ts";
import { TOOLS } from "../src/manifest.ts";
import { tmp } from "./helpers.ts";

describe("answers", () => {
  test("presets only name known tools", () => {
    for (const preset of ["workstation", "server"] as const) {
      for (const id of presetAnswers(preset).tools)
        expect(
          TOOLS.some((t) => t.id === id),
          id,
        ).toBe(true);
    }
  });

  test("agent harnesses are opt-in", () => {
    expect(presetAnswers("workstation").agents.harnesses).toEqual([]);
  });

  test("missing keys are filled from the preset", () => {
    const a = normalizeAnswers({ preset: "server", node: { enabled: true } });
    expect(a.node).toEqual({ enabled: true, version: "lts", globals: [] });
    expect(a.tools).toEqual(presetAnswers("server").tools);
  });

  test("lists replace the default instead of merging", () => {
    expect(mergeDeep({ tools: ["a", "b"] }, { tools: ["c"] })).toEqual({ tools: ["c"] });
  });

  test("wrong types are rejected with the path", () => {
    expect(() => normalizeAnswers({ node: { enabled: "yes" } })).toThrow("answers.node.enabled must be a boolean");
    expect(() => normalizeAnswers({ tools: "fzf" })).toThrow("answers.tools must be a list of strings");
    expect(() => normalizeAnswers({ preset: "laptop" })).toThrow('unknown preset "laptop"');
  });

  test("round-trips through the file", () => {
    const path = join(tmp(), "answers.json");
    const a = presetAnswers("workstation");
    saveAnswers(path, a);
    expect(loadAnswers(path)).toEqual(a);
  });
});

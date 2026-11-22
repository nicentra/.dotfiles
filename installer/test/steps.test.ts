import { describe, expect, test } from "bun:test";
import { pickNodeVersion, pickPythonMinor } from "../src/steps.ts";

describe("pickNodeVersion", () => {
  const index = [
    { version: "v27.0.0-alpha.0.1.1", lts: false as const },
    { version: "v27.1.0", lts: false as const },
    { version: "v26.13.1", lts: "Lithium" },
    { version: "v26.12.1", lts: "Lithium" },
    { version: "v24.11.0", lts: "Krypton" },
  ];
  test("lts is the newest release with an LTS name", () => expect(pickNodeVersion(index, "lts")).toBe("26.13.1"));
  test("latest skips prereleases", () => expect(pickNodeVersion(index, "latest")).toBe("27.1.0"));
  test("a major picks its newest release", () => expect(pickNodeVersion(index, "24")).toBe("24.11.0"));
  test("an exact version is matched exactly", () => expect(pickNodeVersion(index, "26.12.1")).toBe("26.12.1"));
  test("a version that doesn't exist fails", () => expect(() => pickNodeVersion(index, "19")).toThrow('No Node.js release matches "19"'));
});

describe("pickPythonMinor", () => {
  const list = [
    { implementation: "cpython", version: "3.16.0a2", variant: "default" },
    { implementation: "cpython", version: "3.15.2", variant: "freethreaded" },
    { implementation: "cpython", version: "3.15.2", variant: "default" },
    { implementation: "cpython", version: "3.14.10", variant: "default" },
    { implementation: "pypy", version: "3.17.0", variant: "default" },
  ];
  test("latest is the newest stable CPython minor", () => expect(pickPythonMinor(list, "latest")).toBe("3.15"));
  test("a given version is used as is", () => expect(pickPythonMinor(list, "3.14")).toBe("3.14"));
});

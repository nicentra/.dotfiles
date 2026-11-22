import { describe, expect, test } from "bun:test";
import { compareVersions, parseOsRelease, platformFromOsRelease } from "../src/platform.ts";
import { OS_RELEASE, platform } from "./helpers.ts";

describe("os-release", () => {
  test("parses quoted and unquoted values", () => {
    expect(parseOsRelease(OS_RELEASE.ubuntu2404)).toMatchObject({ ID: "ubuntu", ID_LIKE: "debian", VERSION_ID: "24.04", NAME: "Ubuntu" });
  });

  test("maps distros to package-manager families", () => {
    expect(platform("arch")).toMatchObject({ family: "arch", id: "arch", version: "", label: "Arch" });
    expect(platform("debian13")).toMatchObject({ family: "debian", id: "debian", version: "13", label: "Debian 13" });
    expect(platform("ubuntu2404")).toMatchObject({ family: "debian", id: "ubuntu", version: "24.04" });
  });

  test("labels WSL", () => {
    expect(platformFromOsRelease(OS_RELEASE.arch, "x64", true).label).toBe("Arch (WSL)");
  });

  test("rejects other distros", () => {
    expect(() => platformFromOsRelease('ID=fedora\nPRETTY_NAME="Fedora Linux 43"\n', "x64", false)).toThrow(
      /Unsupported Linux distribution "Fedora Linux 43"/,
    );
  });
});

describe("compareVersions", () => {
  test.each([
    ["0.10.4", "0.9.5", 1],
    ["0.44.1-1ubuntu0.3", "0.48", -1],
    ["1:2.47.3-0+deb13u1", "2.47", 1],
    ["v0.12.6", "0.10", 1],
    ["8.16.0", "8.19", -1],
    ["3.15", "3.15.0", 0],
  ])("%s vs %s", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

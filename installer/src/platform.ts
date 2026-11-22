// Which machine the installer runs on: OS, distro, CPU, WSL.
import { existsSync, readFileSync } from "node:fs";

/** Package-manager family. Ubuntu counts as debian. */
export type Family = "arch" | "debian" | "windows";
export type Arch = "x64" | "arm64";

export interface Platform {
  os: "linux" | "windows";
  /** os-release ID: arch, debian, ubuntu; or windows. */
  id: string;
  family: Family;
  /** os-release VERSION_ID, e.g. "13" or "24.04". Empty on Arch. */
  version: string;
  arch: Arch;
  wsl: boolean;
  /** For display: "Ubuntu 24.04 (WSL)". */
  label: string;
}

export const SUPPORTED = ["arch", "debian 13", "ubuntu 24.04", "ubuntu 26.04", "windows"];

/** Parse /etc/os-release (KEY=value lines, values optionally quoted). */
export function parseOsRelease(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2]!.trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[m[1]!] = value;
  }
  return out;
}

export function familyOf(id: string, idLike = ""): Family | undefined {
  const ids = [id, ...idLike.split(/\s+/)];
  if (ids.includes("arch")) return "arch";
  if (ids.includes("debian") || ids.includes("ubuntu")) return "debian";
  return undefined;
}

export function platformFromOsRelease(osRelease: string, arch: Arch, wsl: boolean): Platform {
  const r = parseOsRelease(osRelease);
  const id = r.ID ?? "linux";
  const family = familyOf(id, r.ID_LIKE);
  if (!family) {
    throw new Error(`Unsupported Linux distribution "${r.PRETTY_NAME ?? id}". Supported: ${SUPPORTED.join(", ")}.`);
  }
  const name = r.NAME?.replace(/ (GNU\/)?Linux$/, "") ?? id;
  const version = r.VERSION_ID ?? "";
  return {
    os: "linux",
    id,
    family,
    version,
    arch,
    wsl,
    label: `${name}${version ? ` ${version}` : ""}${wsl ? " (WSL)" : ""}`,
  };
}

export function detectArch(): Arch {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  throw new Error(`Unsupported CPU architecture "${process.arch}". Supported: x64, arm64.`);
}

export function detectPlatform(): Platform {
  const arch = detectArch();
  if (process.platform === "win32") {
    return { os: "windows", id: "windows", family: "windows", version: "", arch, wsl: false, label: "Windows" };
  }
  if (process.platform !== "linux") {
    throw new Error(`Unsupported OS "${process.platform}". Supported: ${SUPPORTED.join(", ")}.`);
  }
  const osRelease = existsSync("/etc/os-release") ? readFileSync("/etc/os-release", "utf8") : "";
  const wsl =
    Boolean(process.env.WSL_DISTRO_NAME) ||
    (existsSync("/proc/version") && /microsoft/i.test(readFileSync("/proc/version", "utf8")));
  return platformFromOsRelease(osRelease, arch, wsl);
}

/** Compare dotted versions numerically ("0.10.4" > "0.9.5"). Ignores Debian epochs and revisions. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^\d+:/, "") // epoch
      .replace(/[-+~].*$/, "") // debian revision, build suffix
      .replace(/^v/, "")
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

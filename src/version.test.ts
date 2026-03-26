import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf-8");

describe("version consistency", () => {
  it("VERSION is a valid semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("VERSION is >= 1.0.0", () => {
    const major = parseInt(VERSION.split(".")[0], 10);
    expect(major).toBeGreaterThanOrEqual(1);
  });

  it("VERSION matches package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  it("CHANGELOG mentions the current version", () => {
    expect(changelog).toContain(`[${pkg.version}]`);
  });

  it("--version flag prints the version", () => {
    const out = execFileSync("node", [join(root, "dist/index.js"), "--version"], {
      encoding: "utf-8",
    }).trim();
    expect(out).toContain(pkg.version);
  });
});

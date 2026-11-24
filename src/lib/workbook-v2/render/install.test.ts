import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../hash";
import { installTypst } from "./install";
import { PINS, type Pins } from "./pins";
import { typstProgram } from "./typst";

const TARGET = "x86_64-unknown-linux-musl";
let folder = "";
let archive: Uint8Array = new Uint8Array();
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "typst-install-test-"));
  mkdirSync(join(folder, `typst-${TARGET}`));
  writeFileSync(join(folder, `typst-${TARGET}`, "typst"), "a program");
  execFileSync("tar", ["-cJf", join(folder, "a.tar.xz"), "-C", folder, `typst-${TARGET}`]);
  archive = readFileSync(join(folder, "a.tar.xz"));
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

const pins = (change: Partial<Pins["targets"][string]> = {}): Pins => ({
  ...PINS, targets: { [TARGET]: { archiveSha256: sha256(archive), programSha256: sha256("a program"), ...change } },
});
const install = (p: Pins, download: (url: string) => Promise<Uint8Array> = async () => archive) =>
  installTypst({ home: join(folder, "home"), target: TARGET, pins: p, download });
const program = () => typstProgram(join(folder, "home"), TARGET, PINS.version);

describe("the install script", () => {
  it("fetches the pinned archive and leaves a program that runs", async () => {
    const asked: string[] = [];
    const path = await install(pins(), async (url) => { asked.push(url); return archive; });
    expect(asked).toEqual([`https://github.com/typst/typst/releases/download/v${PINS.version}/typst-${TARGET}.tar.xz`]);
    expect(path).toBe(program());
    expect(readFileSync(path, "utf8")).toBe("a program");
    expect(statSync(path).mode & 0o111).not.toBe(0);
    expect(readdirSync(join(path, ".."))).toEqual(["typst"]);
  });

  it("fetches once", async () => {
    await install(pins());
    await install(pins(), () => Promise.reject(new Error("fetched again")));
    expect(existsSync(program())).toBe(true);
  });

  it.each([0o644, 0o400, 0o611])("gives the program its permission to run back, with no fetch, when it has mode %o", async (mode) => {
    await install(pins());
    chmodSync(program(), mode);
    await install(pins(), () => Promise.reject(new Error("fetched again")));
    expect(statSync(program()).mode & 0o777).toBe(0o755);
    expect(readFileSync(program(), "utf8")).toBe("a program");
  });

  it("fetches again when the program has other bytes", async () => {
    await install(pins());
    chmodSync(program(), 0o755);
    writeFileSync(program(), "changed");
    await install(pins());
    expect(readFileSync(program(), "utf8")).toBe("a program");
  });

  it.each<[string, () => Pins, RegExp]>([
    ["an archive with another hash", () => pins({ archiveSha256: "0".repeat(64) }), /The archive .* is not the pinned file/],
    ["a program with another hash", () => pins({ programSha256: "0".repeat(64) }), /The program in .* is not the pinned Typst/],
    ["a computer with no pin", () => ({ ...PINS, targets: {} }), /no pinned Typst for x86_64-unknown-linux-musl/],
  ])("refuses %s and installs nothing", async (_name, bad, message) => {
    await expect(install(bad())).rejects.toThrow(message);
    expect(existsSync(program())).toBe(false);
  });

  it("has an exact version and two hashes for each computer it knows", () => {
    expect(PINS.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(PINS.targets).sort()).toEqual(["aarch64-apple-darwin", "aarch64-unknown-linux-musl", "x86_64-apple-darwin", "x86_64-unknown-linux-musl"]);
    const hashes = Object.values(PINS.targets).flatMap((t) => [t.archiveSha256, t.programSha256]);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBe(8);
  });
});

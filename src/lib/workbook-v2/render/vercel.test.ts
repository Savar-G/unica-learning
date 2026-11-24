import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../hash";
import { PINS, type Pins } from "./pins";
import { openRenderer } from "./typst";
import { VERCEL_TYPST_TARGET, bundledTypstRelPath, stageBundledTypst, vercelAssets, workbookV2TraceFiles } from "./vercel";

describe("the assets in a Vercel function", () => {
  it("points vercelAssets at the pinned linux x64 bundle path with copyIfNotExecutable enabled", () => {
    const assets = vercelAssets("/var/task");
    expect(assets).toEqual({
      program: `/var/task/.workbook-v2/typst/${PINS.version}/x86_64-unknown-linux-musl/typst`,
      target: VERCEL_TYPST_TARGET,
      fontsDir: "/var/task/src/lib/workbook-v2/render/fonts",
      template: "/var/task/src/lib/workbook-v2/render/page.typ",
      copyIfNotExecutable: true,
    });
    expect(VERCEL_TYPST_TARGET).toBe("x86_64-unknown-linux-musl");
    expect(bundledTypstRelPath()).toBe(`.workbook-v2/typst/${PINS.version}/x86_64-unknown-linux-musl/typst`);
  });

  it("lists the linux x64 program, the drawing file, the fonts and the licences for the bundle, and nothing else", () => {
    expect(workbookV2TraceFiles()).toEqual([
      `./${bundledTypstRelPath()}`, "./src/lib/workbook-v2/render/page.typ", "./src/lib/workbook-v2/render/fonts/**",
      "./THIRD_PARTY_NOTICES.md", "./node_modules/qrcode/license", "./node_modules/jsqr/LICENSE",
    ]);
  });
});

describe("stageBundledTypst", () => {
  let folder = "";
  let archive: Uint8Array = new Uint8Array();
  const payload = "#!/bin/sh\necho fake-linux-typst\n";

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "typst-stage-test-"));
    mkdirSync(join(folder, `typst-${VERCEL_TYPST_TARGET}`));
    writeFileSync(join(folder, `typst-${VERCEL_TYPST_TARGET}`, "typst"), payload);
    execFileSync("tar", ["-cJf", join(folder, "a.tar.xz"), "-C", folder, `typst-${VERCEL_TYPST_TARGET}`]);
    archive = readFileSync(join(folder, "a.tar.xz"));
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  const fakePins = (change: Partial<Pins["targets"][string]> = {}): Pins => ({
    ...PINS,
    targets: { [VERCEL_TYPST_TARGET]: { archiveSha256: sha256(archive), programSha256: sha256(payload), ...change } },
  });

  it("installs through installTypst, stages the verified linux x64 binary with 0755, reuses it, and refuses another binary", async () => {
    const root = join(folder, "repo");
    const home = join(folder, "home");
    mkdirSync(root, { recursive: true });
    let fetches = 0;
    const download = async () => { fetches += 1; return archive; };

    const first = await stageBundledTypst({ root, home, pins: fakePins(), download });
    const expectedPath = vercelAssets(root, fakePins()).program;
    expect(first).toEqual({ path: expectedPath, bytes: Buffer.byteLength(payload), reused: false });
    expect(fetches).toBe(1);
    expect(statSync(expectedPath).mode & 0o777).toBe(0o755);
    expect(readFileSync(expectedPath, "utf8")).toBe(payload);

    // Second run reuses staged file with no download.
    const second = await stageBundledTypst({ root, home, pins: fakePins(), download: async () => { throw new Error("fetched again"); } });
    expect(second).toEqual({ path: expectedPath, bytes: Buffer.byteLength(payload), reused: true });

    // Restores execute bit if stripped.
    chmodSync(expectedPath, 0o644);
    await stageBundledTypst({ root, home, pins: fakePins(), download: async () => { throw new Error("fetched again"); } });
    expect(statSync(expectedPath).mode & 0o777).toBe(0o755);

    // Replaces tampered staged binary from verified cache.
    writeFileSync(expectedPath, "tampered");
    const repaired = await stageBundledTypst({ root, home, pins: fakePins(), download: async () => { throw new Error("fetched again"); } });
    expect(repaired.reused).toBe(false);
    expect(readFileSync(expectedPath, "utf8")).toBe(payload);

    // openRenderer with real PINS refuses a binary whose SHA-256 is not the pinned linux x64 Typst.
    const assets = vercelAssets(root);
    await expect(openRenderer({ ...assets, fontsDir: join(process.cwd(), "src/lib/workbook-v2/render/fonts"), template: join(process.cwd(), "src/lib/workbook-v2/render/page.typ") }, PINS))
      .rejects.toThrow(/is not the pinned Typst 0\.15\.1 for x86_64-unknown-linux-musl/);
  });

  it("refuses a bad archive or program hash and leaves nothing staged", async () => {
    const root = join(folder, "bad-repo");
    const home = join(folder, "bad-home");
    mkdirSync(root, { recursive: true });
    const download = async () => archive;
    await expect(stageBundledTypst({ root, home, pins: fakePins({ archiveSha256: "0".repeat(64) }), download })).rejects.toThrow(/is not the pinned file/);
    expect(existsSync(vercelAssets(root).program)).toBe(false);
    await expect(stageBundledTypst({ root, home, pins: fakePins({ programSha256: "0".repeat(64) }), download })).rejects.toThrow(/is not the pinned Typst/);
    expect(existsSync(vercelAssets(root).program)).toBe(false);
  });
});

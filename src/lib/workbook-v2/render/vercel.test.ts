import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../hash";
import { PINS, type Pins } from "./pins";
import { openRenderer } from "./typst";
import {
  VERCEL_TYPST_TARGET,
  WORKBOOK_V2_ROUTES,
  bundledTypstRelPath,
  planTypstStage,
  runTypstStage,
  stageBundledTypst,
  vercelAssets,
  workbookV2TraceFiles,
  workbookV2TracingIncludes,
  type StagePlan,
  type WorkbookV2Route,
} from "./vercel";

describe("Vercel W1 assets and file tracing", () => {
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

  it("traces zero routes when no production route builds a v2 book", () => {
    expect(WORKBOOK_V2_ROUTES).toEqual([]);
    expect(workbookV2TracingIncludes([])).toEqual({});
  });

  it("escapes dynamic route brackets and traces only W1 linux x64 assets and licence files", () => {
    const includes = workbookV2TracingIncludes(["/api/v2-probe", "/api/workbooks/[id]/build"]);
    const expectedFiles = [...workbookV2TraceFiles()];
    expect(Object.keys(includes)).toEqual(["/api/v2-probe", "/api/workbooks/\\[id\\]/build"]);
    expect(includes["/api/v2-probe"]).toEqual(expectedFiles);
    expect(includes["/api/workbooks/\\[id\\]/build"]).toEqual(expectedFiles);
    expect(expectedFiles).toContain(`./.workbook-v2/typst/${PINS.version}/x86_64-unknown-linux-musl/typst`);
    expect(expectedFiles).toContain("./src/lib/workbook-v2/render/page.typ");
    expect(expectedFiles).toContain("./src/lib/workbook-v2/render/fonts/**");
    expect(expectedFiles).toContain("./THIRD_PARTY_NOTICES.md");
    expect(expectedFiles.some((f) => f.includes("chromium") || f.includes("darwin") || f.includes("sharp"))).toBe(false);
  });
});

describe("build staging plan (V6)", () => {
  const none: readonly WorkbookV2Route[] = [];
  const previewOnly: readonly WorkbookV2Route[] = [{ route: "/api/v2-probe", scope: "preview" }];
  const prodRoute: readonly WorkbookV2Route[] = [{ route: "/api/workbooks/[id]/build", scope: "production" }];

  it.each<[string, { routes: readonly WorkbookV2Route[]; vercelEnv?: string; force?: boolean }, Pick<StagePlan, "action"> & { required?: boolean }]>([
    ["production with no routes skips", { routes: none, vercelEnv: "production" }, { action: "skip" }],
    ["production with preview-only route skips", { routes: previewOnly, vercelEnv: "production" }, { action: "skip" }],
    ["production with no routes and force stages non-fatally", { routes: none, vercelEnv: "production", force: true }, { action: "stage", required: false }],
    ["production with a production route stages fatally", { routes: prodRoute, vercelEnv: "production" }, { action: "stage", required: true }],
    ["preview with a preview route stages fatally", { routes: previewOnly, vercelEnv: "preview" }, { action: "stage", required: true }],
    ["preview with a production route stages fatally", { routes: prodRoute, vercelEnv: "preview" }, { action: "stage", required: true }],
    ["preview with no routes skips", { routes: none, vercelEnv: "preview" }, { action: "skip" }],
    ["preview with no routes and force stages non-fatally", { routes: none, vercelEnv: "preview", force: true }, { action: "stage", required: false }],
    ["local build with no routes skips", { routes: none }, { action: "skip" }],
    ["local build with routes stages non-fatally", { routes: previewOnly }, { action: "stage", required: false }],
    ["local explicit force stages fatally", { routes: none, force: true }, { action: "stage", required: true }],
  ])("%s", (_name, input, expected) => {
    const plan = planTypstStage(input);
    expect(plan.action).toBe(expected.action);
    if (plan.action === "stage") expect(plan.required).toBe(expected.required);
  });

  it("never breaks a non-required build when the Typst download fails, and rethrows when required", async () => {
    const boom = async () => { throw new Error("network down"); };
    const skipped = await runTypstStage({ plan: { action: "skip", reason: "none" }, stage: boom });
    expect(skipped).toEqual({ status: "skipped", reason: "none" });

    const warned = await runTypstStage({ plan: { action: "stage", required: false, reason: "optional" }, stage: boom });
    expect(warned).toEqual({ status: "warned", message: "network down" });

    await expect(runTypstStage({ plan: { action: "stage", required: true, reason: "needed" }, stage: boom })).rejects.toThrow("network down");
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

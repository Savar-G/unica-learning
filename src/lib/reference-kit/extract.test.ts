import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  importReferenceRecords,
  type ExistingReferenceRow,
  type ReferenceRow,
  type ReferenceStore,
} from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";
import { extractFolder } from "./extract";
import { PHOTOS_MANIFEST_FILE, preparePhoto } from "./prepare";
import type { RunCli } from "./read";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function makePhotoBytes(width: number, height: number, seed: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: (seed * 37) % 256,
        g: (seed * 73) % 256,
        b: (seed * 113) % 256,
      },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

function makeReaderPayload(sheet: string, overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "page",
    level: "M",
    sheet,
    topic: { title: "Adding Two-Digit Numbers", number: 1 },
    sections: [
      {
        instruction: "Add the numbers.",
        scaffolds: [
          { kind: "other", applies_to: [1], description: "Dotted carry column" },
        ],
        items: [
          {
            n: 1,
            printed: "12 + 5 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [12, 5] },
            responses: [
              { position: "after_equals", cue: null, answer: "17", answer_source: "reader" },
            ],
          },
        ],
      },
    ],
    examples: [
      {
        position: "top",
        relation: "sequence",
        label: "Example",
        parts: [
          {
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [10, 5] },
            shown_answer: "15",
          },
        ],
        steps: [
          { n: 1, shows: "other", shows_other: "count on from ten", printed: "10 + 5 = 15" },
        ],
        marks: [
          { kind: "other", step: 1, description: "Curved jump arc" },
        ],
      },
    ],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
    ...overrides,
  };
}

function workDirHasDigestReading(workDir: string, sha256: string): boolean {
  const shortPrefix = sha256.slice(0, 12);
  for (const sub of ["reader-a", "reader-b"]) {
    const dir = join(workDir, sub);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name === "reader.json") continue;
      const content = readFileSync(join(dir, name), "utf8");
      if (content.includes(sha256) || name.startsWith(shortPrefix)) {
        return true;
      }
    }
  }
  return false;
}

class MemoryImportStore implements ReferenceStore {
  rows = new Map<string, ReferenceRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
    const out = new Map<string, ExistingReferenceRow>();
    for (const ref of sourceRefs) {
      const row = this.rows.get(ref);
      if (row) {
        out.set(ref, {
          transcript: structuredClone(row.transcript),
          path: row.path,
          transcript_status: row.transcript_status,
        });
      }
    }
    return out;
  }

  async insertRow(row: ReferenceRow): Promise<boolean> {
    if (this.rows.has(row.source_ref)) return false;
    this.rows.set(row.source_ref, structuredClone(row));
    return true;
  }

  async objectSha256(path: string): Promise<string | null> {
    const existing = this.objects.get(path);
    return existing ? createHash("sha256").update(existing.bytes).digest("hex") : null;
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async replaceObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async refsByPath(paths: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const row of this.rows.values()) {
      if (row.path !== null && paths.includes(row.path)) {
        out.set(row.path, [...(out.get(row.path) ?? []), row.source_ref]);
      }
    }
    return out;
  }

  async updateRow(row: ReferenceRow): Promise<boolean> {
    const prev = this.rows.get(row.source_ref);
    if (!prev) return false;
    this.rows.set(row.source_ref, { ...structuredClone(row), note: prev.note });
    return true;
  }
}

describe("extractFolder (reference:extract)", () => {
  it("runs reader a (codex) and reader b (claude) in parallel with full isolation, never leaks original filenames, compares, and outputs import-ready folders", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img1 = await makePhotoBytes(1800, 1200, 1);
    const img2Small = await makePhotoBytes(800, 600, 2);
    const img3 = await makePhotoBytes(1600, 1200, 3);
    const prep1 = await preparePhoto(img1);
    const prep3 = await preparePhoto(img3);

    writeFileSync(join(photosDir, "IMG_0001_PrivateName.jpg"), img1);
    writeFileSync(join(photosDir, "IMG_0002_Small.jpg"), img2Small);
    writeFileSync(join(photosDir, "IMG_0003_Corrupt.jpg"), Buffer.from("not-a-valid-image"));
    writeFileSync(join(photosDir, "IMG_0004_Second.jpg"), img3);
    // Subdirectory should be ignored (not recursive)
    mkdirSync(join(photosDir, "nested"));
    writeFileSync(join(photosDir, "nested", "IMG_9999.jpg"), img1);

    // Track concurrency and isolation: hold reader B until reader A resolves on photo 1,
    // verifying neither reading is written to disk until BOTH finish!
    let inFlight = 0;
    let maxConcurrent = 0;
    const seenCalls: Array<{
      cmd: string;
      args: string[];
      cwd: string;
      cwdFiles: string[];
      stdin?: string;
    }> = [];

    const fakeCli: RunCli = async (cmd, args, opts) => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      const cwdReal = realpathSync(opts.cwd);
      const cwdFiles = readdirSync(cwdReal);
      seenCalls.push({ cmd, args, cwd: cwdReal, cwdFiles, stdin: opts.stdin });

      // Never pass original filenames into CLI args or prompt
      const combinedArgs = `${args.join(" ")} ${opts.stdin ?? ""}`;
      expect(combinedArgs).not.toContain("IMG_0001_PrivateName");
      expect(combinedArgs).not.toContain("IMG_0004_Second");
      expect(cwdFiles).toEqual(["page.jpg"]);

      const stagedBytes = readFileSync(join(cwdReal, "page.jpg"));
      const stagedHash = createHash("sha256").update(stagedBytes).digest("hex");

      // While either call is in flight, no reading of that digest may exist in outDir
      expect(workDirHasDigestReading(outDir, stagedHash)).toBe(false);

      // Delay claude slightly so codex finishes first while claude is still in flight
      if (cmd === "claude") {
        await new Promise((r) => setTimeout(r, 40));
        expect(workDirHasDigestReading(outDir, stagedHash)).toBe(false);
      } else {
        await new Promise((r) => setTimeout(r, 10));
      }

      inFlight -= 1;

      if (stagedHash === prep1.sha256) {
        return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
      }
      if (stagedHash === prep3.sha256) {
        if (cmd === "claude") {
          return { code: 124, stdout: "", stderr: "CLI timed out" };
        }
        return { code: 0, stdout: JSON.stringify(makeReaderPayload("4a")), stderr: "" };
      }
      throw new Error(`Unexpected photo hash ${stagedHash}`);
    };

    const progressLines: string[] = [];
    const result = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      runCli: fakeCli,
      onProgress: (line) => progressLines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(result.preparedCount).toBe(2);
    expect(maxConcurrent).toBe(2);
    // Two distinct temp directories were used for reader A and reader B
    expect(seenCalls[0].cwd).not.toBe(seenCalls[1].cwd);
    expect(seenCalls.map((c) => c.cmd).sort()).toEqual(["claude", "claude", "codex", "codex"]);

    // Progress lines printed for every photo in sorted order
    expect(progressLines).toHaveLength(4);
    expect(progressLines[0]).toContain("[1/4] IMG_0001_PrivateName.jpg: a ok, b ok -> sample:M:3a");
    expect(progressLines[1]).toContain("[2/4] IMG_0002_Small.jpg: too_small (800x600)");
    expect(progressLines[2]).toContain("[3/4] IMG_0003_Corrupt.jpg: unreadable_image");
    expect(progressLines[3]).toContain("[4/4] IMG_0004_Second.jpg: a ok, b cli_error -> sample:M:4a");

    // Summary counts
    expect(result.counts).toEqual({
      double_read: 1,
      machine_read: 1,
      failed: 1,
      too_small: 1,
    });

    // final/ holds ONLY record JSONs, status.json, and report.json
    const finalJsonFiles = readdirSync(join(outDir, "final"))
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect(finalJsonFiles).toEqual([
      "report.json",
      "sample-M-3a.json",
      "sample-M-4a.json",
      "status.json",
    ]);

    // Check report.md sections
    const reportMd = readFileSync(join(outDir, "final", "report.md"), "utf8");
    expect(reportMd).toContain("## Too small to read");
    expect(reportMd).toContain("IMG_0002_Small.jpg");
    expect(reportMd).toContain("800 x 600");
    expect(reportMd).toContain("## Could not be read");
    expect(reportMd).toContain("IMG_0003_Corrupt.jpg");
    expect(reportMd).toContain("## Unnamed teaching marks");
    expect(reportMd).toContain("count on from ten");
    expect(reportMd).toContain("Curved jump arc");
    expect(reportMd).toContain("Dotted carry column");
    expect(reportMd).toContain("IMG_0001_PrivateName.jpg");
    expect(reportMd).toContain("IMG_0004_Second.jpg");

    // Verify permissions
    expect(statSync(join(outDir, "photos", PHOTOS_MANIFEST_FILE)).mode & 0o777).toBe(0o600);

    // End-to-end compatibility with reference:import (--records <out>/final --photos <out>/photos)
    const store = new MemoryImportStore();
    const imported = await importReferenceRecords({
      recordsDir: join(outDir, "final"),
      photosDir: join(outDir, "photos"),
      store,
    });
    expect(imported.ok).toBe(true);
    expect(imported.counts).toEqual({
      recordsRead: 2,
      inserted: 2,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 2,
    });
    expect(store.rows.get("sample:M:3a")).toMatchObject({
      path: "sample/M/3a.jpg",
      transcript_status: "double_read",
    });
    expect(store.rows.get("sample:M:4a")).toMatchObject({
      path: "sample/M/4a.jpg",
      transcript_status: "machine_read",
    });
  });

  it("resumes by skipping cached digests without --force, and with --force deletes old readings and final record before re-reading", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-res-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-res-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-res-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img = await makePhotoBytes(1600, 1200, 7);
    const prep = await preparePhoto(img);
    writeFileSync(join(photosDir, "IMG_0001.jpg"), img);

    let callCount = 0;
    const fakeCli: RunCli = async () => {
      callCount += 1;
      return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
    };

    const first = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      runCli: fakeCli,
    });
    expect(first.exitCode).toBe(0);
    expect(callCount).toBe(2);

    // Second run without --force skips both reads
    callCount = 0;
    const resumed = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      runCli: fakeCli,
    });
    expect(resumed.exitCode).toBe(0);
    expect(callCount).toBe(0);

    // Third run WITH --force deletes old readings and old final record BEFORE calling RunCli
    let sawCleanDuringForce = true;
    const forceCli: RunCli = async () => {
      callCount += 1;
      if (workDirHasDigestReading(outDir, prep.sha256)) {
        sawCleanDuringForce = false;
      }
      if (existsSync(join(outDir, "final", "sample-M-3a.json"))) {
        sawCleanDuringForce = false;
      }
      return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
    };

    const forced = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      force: true,
      repoRoot: repo,
      runCli: forceCli,
    });
    expect(forced.exitCode).toBe(0);
    expect(callCount).toBe(2);
    expect(sawCleanDuringForce).toBe(true);
  });

  it("supports --allow-small and --limit, refuses symlinks without stopping, and exits 1 when no photo could be prepared", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-opt-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-opt-in-"));
    const outDir1 = mkdtempSync(join(tmpdir(), "ref-ext-opt-out1-"));
    const outDir2 = mkdtempSync(join(tmpdir(), "ref-ext-opt-out2-"));
    const outsideDir = mkdtempSync(join(tmpdir(), "ref-ext-opt-outside-"));
    tempDirs.push(repo, photosDir, outDir1, outDir2, outsideDir);

    const small1 = await makePhotoBytes(600, 400, 11);
    const small2 = await makePhotoBytes(600, 400, 12);
    writeFileSync(join(photosDir, "01_small.jpg"), small1);
    writeFileSync(join(photosDir, "02_small.jpg"), small2);
    writeFileSync(join(outsideDir, "secret.jpg"), small1);
    symlinkSync(join(outsideDir, "secret.jpg"), join(photosDir, "03_link.jpg"));

    let calls = 0;
    const fakeCli: RunCli = async () => {
      calls += 1;
      return { code: 0, stdout: JSON.stringify(makeReaderPayload("9a")), stderr: "" };
    };

    // Without --allow-small, no photo can be prepared -> exitCode 1
    const nonePrepared = await extractFolder({
      photosDir,
      outDir: outDir1,
      source: "sample",
      repoRoot: repo,
      runCli: fakeCli,
    });
    expect(nonePrepared.exitCode).toBe(1);
    expect(nonePrepared.preparedCount).toBe(0);
    expect(calls).toBe(0);

    // With --allow-small and --limit 1, reads only the first photo
    const limited = await extractFolder({
      photosDir,
      outDir: outDir2,
      source: "sample",
      allowSmall: true,
      limit: 1,
      repoRoot: repo,
      runCli: fakeCli,
    });
    expect(limited.exitCode).toBe(0);
    expect(limited.preparedCount).toBe(1);
    expect(calls).toBe(2);
  });

  it("refuses same reader families, mismatched model families, and invalid --source", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-err-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-err-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-err-out-"));
    tempDirs.push(repo, photosDir, outDir);

    await expect(
      extractFolder({
        photosDir,
        outDir,
        source: "sample",
        readerA: "codex",
        readerB: "codex",
        repoRoot: repo,
      }),
    ).rejects.toThrow(/different/i);

    await expect(
      extractFolder({
        photosDir,
        outDir,
        source: "sample",
        readerA: "codex",
        modelA: "claude-sonnet-4-6",
        readerB: "claude",
        repoRoot: repo,
      }),
    ).rejects.toThrow(/model/i);

    await expect(
      extractFolder({
        photosDir,
        outDir,
        source: "bad-source",
        repoRoot: repo,
      }),
    ).rejects.toThrow(/--source/);
  });

  it("CLI exits 1 on usage error or empty photos folder", () => {
    const scriptPath = resolve(process.cwd(), "scripts/reference-extract.mjs");
    const emptyPhotos = mkdtempSync(join(tmpdir(), "ref-ext-cli-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-cli-out-"));
    tempDirs.push(emptyPhotos, outDir);

    let failedUsage = false;
    try {
      execFileSync(process.execPath, [scriptPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      failedUsage = (err as { status?: number }).status === 1;
    }
    expect(failedUsage).toBe(true);

    let failedEmpty = false;
    try {
      execFileSync(
        process.execPath,
        [scriptPath, "--photos", emptyPhotos, "--out", outDir, "--source", "sample"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (err) {
      failedEmpty = (err as { status?: number }).status === 1;
    }
    expect(failedEmpty).toBe(true);
  });

  it("retries only the missing reader while sheltering existing page files, preserves old valid readings on failed retry, and skips human_checked pages without --force", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-r1-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-r1-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-r1-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img = await makePhotoBytes(1600, 1200, 21);
    const prep = await preparePhoto(img);
    writeFileSync(join(photosDir, "IMG_0001.jpg"), img);

    // Run 1: codex (A) succeeds, claude (B) fails
    const run1Calls: string[] = [];
    const run1 = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      runCli: async (cmd) => {
        run1Calls.push(cmd);
        if (cmd === "claude") return { code: 124, stdout: "", stderr: "timeout" };
        return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
      },
    });
    expect(run1.exitCode).toBe(0);
    expect(run1Calls.sort()).toEqual(["claude", "codex"]);
    expect(run1.counts.machine_read).toBe(1);
    expect(existsSync(join(outDir, "reader-a", "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(outDir, "final", "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(outDir, "final-view", "sample-M-3a.md"))).toBe(true);

    // Run 2 (no --force): only claude (B) runs; during its call no page files are in outDir; B fails again -> A's reading survives!
    const run2Calls: string[] = [];
    let sawCleanDuringRetry = true;
    const run2 = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      runCli: async (cmd) => {
        run2Calls.push(cmd);
        if (
          workDirHasDigestReading(outDir, prep.sha256) ||
          existsSync(join(outDir, "reader-a", "sample-M-3a.json")) ||
          existsSync(join(outDir, "final", "sample-M-3a.json")) ||
          existsSync(join(outDir, "final-view", "sample-M-3a.md"))
        ) {
          sawCleanDuringRetry = false;
        }
        return { code: 1, stdout: "", stderr: "network error" };
      },
    });
    expect(run2.exitCode).toBe(0);
    expect(run2Calls).toEqual(["claude"]);
    expect(sawCleanDuringRetry).toBe(true);
    expect(existsSync(join(outDir, "reader-a", "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(outDir, "final", "sample-M-3a.json"))).toBe(true);
    expect(run2.counts.machine_read).toBe(1);

    // Run 3 (with --force, both fail): old valid reading in A still survives!
    const run3Calls: string[] = [];
    const run3 = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      force: true,
      repoRoot: repo,
      runCli: async (cmd) => {
        run3Calls.push(cmd);
        return { code: 1, stdout: "", stderr: "cli down" };
      },
    });
    expect(run3.exitCode).toBe(0);
    expect(run3Calls.sort()).toEqual(["claude", "codex"]);
    expect(existsSync(join(outDir, "reader-a", "sample-M-3a.json"))).toBe(true);
    expect(run3.counts.machine_read).toBe(1);

    // Mark 3a as human_checked (even though B is still missing): Run 4 (no --force) skips reading and reports "kept: checked by a person"
    checkAndMarkPage({ workDir: outDir, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    const run4Calls: string[] = [];
    const run4Progress: string[] = [];
    const run4 = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      onProgress: (line) => run4Progress.push(line),
      runCli: async (cmd) => {
        run4Calls.push(cmd);
        return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
      },
    });
    expect(run4.exitCode).toBe(0);
    expect(run4Calls).toEqual([]);
    expect(run4Progress.some((line) => line.toLowerCase().includes("kept: checked by a person"))).toBe(true);
    const reportMd = readFileSync(join(outDir, "final", "report.md"), "utf8");
    expect(reportMd).toContain("## Kept: checked by a person");
  });

  it("marks a second photo with identical bytes as duplicate_photo without deleting the first photo's readings", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-dup-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-dup-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-dup-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img = await makePhotoBytes(1600, 1200, 31);
    writeFileSync(join(photosDir, "01_first.jpg"), img);
    writeFileSync(join(photosDir, "02_copy.jpg"), img);

    let cliCalls = 0;
    const progress: string[] = [];
    const result = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      onProgress: (line) => progress.push(line),
      runCli: async () => {
        cliCalls += 1;
        return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(cliCalls).toBe(2);
    expect(result.counts.double_read).toBe(1);
    expect(progress.some((l) => l.includes("02_copy.jpg") && l.includes("duplicate_photo"))).toBe(true);
    expect(result.report.duplicate_photos).toHaveLength(1);
    expect(result.report.duplicate_photos[0]).toMatchObject({
      original_name: "02_copy.jpg",
      duplicate_of: "01_first.jpg",
    });
    const reportMd = readFileSync(join(outDir, "final", "report.md"), "utf8");
    expect(reportMd).toContain("02_copy.jpg");
    expect(reportMd).toContain("01_first.jpg");
    expect(reportMd).toContain("duplicate_photo");
  });

  it("preserves untouched pages in run.json and final/ when a second run uses --limit", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-lim-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-lim-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-lim-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img1 = await makePhotoBytes(1600, 1200, 41);
    const img2 = await makePhotoBytes(1600, 1200, 42);
    const prep1 = await preparePhoto(img1);
    const prep2 = await preparePhoto(img2);
    writeFileSync(join(photosDir, "01_page.jpg"), img1);
    writeFileSync(join(photosDir, "02_page.jpg"), img2);

    const fakeCli: RunCli = async (_cmd, _args, opts) => {
      const hash = createHash("sha256").update(readFileSync(join(opts.cwd, "page.jpg"))).digest("hex");
      const sheet = hash === prep1.sha256 ? "3a" : "4a";
      return { code: 0, stdout: JSON.stringify(makeReaderPayload(sheet)), stderr: "" };
    };

    const full = await extractFolder({ photosDir, outDir, source: "sample", repoRoot: repo, runCli: fakeCli });
    expect(full.counts.double_read).toBe(2);

    const limited = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      limit: 1,
      force: true,
      repoRoot: repo,
      runCli: fakeCli,
    });
    expect(limited.exitCode).toBe(0);
    expect(limited.counts.double_read).toBe(2);
    expect(existsSync(join(outDir, "final", "sample-M-4a.json"))).toBe(true);
    const runA = JSON.parse(readFileSync(join(outDir, "reader-a", "run.json"), "utf8"));
    const runB = JSON.parse(readFileSync(join(outDir, "reader-b", "run.json"), "utf8"));
    expect(runA.photos.map((p: { photo_sha256: string }) => p.photo_sha256).sort()).toEqual(
      [prep1.sha256, prep2.sha256].sort(),
    );
    expect(runB.photos.map((p: { photo_sha256: string }) => p.photo_sha256).sort()).toEqual(
      [prep1.sha256, prep2.sha256].sort(),
    );
  });

  it("cleans up removed or replaced photos while keeping human_checked removed photos, and keeps manifest import-valid", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-rm-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-rm-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-rm-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img1Old = await makePhotoBytes(1600, 1200, 51);
    const img1New = await makePhotoBytes(1600, 1200, 52);
    const img2 = await makePhotoBytes(1600, 1200, 53);
    const prep1Old = await preparePhoto(img1Old);
    const prep1New = await preparePhoto(img1New);
    const prep2 = await preparePhoto(img2);

    writeFileSync(join(photosDir, "01_page.jpg"), img1Old);
    writeFileSync(join(photosDir, "02_page.jpg"), img2);

    const fakeCli: RunCli = async (_cmd, _args, opts) => {
      const hash = createHash("sha256").update(readFileSync(join(opts.cwd, "page.jpg"))).digest("hex");
      const sheet = hash === prep2.sha256 ? "4a" : "3a";
      return { code: 0, stdout: JSON.stringify(makeReaderPayload(sheet)), stderr: "" };
    };

    await extractFolder({ photosDir, outDir, source: "sample", repoRoot: repo, runCli: fakeCli });
    // Mark 4a as human_checked
    checkAndMarkPage({ workDir: outDir, page: "sample:M:4a", repoRoot: repo, photoCompared: true });

    // Replace 01_page.jpg with a new photo (new digest) and delete 02_page.jpg
    writeFileSync(join(photosDir, "01_page.jpg"), img1New);
    rmSync(join(photosDir, "02_page.jpg"));

    const second = await extractFolder({ photosDir, outDir, source: "sample", repoRoot: repo, runCli: fakeCli });
    expect(second.exitCode).toBe(0);

    // Old 01_page.jpg prepared file is gone; new one is present; human_checked 02_page.jpg photo is kept!
    expect(existsSync(join(outDir, "photos", `${prep1Old.sha256.slice(0, 12)}.jpg`))).toBe(false);
    expect(existsSync(join(outDir, "photos", `${prep1New.sha256.slice(0, 12)}.jpg`))).toBe(true);
    expect(existsSync(join(outDir, "photos", `${prep2.sha256.slice(0, 12)}.jpg`))).toBe(true);

    const reportMd = readFileSync(join(outDir, "final", "report.md"), "utf8");
    expect(reportMd).toContain("## Removed photos");
    expect(reportMd).toContain("`01_page.jpg` (sample:M:3a): no longer in the photos folder");
    expect(reportMd).toContain("`02_page.jpg` (sample:M:4a): kept: checked by a person");

    // Manifest has at most one entry per source_ref and reference:import succeeds
    const manifest = JSON.parse(readFileSync(join(outDir, "photos", PHOTOS_MANIFEST_FILE), "utf8"));
    const refs = manifest.photos.map((p: { source_ref?: string }) => p.source_ref).filter(Boolean);
    expect(new Set(refs).size).toBe(refs.length);

    const store = new MemoryImportStore();
    const imported = await importReferenceRecords({
      recordsDir: join(outDir, "final"),
      photosDir: join(outDir, "photos"),
      store,
    });
    expect(imported.ok).toBe(true);
    expect(imported.counts.inserted).toBe(2);

    // A photos folder with no readable photo (a wrong --photos path) never deletes earlier work.
    rmSync(join(photosDir, "01_page.jpg"));
    const emptyRun = await extractFolder({ photosDir, outDir, source: "sample", repoRoot: repo, runCli: fakeCli });
    expect(emptyRun.exitCode).toBe(1);
    expect(existsSync(join(outDir, "final", "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(outDir, "photos", `${prep1New.sha256.slice(0, 12)}.jpg`))).toBe(true);
  });

  it("handles two photos claiming the same page id without throwing and keeps manifest import-valid", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-cid-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-cid-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-cid-out-"));
    tempDirs.push(repo, photosDir, outDir);

    const img1 = await makePhotoBytes(1600, 1200, 61);
    const img2 = await makePhotoBytes(1600, 1200, 62);
    const prep1 = await preparePhoto(img1);
    writeFileSync(join(photosDir, "01_conflict.jpg"), img1);
    writeFileSync(join(photosDir, "02_agreed.jpg"), img2);

    const fakeCli: RunCli = async (cmd, _args, opts) => {
      const hash = createHash("sha256").update(readFileSync(join(opts.cwd, "page.jpg"))).digest("hex");
      if (hash === prep1.sha256) {
        const sheet = cmd === "codex" ? "3a" : "4a";
        return { code: 0, stdout: JSON.stringify(makeReaderPayload(sheet)), stderr: "" };
      }
      return { code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" };
    };

    const result = await extractFolder({ photosDir, outDir, source: "sample", repoRoot: repo, runCli: fakeCli });
    expect(result.exitCode).toBe(0);
    expect(result.counts.double_read).toBe(1);
    expect(result.report.same_page_id_conflicts).toHaveLength(1);
    expect(result.report.same_page_id_conflicts[0]).toMatchObject({
      original_name: "01_conflict.jpg",
      reader_a_source_ref: "sample:M:3a",
      reader_b_source_ref: "sample:M:4a",
    });

    const reportMd = readFileSync(join(outDir, "final", "report.md"), "utf8");
    expect(reportMd).toContain("## Same page id for two photos");
    expect(reportMd).toContain("01_conflict.jpg");

    const store = new MemoryImportStore();
    const imported = await importReferenceRecords({
      recordsDir: join(outDir, "final"),
      photosDir: join(outDir, "photos"),
      store,
    });
    expect(imported.ok).toBe(true);
    expect(imported.counts.inserted).toBe(1);
  });

  it("refuses a work folder that holds readings with another source key", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-src-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-src-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-src-out-"));
    tempDirs.push(repo, photosDir, outDir);
    writeFileSync(join(photosDir, "01.jpg"), await makePhotoBytes(1600, 1200, 77));
    const runCli = async () => ({ code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" });

    const first = await extractFolder({ photosDir, outDir, source: "sample", repoRoot: repo, runCli });
    expect(first.counts.double_read).toBe(1);

    await expect(
      extractFolder({ photosDir, outDir, source: "other", repoRoot: repo, runCli }),
    ).rejects.toThrow(/source key "sample", not "other"/);
    // Nothing changed: the page is still there under its first source key.
    const status = JSON.parse(readFileSync(join(outDir, "final", "status.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(status)).toEqual(["sample:M:3a"]);
  });
});

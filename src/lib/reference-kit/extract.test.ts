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
import { CHECKED_DIGESTS_FILE, importReferenceRecords } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";
import { extractFolder } from "./extract";
import { MemoryImportStore } from "./import-store.fixtures";
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
      agreement_accepted: 0,
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

  it("marks a narrow strip photo whose short side is under 600 px as too_small with both sizes in the message", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-ext-narrow-repo-"));
    const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-narrow-in-"));
    const outDir = mkdtempSync(join(tmpdir(), "ref-ext-narrow-out-"));
    tempDirs.push(repo, photosDir, outDir);
    writeFileSync(join(photosDir, "01_strip.jpg"), await makePhotoBytes(461, 3473, 41));
    writeFileSync(join(photosDir, "02_ok.jpg"), await makePhotoBytes(1600, 1200, 42));

    const progress: string[] = [];
    const runCli = async () => ({ code: 0, stdout: JSON.stringify(makeReaderPayload("3a")), stderr: "" });
    const result = await extractFolder({
      photosDir,
      outDir,
      source: "sample",
      repoRoot: repo,
      runCli,
      onProgress: (line) => progress.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(result.counts.too_small).toBe(1);
    expect(result.counts.double_read).toBe(1);
    expect(progress[0]).toContain("too_small (461x3473)");
    expect(progress[0]).toContain("1600");
    expect(progress[0]).toContain("600");
    expect(result.report.too_small_photos).toEqual([
      { original_name: "01_strip.jpg", width: 461, height: 3473 },
    ]);
  });

  describe("a page checked by a person", () => {
    const REF = "sample:M:3a";

    // Photo 1 is page 3a (checked by a person after a correction), photo 2 is page 4a.
    async function setUpCheckedWork() {
      const repo = mkdtempSync(join(tmpdir(), "ref-ext-chk-repo-"));
      const photosDir = mkdtempSync(join(tmpdir(), "ref-ext-chk-in-"));
      const outDir = mkdtempSync(join(tmpdir(), "ref-ext-chk-out-"));
      tempDirs.push(repo, photosDir, outDir);
      const images = await Promise.all([91, 92, 93].map((seed) => makePhotoBytes(1600, 1200, seed)));
      const shas = await Promise.all(images.map(async (img) => (await preparePhoto(img)).sha256));
      writeFileSync(join(photosDir, "05_page.jpg"), images[0]);
      writeFileSync(join(photosDir, "06_page.jpg"), images[1]);
      const sheets = new Map([
        [shas[0], "3a"],
        [shas[1], "4a"],
        [shas[2], "3a"],
      ]);
      // Each reader call: the photo, and the final record of page 3a while the reader runs.
      const calls: Array<{ photo: string; record: Buffer | null }> = [];
      const progress: string[] = [];
      const runCli: RunCli = async (_cmd, _args, opts) => {
        const hash = createHash("sha256").update(readFileSync(join(opts.cwd, "page.jpg"))).digest("hex");
        calls.push({ photo: hash, record: existsSync(recordPath) ? readFileSync(recordPath) : null });
        return { code: 0, stdout: JSON.stringify(makeReaderPayload(sheets.get(hash) ?? "9a")), stderr: "" };
      };
      const extract = (over: { force?: boolean } = {}) =>
        extractFolder({
          photosDir,
          outDir,
          source: "sample",
          repoRoot: repo,
          runCli,
          onProgress: (line) => progress.push(line),
          ...over,
        });
      const check = (ref = REF) =>
        checkAndMarkPage({ workDir: outDir, page: ref, repoRoot: repo, photoCompared: true });
      const recordPath = join(outDir, "final", "sample-M-3a.json");
      const record = () => readFileSync(recordPath);
      const statusPath = join(outDir, "final", "status.json");
      const status = () => (JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, string>)[REF];
      const importAll = async () => {
        const store = new MemoryImportStore();
        const result = await importReferenceRecords({
          recordsDir: join(outDir, "final"),
          photosDir: join(outDir, "photos"),
          store,
        });
        return { result, store };
      };

      await extract();
      const corrected = JSON.parse(record().toString("utf8")) as { topic: { title: string } };
      corrected.topic.title = "Corrected by a person";
      writeFileSync(recordPath, JSON.stringify(corrected));
      check();
      const digestsPath = join(outDir, "final", CHECKED_DIGESTS_FILE);
      calls.length = 0;
      progress.length = 0;
      return {
        photosDir, outDir, images, shas, sheets, calls, progress, extract, check, recordPath, record,
        statusPath, status, importAll, digestsPath,
      };
    }

    it("keeps the record byte for byte through extract, says what changed, and is never imported as checked with another photo or text", async () => {
      type Work = Awaited<ReturnType<typeof setUpCheckedWork>>;
      const replacePhoto = (name: string) => (w: Work) => {
        rmSync(join(w.photosDir, "05_page.jpg"));
        writeFileSync(join(w.photosDir, name), w.images[2]);
      };
      const rows: Array<{
        name: string;
        change: (w: Work) => void;
        force?: boolean;
        status: string;
        reason?: string;
        conflict?: string;
        // The photos folder holds a new photo (photo 3) of the page.
        newPhoto?: boolean;
      }> = [
        { name: "no change", change: () => {}, status: "human_checked" },
        {
          name: "photo removed (its prepared photo is kept)",
          change: (w) => rmSync(join(w.photosDir, "05_page.jpg")),
          status: "human_checked",
        },
        {
          name: "photo replaced, new name sorts first",
          change: replacePhoto("01_page.jpg"),
          status: "machine_read",
          reason: "photo changed after the check",
          newPhoto: true,
        },
        // The kept photo of the check still wins the page id: the page keeps its own photo and text,
        // and the report lists the new photo under "Same page id for two photos".
        ...["05_page.jpg", "09_page.jpg"].map((name) => ({
          name: `photo replaced, new name ${name}`,
          change: replacePhoto(name),
          status: "human_checked",
          conflict: name,
          newPhoto: true,
        })),
        {
          name: "record changed",
          change: (w) => writeFileSync(w.recordPath, Buffer.concat([w.record(), Buffer.from("\n")])),
          status: "machine_read",
          reason: "record changed after the check",
        },
        // The readers would give the photo another page id now, but they do not read it again.
        {
          name: "a new reading would give the photo another page id",
          change: (w) => w.sheets.set(w.shas[0], "5a"),
          status: "human_checked",
        },
        {
          name: "a new reading would swap the page ids of the two photos",
          change: (w) => {
            w.sheets.set(w.shas[0], "4a");
            w.sheets.set(w.shas[1], "3a");
          },
          force: true,
          status: "human_checked",
          conflict: "06_page.jpg",
        },
        {
          name: "photo and its readings lost",
          change: (w) => {
            rmSync(join(w.photosDir, "05_page.jpg"));
            for (const dir of ["photos", "reader-a", "reader-b"]) {
              rmSync(join(w.outDir, dir), { recursive: true });
            }
          },
          status: "machine_read",
          reason: "photo of the check is missing",
        },
        {
          name: "older folder with no digests",
          change: (w) => rmSync(w.digestsPath),
          status: "machine_read",
          reason: "checked before the photo check was saved",
        },
        {
          name: "older folder with no digests, photo removed",
          change: (w) => {
            rmSync(w.digestsPath);
            rmSync(join(w.photosDir, "05_page.jpg"));
          },
          status: "machine_read",
          reason: "checked before the photo check was saved",
        },
      ];
      for (const row of rows.flatMap((r) =>
        (r.force === undefined ? [false, true] : [r.force]).map((force) => ({
          ...r,
          force,
          name: `${r.name}${force ? ", with --force" : ""}`,
        })),
      )) {
        const w = await setUpCheckedWork();
        row.change(w);
        const before = w.record();
        for (let round = 1; round <= 2; round += 1) {
          w.calls.length = 0;
          const { report, counts } = await w.extract({ force: row.force });
          expect(w.record().equals(before), row.name).toBe(true);
          expect(w.status(), row.name).toBe(row.status);
          // The photo of the check is not read again. With --force each other photo is, with the
          // record of the checked page in place while the readers run.
          const reads = (i: number) => w.calls.filter((c) => c.photo === w.shas[i]).length;
          expect(reads(0), row.name).toBe(0);
          if (row.force) {
            expect([reads(1), reads(2)], row.name).toEqual([2, row.newPhoto ? 2 : 0]);
          } else if (row.newPhoto) {
            expect(reads(2), row.name).toBe(round === 1 ? 2 : 0);
          }
          for (const call of w.calls) expect(call.record?.equals(before), row.name).toBe(true);
          // The counts of the run and the list of pages for a person say the same.
          const list = (report.pages_sent_to_person ?? []).map((p) => p.source_ref);
          const statuses = JSON.parse(readFileSync(w.statusPath, "utf8")) as Record<string, string>;
          expect(list, row.name).toHaveLength(counts.machine_read);
          expect(list.sort(), row.name).toEqual(
            Object.keys(statuses).filter((ref) => statuses[ref] === "machine_read").sort(),
          );
          const sent = report.pages_sent_to_person?.find((p) => p.source_ref === REF);
          if (row.reason) expect(sent?.reason, row.name).toContain(row.reason);
          else expect(sent, row.name).toBeUndefined();
          if (round === 1 && row.name.includes("photo removed")) {
            expect(readFileSync(join(w.outDir, "final", "report.md"), "utf8"), row.name).toContain(
              `\`05_page.jpg\` (${REF}): kept: ${row.reason ? "a person must check this page again" : "checked by a person"}\n`,
            );
          }
          if (row.conflict) {
            expect(report.same_page_id_conflicts.map((c) => c.original_name), row.name).toEqual([row.conflict]);
          }
        }
        // Import sends only the text and the photo that the person compared, and sends nothing when
        // the check lapsed.
        const { result, store } = await w.importAll();
        if (row.reason) {
          expect(result.problems.join("\n"), row.name).toMatch(
            new RegExp(`${REF}: a person checked this page before.*${row.reason}`),
          );
          expect([store.rows.size, store.objects.size], row.name).toEqual([0, 0]);
        } else {
          expect(result.problems, row.name).toEqual([]);
          expect(store.rows.get(REF)?.transcript_status, row.name).toBe("human_checked");
          expect(await store.objectSha256("sample/M/3a.jpg"), row.name).toBe(w.shas[0]);
        }
      }
    });

    it("says in the run output that a page is checked only while its check counts, and reads neither again", async () => {
      for (const force of [false, true]) {
        const w = await setUpCheckedWork();
        const lines = () => w.progress.filter((line) => line.includes("05_page.jpg"));
        const line = (why: string) =>
          `[1/2] 05_page.jpg: kept: ${why} -> sample:M:3a${force ? " (--force does not read this photo again)" : ""}`;
        await w.extract({ force });
        expect(lines()).toEqual([line("checked by a person")]);
        writeFileSync(w.recordPath, Buffer.concat([w.record(), Buffer.from("\n")]));
        for (let round = 1; round <= 2; round += 1) {
          w.progress.length = 0;
          await w.extract({ force });
          expect(lines()).toEqual([line("a person must check this page again")]);
        }
        expect(w.calls.filter((c) => c.photo === w.shas[0] || !force)).toEqual([]);
      }
    });

    it("gives a page that lost its photo the same photo again, or lets the page go with its record file", async () => {
      const wrongId = async () => {
        const w = await setUpCheckedWork();
        // An older kit read the photo again and gave it another page id.
        for (const dir of ["photos", "reader-a", "reader-b"]) rmSync(join(w.outDir, dir), { recursive: true });
        w.sheets.set(w.shas[0], "5a");
        const { report } = await w.extract();
        expect(report.pages_sent_to_person?.map((p) => [p.source_ref, p.reason])).toEqual([
          [REF, "photo of the check is missing"],
        ]);
        expect(() => w.check()).toThrow(/names no photo for sample:M:3a/);
        return w;
      };

      const again = await wrongId();
      const before = again.record();
      again.sheets.set(again.shas[0], "3a");
      await again.extract({ force: true });
      expect(again.record().equals(before)).toBe(true);
      again.check();
      expect(again.status()).toBe("human_checked");

      const letGo = await wrongId();
      rmSync(letGo.recordPath);
      letGo.sheets.set(letGo.shas[0], "3a");
      await letGo.extract({ force: true });
      expect(letGo.status()).toBe("double_read");
      letGo.check();
      expect(letGo.status()).toBe("human_checked");
    });

    it("reads the photo again with --force after the person removed the record file", async () => {
      const w = await setUpCheckedWork();
      rmSync(w.recordPath);
      await w.extract({ force: true });
      expect(w.calls.filter((c) => c.photo === w.shas[0])).toHaveLength(2);
      expect(w.status()).toBe("double_read");
    });

    it("stops before it removes anything when the status or the digest file is damaged", async () => {
      for (const file of ["statusPath", "digestsPath"] as const) {
        const w = await setUpCheckedWork();
        rmSync(join(w.photosDir, "05_page.jpg"));
        writeFileSync(w[file], "{ bad");
        const before = w.record();
        const prepared = join(w.outDir, "photos", `${w.shas[0].slice(0, 12)}.jpg`);
        await expect(w.extract(), file).rejects.toThrow(w[file].split("/").pop());
        expect(w.record().equals(before), file).toBe(true);
        expect(existsSync(prepared), file).toBe(true);
      }
    });
  });
});

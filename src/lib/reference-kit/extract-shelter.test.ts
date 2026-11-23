import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openPageShelter } from "./extract-shelter";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const SHA_1 = "a".repeat(64);
const SHA_2 = "b".repeat(64);

function makeWorkFixture(): {
  repo: string;
  workDir: string;
  slotDirA: string;
  slotDirB: string;
  finalDir: string;
  viewDir: string;
} {
  const repo = mkdtempSync(join(tmpdir(), "ref-sh-repo-"));
  const workDir = mkdtempSync(join(tmpdir(), "ref-sh-work-"));
  tempDirs.push(repo, workDir);

  const slotDirA = join(workDir, "reader-a");
  const slotDirB = join(workDir, "reader-b");
  const finalDir = join(workDir, "final");
  const viewDir = join(workDir, "final-view");
  for (const dir of [slotDirA, slotDirB, finalDir, viewDir]) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(join(slotDirA, "sample-M-3a.json"), '{"source_ref":"sample:M:3a","from":"a"}\n');
  writeFileSync(join(slotDirB, "sample-M-3a.json"), '{"source_ref":"sample:M:3a","from":"b"}\n');
  writeFileSync(join(finalDir, "sample-M-3a.json"), '{"source_ref":"sample:M:3a","from":"final"}\n');
  writeFileSync(join(viewDir, "sample-M-3a.md"), "# sample:M:3a\n");
  writeFileSync(join(finalDir, "status.json"), JSON.stringify({ "sample:M:3a": "machine_read" }));

  const runA = {
    slot: "a",
    reader: { family: "codex", model: "default" },
    source: "sample",
    photos: [
      { photo: `${SHA_1.slice(0, 12)}.jpg`, photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
      { photo: `${SHA_2.slice(0, 12)}.jpg`, photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
    ],
  };
  writeFileSync(join(slotDirA, "run.json"), JSON.stringify(runA, null, 2));
  writeFileSync(
    join(slotDirB, "run.json"),
    JSON.stringify({ ...runA, slot: "b", reader: { family: "claude", model: "default" } }, null, 2),
  );
  return { repo, workDir, slotDirA, slotDirB, finalDir, viewDir };
}

describe("openPageShelter", () => {
  it("moves page files to a mode-0700 temp folder, strips the digest from run.json while open, and restores all files on close", () => {
    const f = makeWorkFixture();
    const shelter = openPageShelter({
      workDir: f.workDir,
      slotDirA: f.slotDirA,
      slotDirB: f.slotDirB,
      repoRoot: f.repo,
      sha256: SHA_1,
      slotAFiles: ["sample-M-3a.json"],
      slotBFiles: ["sample-M-3a.json"],
      finalSourceRefs: ["sample:M:3a"],
    });

    try {
      expect(existsSync(shelter.shelterDir)).toBe(true);
      expect(statSync(shelter.shelterDir).mode & 0o777).toBe(0o700);
      expect(existsSync(join(f.slotDirA, "sample-M-3a.json"))).toBe(false);
      expect(existsSync(join(f.slotDirB, "sample-M-3a.json"))).toBe(false);
      expect(existsSync(join(f.finalDir, "sample-M-3a.json"))).toBe(false);
      expect(existsSync(join(f.viewDir, "sample-M-3a.md"))).toBe(false);
      expect(readFileSync(join(f.slotDirA, "run.json"), "utf8")).not.toContain(SHA_1);
      expect(readFileSync(join(f.slotDirA, "run.json"), "utf8")).toContain(SHA_2);
    } finally {
      shelter.close();
    }

    expect(existsSync(shelter.shelterDir)).toBe(false);
    expect(readFileSync(join(f.slotDirA, "sample-M-3a.json"), "utf8")).toContain('"from":"a"');
    expect(readFileSync(join(f.slotDirB, "sample-M-3a.json"), "utf8")).toContain('"from":"b"');
    expect(readFileSync(join(f.finalDir, "sample-M-3a.json"), "utf8")).toContain('"from":"final"');
    expect(readFileSync(join(f.viewDir, "sample-M-3a.md"), "utf8")).toContain("# sample:M:3a");
    expect(readFileSync(join(f.slotDirA, "run.json"), "utf8")).toContain(SHA_1);
  });

  it("keeps replaced slot files while restoring non-replaced slot files and final files", () => {
    const f = makeWorkFixture();
    const shelter = openPageShelter({
      workDir: f.workDir,
      slotDirA: f.slotDirA,
      slotDirB: f.slotDirB,
      repoRoot: f.repo,
      sha256: SHA_1,
      slotAFiles: ["sample-M-3a.json"],
      slotBFiles: ["sample-M-3a.json"],
      finalSourceRefs: ["sample:M:3a"],
    });

    try {
      writeFileSync(join(f.slotDirB, "sample-M-3a.json"), '{"source_ref":"sample:M:3a","from":"b-new"}\n');
      shelter.markReplaced("slotB");
      shelter.markCommitted();
    } finally {
      shelter.close();
    }

    expect(readFileSync(join(f.slotDirA, "sample-M-3a.json"), "utf8")).toContain('"from":"a"');
    expect(readFileSync(join(f.slotDirB, "sample-M-3a.json"), "utf8")).toContain('"from":"b-new"');
    expect(readFileSync(join(f.finalDir, "sample-M-3a.json"), "utf8")).toContain('"from":"final"');
  });

  it("restores all sheltered files and deletes new files when closed without a commit", () => {
    const f = makeWorkFixture();
    const shelter = openPageShelter({
      workDir: f.workDir,
      slotDirA: f.slotDirA,
      slotDirB: f.slotDirB,
      repoRoot: f.repo,
      sha256: SHA_1,
      slotAFiles: ["sample-M-3a.json"],
      slotBFiles: ["sample-M-3a.json"],
      finalSourceRefs: ["sample:M:3a"],
    });

    const newFile = join(f.slotDirA, "sample-M-4a.json");
    writeFileSync(newFile, '{"source_ref":"sample:M:4a","from":"a-new"}\n');
    shelter.markReplaced("slotA", [newFile]);

    expect(() => {
      try {
        throw new Error("simulated crash");
      } finally {
        shelter.close();
      }
    }).toThrow("simulated crash");

    expect(existsSync(join(f.slotDirA, "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(f.slotDirB, "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(f.finalDir, "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(f.viewDir, "sample-M-3a.md"))).toBe(true);
    expect(readFileSync(join(f.slotDirA, "run.json"), "utf8")).toContain(SHA_1);
    expect(readFileSync(join(f.slotDirA, "sample-M-3a.json"), "utf8")).toContain('"from":"a"');
    expect(existsSync(newFile)).toBe(false);
    expect(existsSync(shelter.shelterDir)).toBe(false);
  });
});

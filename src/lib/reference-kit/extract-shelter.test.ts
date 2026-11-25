import { createHash } from "node:crypto";
import {
  cpSync,
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
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKED_DIGESTS_FILE } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";
import { extractFolder } from "./extract";
import { openPageShelter } from "./extract-shelter";
import { preparePhoto } from "./prepare";
import type { RunCli } from "./read";

// Runs before each file change of the code under test. A test that throws here stops the run there.
const fsHook = vi.hoisted(() => ({ step: null as ((name: string, path: string) => void) | null }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<
    Record<string, (...args: unknown[]) => unknown> & { constants: { O_CREAT: number } }
  >();
  const changes = [
    "chmodSync", "fchmodSync", "mkdirSync", "mkdtempSync", "openSync", "renameSync", "rmSync",
    "unlinkSync", "writeFileSync",
  ];
  const wrapped = changes.map((name) => [
    name,
    (...args: unknown[]) => {
      const reads = name === "openSync" && (Number(args[1]) & real.constants.O_CREAT) === 0;
      if (!reads) fsHook.step?.(name, String(args[0]));
      return real[name](...args);
    },
  ]);
  return { ...real, ...Object.fromEntries(wrapped) };
});

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

const REF = "sample:M:3a";

function readerPayload(sheet: string): string {
  return JSON.stringify({
    kind: "page",
    level: "M",
    sheet,
    topic: { title: "Adding Numbers" },
    sections: [
      {
        instruction: "Add.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "1 + 2 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [1, 2] },
            responses: [{ position: "after_equals", cue: null, answer: "3", answer_source: "reader" }],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  });
}

describe("the record of a page that a person checked", () => {
  let root: string;
  let repoRoot: string;
  let photosDir: string;
  let workDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ref-shelter-"));
    repoRoot = join(root, "repo");
    photosDir = join(root, "in");
    workDir = join(root, "work");
    for (const dir of [repoRoot, photosDir, workDir, join(root, "tmp")]) mkdirSync(dir);
    vi.stubEnv("TMPDIR", join(root, "tmp"));
  });
  afterEach(() => {
    fsHook.step = null;
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  const recordPath = (dir = workDir) => join(dir, "final", "sample-M-3a.json");

  it("refuses to take the record of a page that a person checked, and changes nothing", () => {
    const rows: Array<{ name: string; file: string; content: unknown }> = [
      { name: "human_checked", file: "status.json", content: { [REF]: "human_checked" } },
      {
        name: "digests of a check that lapsed",
        file: CHECKED_DIGESTS_FILE,
        content: {
          version: 1,
          pages: [{ source_ref: REF, record_sha256: "a".repeat(64), photo_sha256: "b".repeat(64) }],
          checked_before: [],
        },
      },
      {
        name: "checked before the digests",
        file: CHECKED_DIGESTS_FILE,
        content: { version: 1, pages: [], checked_before: [REF] },
      },
      {
        name: "kept page of the last report",
        file: "report.json",
        content: { pages: [], kept_human_checked: [{ source_ref: REF }] },
      },
    ];
    // On a disk that ignores case, a page id in other letters names the same file.
    for (const refs of [[REF], ["sample:M:4a", REF], ["sample:m:3a"]]) {
      for (const row of rows) {
        const name = `${row.name}, ${refs.join(" and ")}`;
        const finalDir = join(workDir, "final");
        const slotDir = join(workDir, "reader-a");
        rmSync(workDir, { recursive: true });
        for (const dir of [finalDir, slotDir]) mkdirSync(dir, { recursive: true });
        for (const page of ["3a", "4a"]) writeFileSync(join(finalDir, `sample-M-${page}.json`), "{}");
        writeFileSync(join(finalDir, row.file), JSON.stringify(row.content));
        const run = JSON.stringify({ photos: [{ photo_sha256: "c".repeat(64) }] });
        writeFileSync(join(slotDir, "run.json"), run);
        const changes: string[] = [];
        fsHook.step = (change, path) => changes.push(`${change} ${path}`);
        const open = () =>
          openPageShelter({
            workDir,
            slotDirA: slotDir,
            slotDirB: join(workDir, "reader-b"),
            repoRoot,
            sha256: "c".repeat(64),
            slotAFiles: [],
            slotBFiles: [],
            finalSourceRefs: refs,
          });
        expect(open, name).toThrow(new RegExp(`${refs.at(-1)}.*person checked`));
        fsHook.step = null;
        expect(changes, name).toEqual([]);
      }
    }
  });

  it("leaves each checked record in place, byte for byte, when extract --force stops at any step", async () => {
    // Photo 1 is page 3a (checked by a person), photo 2 is page 4a, and photo 3 is a newer photo of
    // page 3a. The readers run again on photo 2 and on photo 3.
    const images = await Promise.all(
      [1, 2, 3].map((seed) =>
        sharp({ create: { width: 16, height: 12, channels: 3, background: { r: seed * 60, g: 40, b: 90 } } })
          .jpeg()
          .toBuffer(),
      ),
    );
    const shas = await Promise.all(images.map(async (image) => (await preparePhoto(image)).sha256));
    const sheets = new Map(shas.map((sha, i) => [sha, i === 1 ? "4a" : "3a"]));
    const read: string[] = [];
    let expected: Buffer | null = null;
    const runCli: RunCli = async (_cmd, _args, opts) => {
      const sha = createHash("sha256").update(readFileSync(join(opts.cwd, "page.jpg"))).digest("hex");
      read.push(`${shas.indexOf(sha) + 1}`);
      if (expected) expect(readFileSync(recordPath(work)).equals(expected)).toBe(true);
      return { code: 0, stdout: readerPayload(sheets.get(sha) ?? "9a"), stderr: "" };
    };
    let work = workDir;
    const extract = (force: boolean) =>
      extractFolder({ photosDir, outDir: work, source: "sample", repoRoot, allowSmall: true, force, runCli });

    for (const i of [0, 1]) writeFileSync(join(photosDir, `0${i + 1}.jpg`), images[i]);
    await extract(false);
    checkAndMarkPage({ workDir, page: REF, repoRoot, photoCompared: true });
    writeFileSync(join(photosDir, "03.jpg"), images[2]);
    await extract(false);
    expected = readFileSync(recordPath());
    const checkedStatus = () =>
      (JSON.parse(readFileSync(join(work, "final", "status.json"), "utf8")) as Record<string, string>)[REF];
    expect(checkedStatus()).toBe("human_checked");

    const inPlace = () => existsSync(recordPath(work)) && readFileSync(recordPath(work)).equals(expected!);

    // One whole run: the record is in place before each change of a file. The steps of a shelter go
    // from the first change after it opens to the removal of its folder.
    work = join(root, "whole");
    cpSync(workDir, work, { recursive: true });
    read.length = 0;
    const lost: string[] = [];
    const shelterSteps: number[] = [];
    let step = 0;
    let sheltering = false;
    let opened = 0;
    fsHook.step = (name, path) => {
      step += 1;
      const isShelter = path.includes("unica-ref-shelter-");
      if (isShelter && name === "mkdtempSync") {
        sheltering = true;
        opened += 1;
      }
      if (sheltering && !path.includes("unica-ref-read-")) shelterSteps.push(step);
      if (isShelter && name === "rmSync") sheltering = false;
      if (!inPlace()) lost.push(`${name} ${path}`);
    };
    await extract(true);
    fsHook.step = null;
    expect(lost).toEqual([]);
    expect([opened, read, checkedStatus()]).toEqual([2, ["2", "2", "3", "3"], "human_checked"]);
    expect(shelterSteps.length).toBeGreaterThan(20);

    // Stop at each of those steps. A stopped process changes no file any more, so each later change
    // fails too. Then run the command again (a step that only fills a temporary file leaves the same
    // folder as the step before it).
    for (const stopAt of shelterSteps) {
      work = join(root, `stop-${stopAt}`);
      cpSync(workDir, work, { recursive: true });
      let last = "";
      let count = 0;
      fsHook.step = (name, path) => {
        count += 1;
        if (count < stopAt) return;
        last ||= `${name} ${path}`;
        throw new Error("stopped");
      };
      await expect(extract(true)).rejects.toThrow("stopped");
      fsHook.step = null;
      expect(inPlace(), last).toBe(true);
      if (/^(unlink|rename|rm)Sync /.test(last)) {
        await extract(false);
        expect([inPlace(), checkedStatus()], `next run after ${last}`).toEqual([true, "human_checked"]);
      }
      rmSync(work, { recursive: true });
    }
  });
});

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importReferenceRecords, type PageRecord } from "@/lib/reference-record";
import { MemoryReferenceStore } from "@/lib/reference-record/import-store.fixtures";
import { compareWorkFolder } from "./compare-batch";
import { fakePhoto } from "./photo.fixtures";

const REF = "sample:M:3a";
const OTHER = "sample:M:4a";
const fileOf = (ref: string) => `${ref.replaceAll(":", "-")}.json`;

function makePage(sourceRef: string): PageRecord {
  return {
    kind: "page",
    source_ref: sourceRef,
    topic: { title: "Adding Numbers", number: 1 },
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
            responses: [{ position: "after_equals", cue: null, answer: "3", answer_source: "computed" }],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  };
}

describe("a damaged final record", () => {
  let root: string;
  let repoRoot: string;
  let workDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ref-damaged-final-"));
    repoRoot = join(root, "repo");
    workDir = join(root, "work");
    mkdirSync(repoRoot);
    setReadings([REF, OTHER]);
    compare();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function setReadings(refs: string[]): void {
    for (const [slot, family] of [["reader-a", "codex"], ["reader-b", "claude"]]) {
      const dir = join(workDir, slot);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m" }));
      for (const ref of refs) writeFileSync(join(dir, fileOf(ref)), JSON.stringify(makePage(ref)));
      const photos = refs.map((ref) => {
        const { file, sha256 } = fakePhoto(ref);
        return { photo: file, photo_sha256: sha256, status: "ok", source_ref: ref, record_file: fileOf(ref), notes: [] };
      });
      writeFileSync(join(dir, "run.json"), JSON.stringify({ reader: { family, model: "m" }, photos }));
    }
  }

  const compare = () => compareWorkFolder({ workDir, repoRoot });
  const finalPath = (name: string) => join(workDir, "final", name);
  const readFinals = () =>
    Object.fromEntries(readdirSync(join(workDir, "final")).map((name) => [name, readFileSync(finalPath(name), "base64")]));

  const good = JSON.stringify(makePage(REF));
  // In text that no rule looks at, so that only the byte is wrong.
  const inTitle = good.indexOf("Adding Numbers") + 3;
  const damages: Array<[string, string | Buffer]> = [
    ["a typing mistake", "{ damaged person edit"],
    ["an empty file", ""],
    ["null", "null"],
    ["a list", "[]"],
    ["no page id", JSON.stringify({ ...makePage(REF), source_ref: undefined })],
    ["a page id that is not text", JSON.stringify({ ...makePage(REF), source_ref: 3 })],
    ["not a valid record", JSON.stringify({ ...makePage(REF), sections: "none" })],
    ["a bad byte", Buffer.concat([Buffer.from(good.slice(0, inTitle)), Buffer.of(0xff), Buffer.from(good.slice(inTitle))])],
  ];
  const notes: Array<[string, () => void]> = [
    ["the report has the hash", () => {}],
    ["the report has no page list", () => writeFileSync(finalPath("report.json"), "{}")],
    ["the report has no hash for the page", () => {
      const report = JSON.parse(readFileSync(finalPath("report.json"), "utf8")) as { pages: Array<Record<string, unknown>> };
      const pages = report.pages.map((page) => ({ ...page, final_record_sha256: null }));
      writeFileSync(finalPath("report.json"), JSON.stringify({ ...report, pages }));
    }],
    ["there is no report", () => rmSync(finalPath("report.json"))],
  ];

  it.each(damages.flatMap(([damage, text]) => notes.map(([note, change]) => ({ damage, text, note, change }))))(
    "$damage, $note: compare keeps the file, names the page, and import refuses it",
    async ({ text, change }) => {
      writeFileSync(finalPath(fileOf(REF)), text);
      const before = readFileSync(finalPath(fileOf(REF)));
      change();
      for (let round = 1; round <= 3; round += 1) {
        const report = compare();
        expect(readFileSync(finalPath(fileOf(REF)))).toEqual(before);
        const page = report.pages.find((p) => p.source_ref === REF);
        expect(page).toMatchObject({ status: "machine_read", edited_by_person: true });
        expect(report.pages_sent_to_person?.map((p) => p.source_ref)).toContain(REF);
        expect(report.pages.find((p) => p.source_ref === OTHER)?.status).toBe("double_read");
      }
      const result = await importReferenceRecords({ recordsDir: join(workDir, "final"), store: new MemoryReferenceStore() });
      expect(result.ok).toBe(false);

      // Also after the person corrects it, until the check.
      writeFileSync(finalPath(fileOf(REF)), `${good}\n`);
      expect(compare().pages.find((p) => p.source_ref === REF)).toMatchObject({ status: "machine_read", edited_by_person: true });
      const corrected = await importReferenceRecords({ recordsDir: join(workDir, "final"), store: new MemoryReferenceStore() });
      expect(corrected.problems.join("\n")).toContain(`${REF}: the record is not the file`);

      // A person who removes the file lets compare write the page again.
      rmSync(finalPath(fileOf(REF)));
      expect(compare().pages.find((p) => p.source_ref === REF)?.status).toBe("double_read");
    },
  );

  const unowned: Array<[string, () => void]> = [
    ["status.json and report.json do not list its page", () => {
      writeFileSync(finalPath("status.json"), JSON.stringify({ [OTHER]: "double_read" }));
      rmSync(finalPath("report.json"));
    }],
    ["its page has no reading any more", () => setReadings([OTHER])],
    ["its page has no reading any more, and no hash", () => {
      setReadings([OTHER]);
      rmSync(finalPath("report.json"));
    }],
    ["its page has no reading and no note", () => {
      setReadings([OTHER]);
      rmSync(finalPath("status.json"));
      rmSync(finalPath("report.json"));
    }],
  ];
  it.each(damages.flatMap(([damage, text]) => unowned.map(([note, change]) => ({ damage, text, note, change }))))(
    "$damage, $note: compare stops, names the file and changes nothing",
    ({ text, change }) => {
      writeFileSync(finalPath(fileOf(REF)), text);
      change();
      const before = readFinals();
      expect(compare).toThrow(finalPath(fileOf(REF)));
      expect(readFinals()).toEqual(before);
    },
  );

  it("stays the file of a page that a person checked", () => {
    writeFileSync(finalPath(fileOf(REF)), "{ damaged");
    writeFileSync(finalPath("status.json"), JSON.stringify({ [REF]: "human_checked", [OTHER]: "double_read" }));
    for (const refs of [[REF, OTHER], [OTHER]]) {
      setReadings(refs);
      const report = compare();
      expect(report.kept_human_checked).toMatchObject([{ source_ref: REF }]);
      expect(readFileSync(finalPath(fileOf(REF)), "utf8")).toBe("{ damaged");
    }
  });

  it("is told from a good record: that one is written again, or removed with its page", () => {
    rmSync(finalPath("report.json"));
    expect(compare().pages.map((p) => p.status)).toEqual(["double_read", "double_read"]);
    setReadings([OTHER]);
    expect(compare().removed_stale_pages).toEqual([REF]);
    expect(Object.keys(readFinals())).not.toContain(fileOf(REF));
  });
});

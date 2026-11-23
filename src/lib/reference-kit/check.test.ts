import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PageRecord } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeFinalPage(): PageRecord {
  return {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Adding Numbers", number: 1 },
    sections: [
      {
        instruction: "Add the numbers.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "14 + 9 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [14, 9] },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: "99", // stale manual edit; should be recomputed to 23
                answer_source: "reader",
              },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [
      [100, 100],
      [90, 99],
      [80, 89],
      [70, 79],
      [0, 69],
    ],
  };
}

describe("checkAndMarkPage", () => {
  it("refuses --page all and paths inside the repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "all", repoRoot: repo }),
    ).toThrow(/not supported/i);

    expect(() =>
      checkAndMarkPage({ workDir: join(repo, "work"), page: "sample:M:3a", repoRoot: repo }),
    ).toThrow(/Refusing to write/);
  });

  it("validates, recomputes answers, marks human_checked in status.json, and rewrites view", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(makeFinalPage(), null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );

    const result = checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo });
    expect(result.sourceRef).toBe("sample:M:3a");
    expect(result.notes.length).toBe(1);

    const updatedRecord = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8"));
    expect(updatedRecord.sections[0].items[0].responses[0].answer).toBe("23");
    expect(updatedRecord.sections[0].items[0].responses[0].answer_source).toBe("computed");

    const updatedStatus = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(updatedStatus["sample:M:3a"]).toBe("human_checked");

    const viewMd = readFileSync(join(work, "final-view", "sample-M-3a.md"), "utf8");
    expect(viewMd).toContain("# sample:M:3a");
    expect(viewMd).toContain("**23** (computed)");
  });

  it("refuses an invalid edited record without modifying status.json", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(
      join(finalDir, "sample-M-3a.json"),
      JSON.stringify({ ...makeFinalPage(), unknown_key: 123 }, null, 2),
    );
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo }),
    ).toThrow(/Validation failed/);

    const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(status["sample:M:3a"]).toBe("machine_read");
  });

  it("refuses a page that is not listed in status.json", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(makeFinalPage(), null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:4a": "double_read" }, null, 2),
    );

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo }),
    ).toThrow(/status\.json/i);
  });

  it("applies the same answer-bearing response rule in reference:check without writing into work_area", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const divPage = makeFinalPage();
    divPage.sections[0].items[0] = {
      n: 1,
      printed: "13 / 3 =",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [13, 3] },
      responses: [
        { position: "after_equals", cue: null, answer: "4 R1", answer_source: "reader" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
      ],
    };
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(divPage, null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );

    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo });
    const saved = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8"));
    expect(saved.sections[0].items[0].responses[0].answer).toBe("4 R1");
    expect(saved.sections[0].items[0].responses[0].answer_source).toBe("computed");
    expect(saved.sections[0].items[0].responses[1].answer).toBeNull();
    expect(saved.sections[0].items[0].responses[1].answer_source).toBe("unchecked");
  });

  it("refuses to write when status.json has colliding source_ref values or the file on disk holds a different source_ref", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-col-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-col-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const rec = makeFinalPage();
    rec.source_ref = "demo-x:M:3a";
    writeFileSync(join(finalDir, "demo-x-M-3a.json"), JSON.stringify(rec, null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify(
        {
          "demo-x:M:3a": "machine_read",
          "demo:x-M:3a": "machine_read",
        },
        null,
        2,
      ),
    );

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "demo-x:M:3a", repoRoot: repo }),
    ).toThrow(/map to|collid/i);

    const statusAfter = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(statusAfter["demo-x:M:3a"]).toBe("machine_read");
  });
});

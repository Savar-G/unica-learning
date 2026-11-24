import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunCli } from "@/lib/reference-kit/read-cli";
import type { PageRecord, ReferenceRecord, TranscriptStatus } from "@/lib/reference-record";
import { contentSha256, settleStatus } from "./record";
import { add, KEY, makeContents, makeExample, makeItem, makePage } from "./test-records";
import type { TopicMethodRecord } from "./types";
import { approveTopicMethod, draftTopicMethod, listGaps, type DraftOptions } from "./workflow";

let root: string;
let recordsDir: string;
let methodsDir: string;
let repoRoot: string;
let calls: number;
let sentenceText: string;
let duringRun: () => void;
const now = (): Date => new Date("2026-01-02T03:04:05.000Z");

const runCli: RunCli = async () => {
  calls += 1;
  duringRun();
  return {
    code: 0,
    stdout: JSON.stringify({ sentences: [{ kind: "introduces", text: sentenceText, cites: ["demo:Z:11a"] }] }),
    stderr: "",
  };
};

function writeRecords(records: ReferenceRecord[], statuses: Record<string, TranscriptStatus> = {}): void {
  rmSync(recordsDir, { recursive: true, force: true });
  mkdirSync(recordsDir);
  const status: Record<string, string> = {};
  for (const record of records) {
    status[record.source_ref] = statuses[record.source_ref] ?? "double_read";
    writeFileSync(join(recordsDir, `${record.source_ref.replaceAll(":", "-")}.json`), JSON.stringify(record));
  }
  writeFileSync(join(recordsDir, "status.json"), JSON.stringify(status));
}

function standardPages(): PageRecord[] {
  return [
    makePage("11a", { examples: [makeExample(add(45, 3))], items: [makeItem(1, add(23, 4))] }),
    makePage("11b", { items: [makeItem(1, add(28, 4))] }),
  ];
}

const filePath = (): string => join(methodsDir, "demo-Z-topic-1.json");
const stored = (): TopicMethodRecord => JSON.parse(readFileSync(filePath(), "utf8")) as TopicMethodRecord;
const store = (record: unknown): void => writeFileSync(filePath(), JSON.stringify(record));
const draft = (extra: Partial<DraftOptions> = {}): ReturnType<typeof draftTopicMethod> =>
  draftTopicMethod({ key: KEY, recordsDir, methodsDir, repoRoot, runCli, ...extra });
const approve = (...by: string[]): ReturnType<typeof approveTopicMethod> =>
  approveTopicMethod({ key: KEY, recordsDir, methodsDir, repoRoot, by, now });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "unica-method-test-"));
  recordsDir = join(root, "final");
  methodsDir = join(root, "methods");
  repoRoot = join(root, "repo");
  mkdirSync(repoRoot);
  calls = 0;
  sentenceText = "The page adds a small number.";
  duringRun = () => {};
  writeRecords([...standardPages(), makeContents()]);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("draft", () => {
  it("writes one drafted record to a private file", async () => {
    const result = await draft();
    expect(result).toMatchObject({ ok: true, problems: [] });
    expect(stored()).toMatchObject({ kind: "topic_method", ...KEY, status: "drafted", approvals: [] });
    expect(stored().summary[0].text).toBe(sentenceText);
    expect(stored().evidence.gaps).toHaveLength(1);
    expect(statSync(methodsDir).mode & 0o777).toBe(0o700);
    expect(statSync(filePath()).mode & 0o777).toBe(0o600);
    expect(readdirSync(methodsDir)).toEqual(["demo-Z-topic-1.json"]);
  });

  it("writes nothing when the model gives no valid summary", async () => {
    sentenceText = "It has 99 parts.";
    const result = await draft();
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("number 99");
    expect(readdirSync(root).includes("methods") ? readdirSync(methodsDir) : []).toEqual([]);
  });

  it("makes a record with no summary and no model call for a topic with no pages", async () => {
    writeRecords([makeContents()]);
    expect((await draft()).ok).toBe(true);
    expect([calls, stored().summary, stored().summary_draft]).toEqual([0, [], null]);
  });

  it.each([
    ["the methods folder is in the repository", (): Partial<DraftOptions> => ({ methodsDir: join(repoRoot, "out") })],
    ["the records folder is in the repository", (): Partial<DraftOptions> => {
      const inside = join(repoRoot, "final");
      mkdirSync(inside);
      return { recordsDir: inside };
    }],
    ["the methods folder is in another git checkout", (): Partial<DraftOptions> => {
      mkdirSync(join(root, "other", ".git"), { recursive: true });
      return { methodsDir: join(root, "other", "out") };
    }],
  ])("stops before the model when %s", async (_name, make) => {
    const result = await draft(make());
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("Refusing");
    expect(calls).toBe(0);
  });

  it("does not write through a symlink", async () => {
    mkdirSync(methodsDir);
    const target = join(root, "target.json");
    writeFileSync(target, "{}");
    symlinkSync(target, filePath());
    for (const extra of [{}, { replace: true }]) {
      expect((await draft(extra)).ok).toBe(false);
    }
    expect(readFileSync(target, "utf8")).toBe("{}");
    expect(calls).toBe(0);
  });

  it.each([
    ["invalid UTF-8", Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d])],
    ["the replacement character", Buffer.from(JSON.stringify({ ...standardPages()[0], readers: ["\uFFFD"] }))],
    ["a null character", Buffer.from(JSON.stringify({ ...standardPages()[0], readers: ["\u0000"] }))],
    ["half of a character", Buffer.from(JSON.stringify({ ...standardPages()[0], readers: ["\uD800"] }))],
  ])("stops on a page record with %s", async (_name, bytes) => {
    writeFileSync(join(recordsDir, "demo-Z-11a.json"), bytes);
    const result = await draft();
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("demo-Z-11a.json");
    expect(calls).toBe(0);
  });

  it("stops on a page with no known status rule: single_read on a double_read page", async () => {
    writeRecords([makePage("11a", { single_read: ["topic.title"] }), makeContents()]);
    expect((await draft()).problems.join()).toContain("single_read is only allowed");
  });
});

describe("a person's work is kept (M6)", () => {
  const edit = (): TopicMethodRecord => {
    const record = stored();
    record.summary[0].text = "A person wrote this.";
    store(record);
    return record;
  };

  it("replaces a draft that no person changed", async () => {
    await draft();
    sentenceText = "The page adds.";
    expect((await draft()).ok).toBe(true);
    expect(stored().summary[0].text).toBe("The page adds.");
  });

  it.each<[string, () => Promise<void> | void, string]>([
    ["a summary that a person changed", () => void edit(), "changed by a person"],
    ["an approved record", async () => void (await approve("Ann", "Bo")), "approved by"],
    ["a record with one approval", async () => void (await approve("Ann")), "approved by"],
    ["a summary whose draft note was removed", () => store({ ...stored(), summary_draft: null }), "changed by a person"],
    ["a file that is not a valid record any more", () => writeFileSync(filePath(), "{ broken"), "not a valid method record"],
    ["a file with an extra field", () => store({ ...stored(), note: "x" }), "not a valid method record"],
  ])("refuses to write over %s, and does so with --replace", async (_name, prepare, text) => {
    await draft();
    await prepare();
    const before = readFileSync(filePath(), "utf8");
    calls = 0;
    const refused = await draft();
    expect([refused.ok, calls]).toEqual([false, 0]);
    expect(refused.problems.join()).toContain(text);
    expect(refused.problems.join()).toContain("--replace");
    expect(readFileSync(filePath(), "utf8")).toBe(before);

    sentenceText = "The page adds.";
    expect((await draft({ replace: true })).ok).toBe(true);
    expect(stored().summary[0].text).toBe(sentenceText);
    expect([stored().status, stored().approvals]).toEqual(["drafted", []]);
  });

  it("keeps the approvals when a new draft has exactly the approved content", async () => {
    await draft();
    await approve("Ann", "Bo");
    expect((await draft({ replace: true })).ok).toBe(true);
    expect(stored().status).toBe("approved");
  });

  it("does not overwrite an edit that a person saves while the model runs", async () => {
    await draft();
    duringRun = () => void edit();
    for (const extra of [{}, { replace: true }]) {
      const result = await draft(extra);
      expect(result.problems.join()).toContain("changed while");
      expect(stored().summary[0].text).toBe("A person wrote this.");
      store({ ...stored(), summary: [{ ...stored().summary[0], text: sentenceText }] });
    }
  });

  it("never writes over the record of another topic, not even with --replace", async () => {
    await draft();
    store({ ...stored(), topic: 2 });
    for (const extra of [{}, { replace: true }, { keepSummary: true }]) {
      expect((await draft(extra)).problems.join()).toContain('holds "demo:Z:topic-2"');
    }
    expect(stored().topic).toBe(2);
  });

  it("makes new facts and keeps the summary with --keep-summary", async () => {
    await draft();
    edit();
    await approve("Ann", "Bo");
    const pages = standardPages();
    pages[1].sections[0].items.push(makeItem(2, add(29, 4)));
    writeRecords([...pages, makeContents()]);
    calls = 0;
    const result = await draft({ keepSummary: true });
    expect([result.ok, calls]).toEqual([true, 0]);
    expect(result.lines.join("\n")).toContain("approved -> drafted");
    expect(stored().summary[0].text).toBe("A person wrote this.");
    expect(stored().evidence.sheets[1].questions).toBe(2);
    expect([stored().status, stored().approvals]).toEqual(["drafted", []]);
    expect((await draft()).problems.join()).toContain("changed by a person");
  });

  it("refuses --keep-summary when the kept summary does not fit the new facts, or there is none", async () => {
    expect((await draft({ keepSummary: true })).problems.join()).toContain("no method record");
    await draft();
    writeRecords([standardPages()[1], makeContents()]);
    const before = readFileSync(filePath(), "utf8");
    expect((await draft({ keepSummary: true })).problems.join()).toContain("has no photo");
    expect((await draft({ keepSummary: true, replace: true })).ok).toBe(false);
    expect(readFileSync(filePath(), "utf8")).toBe(before);
  });
});

describe("approve (M6)", () => {
  beforeEach(async () => {
    await draft();
  });

  it("needs two different names and stores the digest of the exact content", async () => {
    expect((await approve("Ann")).ok).toBe(true);
    expect(stored().status).toBe("drafted");
    expect((await approve("Bo")).ok).toBe(true);
    const record = stored();
    expect(record.status).toBe("approved");
    expect(record.approvals).toEqual([
      { by: "Ann", at: "2026-01-02T03:04:05.000Z", content_sha256: contentSha256(record) },
      { by: "Bo", at: "2026-01-02T03:04:05.000Z", content_sha256: contentSha256(record) },
    ]);
  });

  it.each([["Ann", "Ann"], ["Ann", " ann "], ["Ann Lee", "ANN  LEE"], ["Ann", "A\u200Bnn"], ["\uFF21nn", "Ann"]])(
    "counts %j and %j as one person",
    async (a, b) => {
      await approve(a, b);
      expect(stored().status).toBe("drafted");
      expect(stored().approvals).toHaveLength(1);
    },
  );

  it.each([[[]], [[""]], [["  "]], [["\u200B"]], [["A\nB"]], [["A\uFFFD"]], [["A\uD800"]]])(
    "refuses the names %j and changes nothing",
    async (names) => {
      const before = readFileSync(filePath(), "utf8");
      expect((await approve(...names)).ok).toBe(false);
      expect(readFileSync(filePath(), "utf8")).toBe(before);
    },
  );

  it.each<[string, (r: TopicMethodRecord) => void]>([
    ["a word of the summary", (r) => { r.summary[0].text += " More."; }],
    ["a citation", (r) => { r.summary[0].cites.push("demo:Z:11b"); }],
    ["a fact", (r) => { r.evidence.sheets[0].questions = 9; }],
    ["a gap", (r) => { r.evidence.gaps = []; }],
    ["a page digest", (r) => { r.evidence.pages[0].sha256 = "0".repeat(64); }],
    ["a page status", (r) => { r.evidence.pages[0].status = "human_checked"; }],
    ["the draft note", (r) => { r.summary_draft = null; }],
  ])("is drafted again after a change of %s", async (_name, change) => {
    await approve("Ann", "Bo");
    const record = stored();
    expect(settleStatus(record).status).toBe("approved");
    change(record);
    expect(settleStatus(record)).toMatchObject({ status: "drafted", approvals: [] });
  });

  it("does not trust a status or an approval that a person wrote in the file", async () => {
    store({ ...stored(), status: "approved" });
    expect(settleStatus(stored()).status).toBe("drafted");
    await approve("Ann");
    expect(stored().status).toBe("drafted");
  });

  it("keeps an approval only while the content stays the same", async () => {
    await approve("Ann");
    const record = stored();
    record.summary[0].text = "The page adds.";
    store(record);
    await approve("Bo");
    expect([stored().status, stored().approvals.map((a) => a.by)]).toEqual(["drafted", ["Bo"]]);
  });

  it.each<[string, () => void, string]>([
    ["a page record changed", () => writeRecords([{ ...standardPages()[0], readers: ["x"] }, standardPages()[1], makeContents()]), "demo:Z:11a changed"],
    ["a page status changed", () => writeRecords([...standardPages(), makeContents()], { "demo:Z:11a": "human_checked" }), "demo:Z:11a changed"],
    ["a page was added", () => writeRecords([...standardPages(), makePage("12a"), makeContents()]), "demo:Z:12a was added"],
    ["a page was removed", () => writeRecords([standardPages()[0], makeContents()]), "demo:Z:11b was removed"],
    ["the contents record changed", () => writeRecords([...standardPages(), makeContents(undefined, { readers: ["x"] })]), "demo:Z:contents changed"],
    ["a fact was changed by hand", () => { const r = stored(); r.evidence.sheets[0].questions = 9; store(r); }, "facts are not what code computes"],
  ])("refuses to approve after %s", async (_name, change, text) => {
    change();
    const result = await approve("Ann", "Bo");
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain(text);
    expect(stored().approvals).toEqual([]);
  });

  it("refuses to approve a summary that breaks a rule", async () => {
    const record = stored();
    record.summary[0].cites = [];
    store(record);
    expect((await approve("Ann", "Bo")).problems.join()).toContain("needs a citation");
  });

  it("says when an approval does not change anything, and can run again", async () => {
    await approve("Ann", "Bo");
    const before = readFileSync(filePath(), "utf8");
    expect((await approve("Ann")).ok).toBe(true);
    expect(readFileSync(filePath(), "utf8")).toBe(before);
  });

  it("refuses when there is no record", async () => {
    rmSync(filePath());
    expect((await approve("Ann")).problems.join()).toContain("no method record");
  });
});

describe("gaps (M5)", () => {
  const gaps = (extra: Record<string, unknown> = {}): ReturnType<typeof listGaps> =>
    listGaps({ source: "demo", level: "Z", recordsDir, repoRoot, includeMachineRead: false, ...extra });

  it("lists the gaps of each topic of the level", async () => {
    writeRecords([...standardPages(), makePage("13a", { title: "Joining Pebbles 2", items: [makeItem(1, { kind: "notation", latex: "x" })] }), makeContents()]);
    const result = await gaps();
    expect(result).toMatchObject({ ok: true, problems: [] });
    const text = result.lines.join("\n");
    expect(text).toContain("topic 1");
    expect(text).toContain("no method: arith add 2x1 horizontal carries=ones_to_tens (demo:Z:11b)");
    expect(text).toContain("no photo: demo:Z:12a, demo:Z:12b");
    expect(text).toContain("topic 2");
    expect(text).toContain("step not known: page demo:Z:13a");
    expect(result.lines.at(-1)).toContain("2 topics, 1 step with no method, 1 page with a step that is not known");
  });

  it("names the withheld pages", async () => {
    writeRecords([...standardPages(), makeContents()], { "demo:Z:11b": "machine_read" });
    const text = (await gaps()).lines.join("\n");
    expect(text).toContain("no facts (machine_read): demo:Z:11b");
    expect(text).not.toContain("no method:");
  });

  it("lists the topics that it can, names the others and fails", async () => {
    writeRecords([...standardPages(), makePage("13a"), makeContents()]);
    const result = await gaps();
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("demo:Z:13a prints the title of topic 1");
  });

  it("says when the level has no pages with facts", async () => {
    writeRecords([makeContents()]);
    expect((await gaps()).lines).toContain("  no pages with facts");
  });

  it("gives the status that each method record has against the page records of now", async () => {
    const statusLine = async (): Promise<string | undefined> =>
      (await gaps({ methodsDir })).lines.find((l) => l.startsWith("  method record:"));
    expect(await statusLine()).toBe("  method record: none");
    await draft();
    expect(await statusLine()).toBe("  method record: drafted");
    await approve("Ann", "Bo");
    expect(await statusLine()).toBe("  method record: approved");
    writeRecords([{ ...standardPages()[0], readers: ["x"] }, standardPages()[1], makeContents()]);
    expect(await statusLine()).toBe("  method record: drafted (out of date: page record demo:Z:11a changed)");
    writeRecords([...standardPages(), makeContents()]);
    expect(await statusLine()).toBe("  method record: approved");
    const record = stored();
    record.summary[0].text += " More.";
    store(record);
    expect(await statusLine()).toBe("  method record: drafted");
    writeFileSync(filePath(), "{");
    expect(await statusLine()).toContain("  method record: not valid");
    store({ ...record, topic: 2 });
    expect(await statusLine()).toContain("  method record: not valid");
  });

  it("fails for a level with no contents record", async () => {
    expect((await gaps({ level: "Y" })).problems.join()).toContain("no contents record");
  });
});

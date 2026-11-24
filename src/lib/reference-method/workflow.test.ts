import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
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
import { withTopicLock } from "./files";
import { approveTopicMethod, draftTopicMethod, listGaps, showTopicMethod, type DraftOptions } from "./workflow";

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
  draftTopicMethod({ key: KEY, recordsDir, methodsDir, repoRoot, runCli, now, ...extra });
const show = (extra: Partial<DraftOptions> = {}): ReturnType<typeof showTopicMethod> =>
  showTopicMethod({ key: KEY, recordsDir, methodsDir, repoRoot, now, ...extra });
// Each person reads the record and approves what they read.
async function approve(...people: string[]): ReturnType<typeof approveTopicMethod> {
  let result: Awaited<ReturnType<typeof approveTopicMethod>> | undefined;
  for (const by of people) {
    const shown = await show();
    const digest = shown.lines.at(-1)?.replace("digest: ", "") ?? "";
    result = shown.ok ? await approveTopicMethod({ key: KEY, recordsDir, methodsDir, repoRoot, now, by, digest }) : shown;
  }
  return result ?? { ok: false, lines: [], problems: [] };
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "unica-method-test-")));
  recordsDir = join(root, "final");
  methodsDir = join(root, "methods");
  repoRoot = join(root, "repo");
  mkdirSync(repoRoot);
  calls = 0;
  sentenceText = "[11a] adds a small number.";
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
    sentenceText = "[11a] has 99 parts.";
    const result = await draft();
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("no digits outside");
    expect(readdirSync(methodsDir)).toEqual([]);
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
    ["the methods folder is a symlink", (): Partial<DraftOptions> => {
      mkdirSync(join(root, "real"), { mode: 0o755 });
      symlinkSync(join(root, "real"), methodsDir);
      return {};
    }],
    ["the methods folder passes through a symlink", (): Partial<DraftOptions> => {
      mkdirSync(join(root, "real", "methods"), { recursive: true });
      symlinkSync(join(root, "real"), join(root, "link"));
      return { methodsDir: join(root, "link", "methods") };
    }],
    ["the methods folder is a broken symlink", (): Partial<DraftOptions> => {
      symlinkSync(join(root, "nothing"), methodsDir);
      return {};
    }],
    ["the methods folder is the records folder", (): Partial<DraftOptions> => ({ methodsDir: recordsDir })],
    ["the methods folder is in the records folder", (): Partial<DraftOptions> => ({ methodsDir: join(recordsDir, "methods") })],
    ["the records folder is in the methods folder", (): Partial<DraftOptions> => ({ methodsDir: root })],
    ["the records folder is a symlink to a folder in the methods folder", (): Partial<DraftOptions> => {
      mkdirSync(methodsDir);
      renameSync(recordsDir, join(methodsDir, "final"));
      symlinkSync(join(methodsDir, "final"), recordsDir);
      return {};
    }],
  ])("stops every command, before the model, when %s", async (_name, make) => {
    const extra = make();
    const folders = { recordsDir, methodsDir, repoRoot, ...extra };
    for (const run of [
      () => draft(extra),
      () => show(extra),
      () => approveTopicMethod({ key: KEY, now, by: "Ann", digest: "", ...folders }),
    ]) {
      const result = await run();
      expect(result.ok).toBe(false);
      expect(result.problems.join()).toContain("Refusing --");
      expect(result.problems.join()).not.toContain("--out");
    }
    if (extra.recordsDir) expect((await listGaps({ source: "demo", level: "Z", includeMachineRead: false, ...folders })).ok).toBe(false);
    expect(calls).toBe(0);
    if (existsSync(join(root, "real"))) expect(readdirSync(join(root, "real"), { recursive: true })).not.toContain("demo-Z-topic-1.json");
  });

  it("does not change the rights of the target of a symlink", async () => {
    mkdirSync(join(root, "real"), { mode: 0o755 });
    symlinkSync(join(root, "real"), methodsDir);
    await draft();
    expect(statSync(join(root, "real")).mode & 0o777).toBe(0o755);
  });

  it("stops when a page record is in the file of another page", async () => {
    const [a, b] = ["demo-Z-11a.json", "demo-Z-11b.json"].map((n) => join(recordsDir, n));
    const [textA, textB] = [readFileSync(a, "utf8"), readFileSync(b, "utf8")];
    writeFileSync(a, textB);
    writeFileSync(b, textA);
    expect((await draft()).problems).toEqual([
      'demo-Z-11a.json holds "demo:Z:11b", which belongs in demo-Z-11b.json',
      'demo-Z-11b.json holds "demo:Z:11a", which belongs in demo-Z-11a.json',
    ]);
    expect(calls).toBe(0);
  });

  it("writes nothing when a page record changes while the model runs", async () => {
    duringRun = () => writeRecords([{ ...standardPages()[0], readers: ["x"] }, standardPages()[1], makeContents()]);
    expect((await draft()).problems.join()).toContain("page records changed while the model ran");
    expect(readdirSync(methodsDir)).toEqual([]);
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
    record.summary[0].text = "[11a]: a person wrote this.";
    store(record);
    return record;
  };

  it("replaces a draft that no person changed", async () => {
    await draft();
    sentenceText = "[11a] adds.";
    expect((await draft()).ok).toBe(true);
    expect(stored().summary[0].text).toBe("[11a] adds.");
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

    sentenceText = "[11a] adds.";
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
      expect(stored().summary[0].text).toBe("[11a]: a person wrote this.");
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
    expect(stored().summary[0].text).toBe("[11a]: a person wrote this.");
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

  it("needs the digest of exactly the shown content, for each person", async () => {
    const options = { key: KEY, recordsDir, methodsDir, repoRoot, now, by: "Ann" };
    const seen = (await show()).lines.at(-1)?.replace("digest: ", "") ?? "";
    sentenceText = "[11a] takes the second number from the first.";
    await draft();
    const before = readFileSync(filePath(), "utf8");
    for (const digest of [seen, "", "0".repeat(64), contentSha256(stored()).toUpperCase(), contentSha256(stored()).slice(0, 63)]) {
      const refused = await approveTopicMethod({ ...options, digest });
      expect([refused.ok, refused.problems.join()]).toEqual([false, expect.stringContaining("--digest is not the digest")]);
    }
    expect(readFileSync(filePath(), "utf8")).toBe(before);
    expect((await approveTopicMethod({ ...options, digest: contentSha256(stored()) })).ok).toBe(true);
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

  it.each([
    ["Ann", "Ann"], ["Ann", " ann "], ["Ann Lee", "ANN  LEE"], ["Ann Lee", "Ann\u00A0Lee"], ["Ann", "A\u200Bnn"], ["\uFF21nn", "Ann"],
    ["Ann", "A\u034Fnn"], ["Ann", "Ann\uFE0F"], ["Ann", "Ann\u3164"], ["Ann", "\u{E0041}Ann"], ["Ann", "An\u115Fn"],
    ["Stra\u00DFe", "STRASSE"], ["\u039F\u03A3", "\u03BF\u03C3"], ["\u03BF\u03C2", "\u03BF\u03C3"], ["Zo\u00EB", "Zoe\u0308"],
  ])(
    "counts %j and %j as one person",
    async (a, b) => {
      await approve(a, b);
      expect(stored().status).toBe("drafted");
      expect(stored().approvals).toHaveLength(1);
    },
  );

  it.each(["", "  ", "\u200B", "\u034F", "A\nB", "A\uFFFD", "A\uD800"])("refuses the name %j and changes nothing", async (name) => {
    const before = readFileSync(filePath(), "utf8");
    expect((await approve(name)).problems.join()).toContain("--by");
    expect(readFileSync(filePath(), "utf8")).toBe(before);
  });

  it.each([
    ["by", "A\u034Fnn", "by must be a name"], ["by", " Ann", "by must be a name"], ["by", "A\u200Bnn", "by must be a name"], ["by", "", "by must be a name"],
    ["at", "yesterday", "instant in UTC"], ["at", "2026-01-02", "instant in UTC"], ["at", "2026-01-02T03:04:05.000+01:00", "instant in UTC"],
    ["at", "2026-02-30T03:04:05.000Z", "instant in UTC"], ["at", "", "instant in UTC"], ["at", 5, "instant in UTC"],
  ])("takes no approval from a file whose %s is %j", async (field, value, text) => {
    await approve("Ann", "Bo");
    const record = stored();
    store({ ...record, approvals: [{ ...record.approvals[0], [field]: value }, record.approvals[1]] });
    expect((await show()).problems.join()).toContain(text);
  });

  it.each<[string, (r: TopicMethodRecord) => void]>([
    ["a word of the summary", (r) => { r.summary[0].text += " More."; }],
    ["a citation", (r) => { r.summary[0].cites.push("demo:Z:11b"); }],
    ["a fact", (r) => { r.evidence.sheets[0].questions = 9; }],
    ["a gap", (r) => { r.evidence.gaps = []; }],
    ["a hint", (r) => { r.evidence.gaps[0].hints.push({ page: "demo:Z:11b", at: "examples[0]", kind: "example" }); }],
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
    record.summary[0].text = "[11a] adds.";
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
    const again = await approve("Ann");
    expect([again.ok, again.lines.join()]).toEqual([true, expect.stringContaining("approved it before")]);
    expect(readFileSync(filePath(), "utf8")).toBe(before);
  });

  it("refuses when there is no record, and makes no folder", async () => {
    rmSync(methodsDir, { recursive: true });
    const options = { key: KEY, recordsDir, methodsDir, repoRoot, now, by: "Ann", digest: "x" };
    expect((await approveTopicMethod(options)).problems.join()).toContain("no method record");
    expect(existsSync(methodsDir)).toBe(false);
  });
});

describe("gaps (M5)", () => {
  const gaps = (extra: Record<string, unknown> = {}): ReturnType<typeof listGaps> =>
    listGaps({ source: "demo", level: "Z", recordsDir, repoRoot, includeMachineRead: false, ...extra });

  it("lists the gaps of each topic of the level", async () => {
    const [a, b] = standardPages();
    b.sections[0].scaffolds = [{ kind: "caption", text: "Use a pencil.", applies_to: "all" }];
    writeRecords([a, b, makePage("13a", { title: "Joining Pebbles 2", items: [makeItem(1, { kind: "notation", latex: "x" })] }), makeContents()]);
    const result = await gaps();
    expect(result).toMatchObject({ ok: true, problems: [] });
    const text = result.lines.join("\n");
    expect(text).toContain("topic 1");
    expect(text).toContain("no method: arith add 2x1 horizontal carries=ones_to_tens (demo:Z:11b)");
    expect(text).toContain("  no photo: demo:Z:12a, demo:Z:12b; in no topic: none");
    expect(text).toContain("  gaps: 1; pages with facts: demo:Z:11a, demo:Z:11b; no facts (machine_read): none");
    expect(text).toContain("topic 2");
    expect(text).toContain("step not known: page demo:Z:13a");
    expect(text).toContain("look at demo:Z:11b sections[0].scaffolds[0] (caption)");
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
    expect((await gaps()).lines).toContain("  gaps: 0; pages with facts: none; no facts (machine_read): none");
  });

  it("fails for a level with no contents record", async () => {
    expect((await gaps({ level: "Y" })).problems.join()).toContain("no contents record");
  });
});

describe("show (Y3)", () => {
  // Every text and number of the content, as a person would look for it.
  function leaves(value: unknown, skip: readonly string[] = []): string[] {
    if (Array.isArray(value)) return value.flatMap((v) => leaves(v, skip));
    if (typeof value === "object" && value !== null) {
      return Object.entries(value).flatMap(([key, v]) => (skip.includes(key) ? [] : leaves(v, skip)));
    }
    return typeof value === "string" || typeof value === "number" ? [String(value)] : [];
  }

  it("prints every fact, gap, hint and sentence of the record, and its digest in the last line", async () => {
    const [a, b] = standardPages();
    a.sections[0].scaffolds = [{ kind: "number_strip", applies_to: "all", values: [1, 2] }];
    b.sections[0].items = [makeItem(1, add(28, 4), "vertical"), makeItem(2, add(0.5, 2), "bracket")];
    b.sections[0].scaffolds = [{ kind: "caption", text: "Use a pencil.", applies_to: "all" }];
    writeRecords([a, b, makePage("12a", { title: "Pebbles", examples: "unclear" }), makeContents()], { "demo:Z:11b": "machine_read" });
    await draft({ includeMachineRead: true });
    await approve("Ann");
    const { lines, ok } = await show();
    expect(ok).toBe(true);
    const text = lines.join("\n");
    const { evidence, summary_draft, approvals, status } = stored();
    expect(evidence.gaps.some((g) => g.hints.length > 0)).toBe(true);
    // The id of a step holds its features.
    for (const leaf of leaves([evidence, summary_draft, status, approvals[0].by, approvals[0].at], ["features"])) {
      expect([text.includes(leaf) || text.includes(leaf.replaceAll("_", " ")), leaf]).toEqual([true, leaf]);
    }
    expect(text).toContain("introduces: Z:11a adds a small number.");
    expect(text).toContain("its printed title differs");
    expect(text).toContain("facts from machine_read records: included");
    expect(lines.filter((l) => l.includes("[machine_read: demo:Z:11b]")).length).toBeGreaterThan(5);
    expect(lines.at(-1)).toBe(`digest: ${contentSha256(stored())}`);
  });

  it("prints, for each procedure, the exact example that it rests on", async () => {
    const example = makeExample(add(45, 3), "horizontal", { steps: [{ n: 1, shows: "partial_sum", printed: "5 + 3 = 8" }] });
    writeRecords([makePage("11a", { items: [makeItem(1, add(23, 4))], examples: [makeExample(null), example] }), makePage("12a", { examples: [example] }), makeContents()]);
    const steps = ["arith add 2x1 horizontal"];
    await draft({
      runCli: async () => ({
        code: 0,
        stderr: "",
        stdout: JSON.stringify({ sentences: [
          { kind: "procedure", text: "[11a] adds the ones: `5 + 3`.", cites: ["demo:Z:11a"], steps },
          { kind: "procedure", text: "Perhaps the tens come next.", cites: [], steps, guess: true },
        ] }),
      }),
    });
    const { lines } = await show();
    const at = lines.findIndex((l) => l.includes("1. procedure"));
    expect(lines.slice(at, -1).map((l) => l.trim())).toEqual([
      "1. procedure: Z:11a adds the ones: 5 + 3.",
      "cites: demo:Z:11a",
      "steps: arith add 2x1 horizontal",
      "rests on demo:Z:11a examples[1]:",
      "### Example 2 (top, sequence)",
      '- [horizontal] `{"kind":"arith","op":"add","operands":[45,3]}`',
      "- Steps:",
      "1. [partial_sum] `5 + 3 = 8`",
      "- Marks:",
      "- `arrow`",
      "2. procedure (guess): Perhaps the tens come next.",
      "cites: none",
      "steps: arith add 2x1 horizontal",
    ]);
  });

  it("changes nothing, and shows no record that is out of date or breaks a rule", async () => {
    expect((await show()).problems.join()).toContain("no method record");
    await draft();
    const before = readFileSync(filePath(), "utf8");
    expect((await show()).ok).toBe(true);
    store({ ...stored(), summary: [{ ...stored().summary[0], text: "[11a] has 3 parts." }] });
    expect((await show()).problems.join()).toContain("no digits outside");
    writeFileSync(filePath(), before);
    writeRecords([{ ...standardPages()[0], readers: ["x"] }, standardPages()[1], makeContents()]);
    const stale = await show();
    expect([stale.ok, stale.lines]).toEqual([false, []]);
    expect(stale.problems.join()).toContain("demo:Z:11a changed");
    expect(readFileSync(filePath(), "utf8")).toBe(before);
  });
});

describe("the lock of a topic (Y4)", () => {
  const lockPath = (): string => join(methodsDir, ".demo-Z-topic-1.json.lock");

  it("lets one of two commands at the same time run, and tells the other one", async () => {
    await draft();
    const digest = contentSha256(stored());
    const one = (by: string): ReturnType<typeof approveTopicMethod> =>
      approveTopicMethod({ key: KEY, recordsDir, methodsDir, repoRoot, now, by, digest });
    const results = await Promise.all([one("Ann"), one("Bo")]);
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    const told = results.find((r) => !r.ok)?.problems.join() ?? "";
    expect(told).toContain("2026-01-02T03:04:05.000Z approve");
    expect(told).toContain(`rm "${lockPath()}"`);
    expect(stored().approvals).toHaveLength(1);
    expect((await one("Ann")).ok && (await one("Bo")).ok).toBe(true);
    expect(stored().approvals.map((a) => a.by).sort()).toEqual(["Ann", "Bo"]);
  });

  it("holds the lock while the model runs and removes it at the end, also after a stop", async () => {
    let during: string[] = [];
    let refused: Awaited<ReturnType<typeof draft>> | undefined;
    await draft({
      runCli: async (...args) => {
        during = readdirSync(methodsDir);
        refused = await draft({ replace: true });
        return runCli(...args);
      },
    });
    expect(during).toEqual([".demo-Z-topic-1.json.lock"]);
    expect(refused?.problems.join()).toContain("another command holds this topic");
    expect(readdirSync(methodsDir)).toEqual(["demo-Z-topic-1.json"]);
    await expect(
      withTopicLock({ key: KEY, methodsDir, repoRoot, now }, "test", () => Promise.reject(new Error("broken"))),
    ).rejects.toThrow("broken");
    expect(readdirSync(methodsDir)).toEqual(["demo-Z-topic-1.json"]);
  });

  it("stops at a stale lock, names its time, and writes nothing", async () => {
    await draft();
    const before = readFileSync(filePath(), "utf8");
    for (const [content, named] of [["2026-01-01T00:00:00.000Z draft (process 1, x)", "2026-01-01T00:00:00.000Z"], ["", `a lock of ${new Date().getUTCFullYear()}`]]) {
      writeFileSync(lockPath(), content);
      const result = await draft({ replace: true });
      expect([result.ok, result.problems.join()]).toEqual([false, expect.stringContaining(named)]);
      expect(readFileSync(lockPath(), "utf8")).toBe(content);
    }
    expect(readFileSync(filePath(), "utf8")).toBe(before);
    rmSync(lockPath());
    expect((await draft()).ok).toBe(true);
  });

  it("does not stop a command on another topic, and does not remove a lock that is not its own", async () => {
    const key = { ...KEY, topic: 2 };
    let inner: Awaited<ReturnType<typeof draft>> | undefined;
    await withTopicLock({ key, methodsDir, repoRoot, now }, "test", async () => {
      inner = await draft();
      writeFileSync(join(methodsDir, ".demo-Z-topic-2.json.lock"), "another command");
      return inner;
    });
    expect(inner?.ok).toBe(true);
    expect(readFileSync(join(methodsDir, ".demo-Z-topic-2.json.lock"), "utf8")).toBe("another command");
  });
});

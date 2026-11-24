import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHECKED_DIGESTS_FILE } from "./checked-digests";
import {
  deepEqualJson,
  findUnstorableTextPath,
  formatImportResult,
  importReferenceRecords,
  MAX_REFERENCE_PHOTO_BYTES,
  type ExistingReferenceRow,
  type ReferenceRow,
  type ReferenceStore,
} from "./import";
import { checkPathOwnership } from "./import-replace";
import type { ContentsRecord, PageRecord } from "./types";

function makePage(sourceRef: string, topicTitle = "Adding small numbers"): PageRecord {
  return {
    kind: "page",
    source_ref: sourceRef,
    topic: { title: topicTitle, number: 1 },
    sections: [
      {
        instruction: "Find each sum.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "3 + 4 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [3, 4] },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: "7",
                answer_source: "computed",
              },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  };
}

function makeContents(sourceRef: string): ContentsRecord {
  return {
    kind: "contents",
    source_ref: sourceRef,
    topics: [
      {
        n: 1,
        title: "Counting forward",
        sheets: [1, 10],
        std_time_min: [2, 3],
      },
    ],
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// A stored row also has the columns the import never sends: id, created_at and updated_at.
type StoredRow = ReferenceRow & { id?: string; created_at?: string; updated_at?: string };

class MemoryReferenceStore implements ReferenceStore {
  rows = new Map<string, StoredRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  calls: string[] = [];
  // Injected clock: each write takes the next tick as its time.
  private tick = 0;
  private now(): string {
    this.tick += 1;
    return `t${this.tick}`;
  }

  async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
    this.calls.push(`findExisting:${sourceRefs.join(",")}`);
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
    this.calls.push(`insertRow:${row.source_ref}`);
    if (this.rows.has(row.source_ref)) {
      return false;
    }
    const at = this.now();
    this.rows.set(row.source_ref, {
      ...structuredClone(row),
      id: `id-${row.source_ref}`,
      created_at: at,
      updated_at: at,
    });
    return true;
  }

  async updateRow(row: ReferenceRow): Promise<boolean> {
    this.calls.push(`updateRow:${row.source_ref}`);
    const prev = this.rows.get(row.source_ref);
    if (!prev) return false;
    this.rows.set(row.source_ref, {
      ...prev,
      kind: row.kind,
      path: row.path,
      transcript: structuredClone(row.transcript),
      transcript_status: row.transcript_status,
      updated_at: this.now(),
    });
    return true;
  }

  async replaceObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.calls.push(`replaceObject:${path}`);
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async refsByPath(paths: string[]): Promise<Map<string, string[]>> {
    this.calls.push(`refsByPath:${paths.join(",")}`);
    const out = new Map<string, string[]>();
    for (const row of this.rows.values()) {
      if (row.path !== null && paths.includes(row.path)) {
        out.set(row.path, [...(out.get(row.path) ?? []), row.source_ref]);
      }
    }
    return out;
  }

  async objectSha256(path: string): Promise<string | null> {
    this.calls.push(`objectSha256:${path}`);
    const existing = this.objects.get(path);
    return existing ? sha256Hex(existing.bytes) : null;
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.calls.push(`uploadObject:${path}`);
    if (this.objects.has(path)) {
      throw new Error(`Unexpected overwrite of existing object ${path}`);
    }
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }
}

describe("deepEqualJson", () => {
  it("ignores object key order and undefined properties while checking values deeply", () => {
    expect(
      deepEqualJson(
        { b: 2, a: 1, nested: { y: [1, 2], x: true }, opt: undefined },
        { a: 1, b: 2, nested: { x: true, y: [1, 2] } },
      ),
    ).toBe(true);
    expect(deepEqualJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(deepEqualJson({ a: null }, { a: {} })).toBe(false);
  });

  it("is invariant to object key permutation across arbitrary JSON values", () => {
    const shuffleKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(shuffleKeys);
      if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).reverse();
        return Object.fromEntries(entries.map(([k, v]) => [k, shuffleKeys(v)]));
      }
      return value;
    };

    fc.assert(
      fc.property(fc.jsonValue(), (val) => {
        expect(deepEqualJson(val, shuffleKeys(val))).toBe(true);
      }),
    );
  });
});

describe("findUnstorableTextPath", () => {
  it("accepts valid Unicode text in any script and flags NUL, lone surrogates, and U+FFFD with their path", () => {
    const cleanString = fc
      .string({ unit: "grapheme" })
      .filter((s) => !s.includes("\u0000") && !s.includes("\uFFFD"));
    fc.assert(
      fc.property(cleanString, cleanString, (text, key) => {
        fc.pre(key.length > 0 && !key.includes("__proto__"));
        expect(findUnstorableTextPath({ nested: [{ [key]: text }] })).toBeNull();
      }),
    );

    const badChar = fc.constantFrom("\u0000", "\uFFFD", "\uD800", "\uDC00");
    fc.assert(
      fc.property(cleanString, cleanString, badChar, (before, after, bad) => {
        expect(
          findUnstorableTextPath({ sections: [{ items: [{ printed: `${before}${bad}${after}` }] }] }),
        ).toBe("$.sections[0].items[0].printed");
        expect(findUnstorableTextPath({ [`k${bad}`]: "ok" })).toBe("$.<key>");
      }),
    );
  });
});

describe("importReferenceRecords", () => {
  let rootDir: string;
  let recordsDir: string;
  let photosDir: string;
  let store: MemoryReferenceStore;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "unica-ref-import-test-"));
    recordsDir = join(rootDir, "records");
    photosDir = join(rootDir, "photos");
    store = new MemoryReferenceStore();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  function writeJson(dir: string, name: string, value: unknown): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  function writeBytes(dir: string, name: string, bytes: Uint8Array): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), bytes);
  }

  // Saves the digests of one checked page, as reference:check does.
  function tieChecked(
    dir: string,
    fileName: string,
    ref: string,
    photo: Uint8Array,
    over: Record<string, unknown> = {},
  ): void {
    const entry = {
      source_ref: ref,
      record_sha256: sha256Hex(readFileSync(join(dir, fileName))),
      photo_sha256: sha256Hex(photo),
      ...over,
    };
    writeJson(dir, CHECKED_DIGESTS_FILE, { version: 1, pages: [entry], checked_before: [] });
  }

  it("imports page and contents records, ignores status.json and report.json as records, and defaults status to machine_read", async () => {
    writeJson(recordsDir, "sample-M-3a.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "sample-M-contents.json", makeContents("sample:M:contents"));
    writeJson(recordsDir, "report.json", { ignored: true });
    writeJson(recordsDir, "status.json", { "sample:M:contents": "human_checked" });
    const img = new Uint8Array([1, 2, 3, 4]);
    tieChecked(recordsDir, "sample-M-contents.json", "sample:M:contents", img);
    writeBytes(photosDir, "chart.jpg", img);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [{ file: "chart.jpg", sha256: sha256Hex(img), source_ref: "sample:M:contents" }],
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.problems).toEqual([]);
    expect(res.counts).toEqual({
      recordsRead: 2,
      inserted: 2,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 1,
    });
    expect(store.rows.get("sample:M:3a")).toMatchObject({
      kind: "page",
      path: null,
      transcript_status: "machine_read",
    });
    expect(store.rows.get("sample:M:contents")).toMatchObject({
      kind: "contents",
      path: "sample/M/contents.jpg",
      transcript_status: "human_checked",
    });
  });

  it("writes a valid batch, and refuses every bad input kind before the first write when paired with a valid first record", async () => {
    const WRITE_CALL_RE = /^(insertRow|uploadObject|replaceObject|updateRow):/;
    const goodImg = new Uint8Array([1, 2, 3, 4]);
    const secondImg = new Uint8Array([5, 6, 7, 8]);
    const manifestEntry = (file: string, bytes: Uint8Array, ref: string) => ({
      file,
      sha256: sha256Hex(bytes),
      original_name: file,
      width: 3024,
      height: 4032,
      source_ref: ref,
    });

    // Control: valid batch with two records and photos writes both rows and photos.
    const controlDir = mkdtempSync(join(rootDir, "control-"));
    const controlRecs = join(controlDir, "records");
    const controlPhotos = join(controlDir, "photos");
    const controlStore = new MemoryReferenceStore();
    writeJson(controlRecs, "01-good.json", makePage("sample:M:1a"));
    writeJson(
      controlRecs,
      "02-target.json",
      makePage("sample:M:2a", "Compare \u{1D465}, été, 数学, جمع, сумма"),
    );
    writeJson(controlRecs, "status.json", {
      "sample:M:1a": "double_read",
      "sample:M:2a": "double_read",
    });
    writeBytes(controlPhotos, "good.jpg", goodImg);
    writeBytes(controlPhotos, "target.png", secondImg);
    writeJson(controlPhotos, "photos-manifest.json", {
      version: 1,
      photos: [
        manifestEntry("good.jpg", goodImg, "sample:M:1a"),
        manifestEntry("target.png", secondImg, "sample:M:2a"),
      ],
    });
    const controlRes = await importReferenceRecords({
      recordsDir: controlRecs,
      photosDir: controlPhotos,
      store: controlStore,
    });
    expect(controlRes.ok).toBe(true);
    expect(controlRes.counts).toMatchObject({ inserted: 2, photosUploaded: 2 });

    // Valid agreement_accepted records with leaf and containing-list paths are accepted.
    const okDir = mkdtempSync(join(rootDir, "ok-accepted-"));
    const okStore = new MemoryReferenceStore();
    writeJson(okDir, "page.json", {
      ...makePage("sample:M:3a"),
      single_read: ["topic.title", "sections[0].items", "sections[0].scaffolds"],
    });
    writeJson(okDir, "contents.json", {
      ...makeContents("sample:M:contents"),
      single_read: ["topics"],
    });
    writeJson(okDir, "status.json", {
      "sample:M:3a": "agreement_accepted",
      "sample:M:contents": "agreement_accepted",
    });
    const okRes = await importReferenceRecords({ recordsDir: okDir, store: okStore });
    expect(okRes.ok).toBe(true);
    expect(okRes.counts.inserted).toBe(2);

    // Controls for the report and for a check that does not count: each of these folders imports with
    // the status that it gives.
    const pageRow = (hash: string | null | undefined) => ({
      pages: [{ source_ref: "sample:M:3a", final_record_sha256: hash }],
    });
    const acceptedReports: Array<[string, ((recordSha: string) => unknown) | null]> = [
      ["no report.json (a converted or an older folder)", null],
      ["hash of the file", (recordSha) => pageRow(recordSha)],
      ["no hash", () => pageRow(undefined)],
      ["null hash", () => pageRow(null)],
      ["no row of this page", () => ({ pages: [{ source_ref: "sample:M:9a", final_record_sha256: "0".repeat(64) }] })],
      ["no pages", () => ({ pages: [] })],
      ["no page list", () => ({ ignored: true })],
    ];
    for (const [name, report] of acceptedReports) {
      for (const status of ["machine_read", "agreement_accepted", "double_read", "human_checked", null]) {
        const dir = mkdtempSync(join(rootDir, "ok-report-"));
        const recs = join(dir, "records");
        const photos = join(dir, "photos");
        const okReportStore = new MemoryReferenceStore();
        writeJson(recs, "page.json", {
          ...makePage("sample:M:3a"),
          ...(status === "agreement_accepted" ? { single_read: ["topic.title"] } : {}),
        });
        if (status) writeJson(recs, "status.json", { "sample:M:3a": status });
        writeBytes(photos, "page.jpg", goodImg);
        writeJson(photos, "photos-manifest.json", {
          version: 1,
          photos: [manifestEntry("page.jpg", goodImg, "sample:M:3a")],
        });
        if (status === "human_checked") tieChecked(recs, "page.json", "sample:M:3a", goodImg);
        if (report) {
          writeJson(recs, "report.json", report(sha256Hex(readFileSync(join(recs, "page.json")))));
        }
        const res = await importReferenceRecords({ recordsDir: recs, photosDir: photos, store: okReportStore });
        expect(res.problems, `${name}, ${status}`).toEqual([]);
        expect(okReportStore.rows.get("sample:M:3a")?.transcript_status, `${name}, ${status}`).toBe(
          status ?? "machine_read",
        );
      }
    }

    // A checked page follows its digests, not the older hash of the report. A page that only lost its
    // mark still has the text and the photo of the check.
    for (const status of ["human_checked", "machine_read"]) {
      const dir = mkdtempSync(join(rootDir, "ok-checked-"));
      const recs = join(dir, "records");
      const photos = join(dir, "photos");
      const okCheckedStore = new MemoryReferenceStore();
      writeJson(recs, "page.json", makePage("sample:M:3a"));
      writeJson(recs, "status.json", { "sample:M:3a": status });
      tieChecked(recs, "page.json", "sample:M:3a", goodImg);
      if (status === "human_checked") writeJson(recs, "report.json", pageRow("0".repeat(64)));
      writeBytes(photos, "page.jpg", goodImg);
      writeJson(photos, "photos-manifest.json", {
        version: 1,
        photos: [manifestEntry("page.jpg", goodImg, "sample:M:3a")],
      });
      const res = await importReferenceRecords({ recordsDir: recs, photosDir: photos, store: okCheckedStore });
      expect(res.problems, status).toEqual([]);
      expect(okCheckedStore.rows.get("sample:M:3a")?.transcript_status).toBe(status);
    }

    // Every refusal kind in import.ts, import-photos.ts, record-path.ts, and import-replace.ts,
    // paired with a valid first record (01-good.json + good.jpg) so any write before refusal fails.
    interface RefusalCase {
      name: string;
      usePhotos?: boolean;
      replace?: boolean;
      setup: (ctx: {
        recs: string;
        photos: string;
        outside: string;
        store: MemoryReferenceStore;
      }) => void | { recordsDir?: string; photosDir?: string };
      expectedProblem?: RegExp;
      expectedProblems?: RegExp[];
    }

    const withInvalidUtf8Byte = (jsonText: string, marker: string): Buffer => {
      const [left, right] = jsonText.split(marker);
      return Buffer.concat([Buffer.from(left, "utf8"), Buffer.of(0xff), Buffer.from(right, "utf8")]);
    };

    // A page that a person checked, with a valid photo. The change comes after the digests are saved.
    // Each row runs for human_checked and for a check that lapsed (machine_read in status.json, or not
    // listed there), and also with --replace over an existing row.
    const checkedRef = "sample:M:2a";
    const checkedCase = (
      name: string,
      cause: RegExp,
      change: (ctx: { recs: string; photos: string; store: MemoryReferenceStore }) => void,
      { noPhotos = false, lapsed = true }: { noPhotos?: boolean; lapsed?: boolean } = {},
    ): RefusalCase[] =>
      [
        { status: "human_checked", listed: true },
        ...(lapsed
          ? [
              { status: "machine_read", listed: true },
              { status: "machine_read", listed: false },
            ]
          : []),
      ].flatMap(({ status, listed }) => [false, true].map((replace) => ({
        name: `${status}${listed ? "" : " by default"}, ${name}${replace ? ", with replace" : ""}`,
        usePhotos: !noPhotos,
        replace,
        setup: ({ recs, photos, store: caseStore }) => {
          writeJson(recs, "02-target.json", makePage(checkedRef));
          writeJson(recs, "status.json", listed ? { [checkedRef]: status } : {});
          tieChecked(recs, "02-target.json", checkedRef, secondImg);
          writeBytes(photos, "target.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("target.jpg", secondImg, checkedRef),
            ],
          });
          if (replace) {
            caseStore.rows.set(checkedRef, {
              source_ref: checkedRef,
              kind: "page",
              path: "sample/M/2a.jpg",
              transcript: makePage(checkedRef, "Older title"),
              transcript_status: "human_checked",
            });
          }
          change({ recs, photos, store: caseStore });
        },
        expectedProblem: new RegExp(`${checkedRef}.*${status}.*${cause.source}`),
      })));
    const otherPhoto = (photos: string) => {
      writeBytes(photos, "other.jpg", new Uint8Array([7, 7, 7]));
      writeJson(photos, "photos-manifest.json", {
        version: 1,
        photos: [
          manifestEntry("good.jpg", goodImg, "sample:M:1a"),
          manifestEntry("other.jpg", new Uint8Array([7, 7, 7]), checkedRef),
        ],
      });
    };
    const changedRecord = (recs: string) =>
      writeJson(recs, "02-target.json", makePage(checkedRef, "Changed after the check"));
    const checkedCases: RefusalCase[] = [
      ...checkedCase("record changed", /record changed after the check/, ({ recs }) => changedRecord(recs)),
      ...checkedCase("record has one more byte", /record changed after the check/, ({ recs }) =>
        writeFileSync(
          join(recs, "02-target.json"),
          Buffer.concat([readFileSync(join(recs, "02-target.json")), Buffer.from(" ")]),
        ),
      ),
      ...checkedCase("photo list names another photo", /photo changed after the check/, ({ photos }) =>
        otherPhoto(photos),
      ),
      ...checkedCase(
        "record and photo changed",
        /record changed after the check; photo changed after the check/,
        ({ recs, photos }) => {
          changedRecord(recs);
          otherPhoto(photos);
        },
      ),
      ...checkedCase("photo list names no photo", /photo of the check is missing/, ({ photos }) =>
        writeJson(photos, "photos-manifest.json", {
          version: 1,
          photos: [manifestEntry("good.jpg", goodImg, "sample:M:1a")],
        }),
      ),
      ...checkedCase("photo file missing", /photo of the check is missing/, ({ photos }) =>
        rmSync(join(photos, "target.jpg")),
      ),
      ...checkedCase("run without photos", /photo of the check is missing.*--photos/, () => {}, {
        noPhotos: true,
      }),
      ...checkedCase("digest file missing", /checked before the photo check was saved/, ({ recs }) =>
        rmSync(join(recs, CHECKED_DIGESTS_FILE)),
        { lapsed: false },
      ),
      ...checkedCase("page has no digests", /checked before the photo check was saved/, ({ recs }) =>
        writeJson(recs, CHECKED_DIGESTS_FILE, { version: 1, pages: [], checked_before: [checkedRef] }),
      ),
      ...[
        { record_sha256: "x" },
        { photo_sha256: null },
        { record_sha256: undefined },
      ].map((over) => ({
        name: `digest that is not valid ${JSON.stringify(over)}`,
        usePhotos: true,
        setup: ({ recs, photos }: { recs: string; photos: string }) => {
          writeJson(recs, "02-target.json", makePage(checkedRef));
          writeJson(recs, "status.json", { [checkedRef]: "human_checked" });
          tieChecked(recs, "02-target.json", checkedRef, secondImg, over);
          writeBytes(photos, "target.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [manifestEntry("target.jpg", secondImg, checkedRef)],
          });
        },
        expectedProblem: /checked-pages\.digests: .*not a SHA-256/,
      })),
      {
        name: "machine_read, in checked_before and with digests that match",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage(checkedRef));
          writeBytes(photos, "target.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [manifestEntry("target.jpg", secondImg, checkedRef)],
          });
          const record_sha256 = sha256Hex(readFileSync(join(recs, "02-target.json")));
          writeJson(recs, CHECKED_DIGESTS_FILE, {
            version: 1,
            pages: [{ source_ref: checkedRef, record_sha256, photo_sha256: sha256Hex(secondImg) }],
            checked_before: [checkedRef],
          });
        },
        expectedProblem: /sample:M:2a.*checked before the photo check was saved/,
      },
      // A damaged digest file stops the run, also when no page is human_checked.
      ...["{ bad", "", "null"].map((text) => ({
        name: `damaged digest file ${JSON.stringify(text)}`,
        setup: ({ recs }: { recs: string }) => writeFileSync(join(recs, CHECKED_DIGESTS_FILE), text),
        expectedProblem: /Damaged file .*checked-pages\.digests/,
      })),
      {
        name: "digest file is a link",
        setup: ({ recs, outside }) => {
          writeJson(outside, "digests", { version: 1, pages: [], checked_before: [] });
          symlinkSync(join(outside, "digests"), join(recs, CHECKED_DIGESTS_FILE));
        },
        expectedProblem: /symlink.*checked-pages\.digests/,
      },
    ];

    // A page that the report of the last compare lists, and whose file is not the file that compare
    // wrote (or whose row cannot be used). Each row also runs with --replace over an existing row.
    const otherHash = "0".repeat(64);
    const reportCases: RefusalCase[] = (
      [
        ["double_read", { report: "other hash" }, /sample:M:2a.*report\.json.*run reference:compare/],
        ["agreement_accepted", { report: "other hash" }, /sample:M:2a.*report\.json.*run reference:compare/],
        ["machine_read", { report: "other hash" }, /sample:M:2a.*report\.json.*run reference:compare/],
        ["not in status.json", { report: "other hash" }, /sample:M:2a.*report\.json.*run reference:compare/],
        ["double_read", { edit: "one more byte" }, /sample:M:2a.*report\.json.*run reference:compare/],
        ["double_read", { hash: "" }, /sample:M:2a.*report\.json.*run reference:compare/],
        ["double_read", { hash: 7 }, /report\.json.*sample:M:2a.*hash that is not text/],
        ["double_read", { rows: [{ final_record_sha256: otherHash }] }, /report\.json: pages\[0\] has no source_ref/],
        ["double_read", { rows: [null] }, /report\.json: pages\[0\] has no source_ref/],
        [
          "double_read",
          { rows: [{ source_ref: checkedRef, final_record_sha256: otherHash }], addValidRow: true },
          /report\.json.*second hash for sample:M:2a/,
        ],
        ["double_read", { text: '{"pages":{}}' }, /report\.json: pages is not a list/],
        ["double_read", { text: "{ bad" }, /Malformed previous report .*report\.json/],
        ["double_read", { text: "" }, /Malformed previous report .*report\.json/],
        ["double_read", { link: "to a report" }, /Malformed previous report .*report\.json.*symlink/],
        ["double_read", { link: "to nothing" }, /Malformed previous report .*report\.json.*symlink/],
      ] as Array<[string, Record<string, unknown>, RegExp]>
    ).flatMap(([status, change, expectedProblem]) =>
      [false, true].map((replace) => ({
        name: `${status}, report ${JSON.stringify(change)}${replace ? ", with replace" : ""}`,
        replace,
        expectedProblem,
        setup: ({ recs, outside, store: caseStore }) => {
          const file = join(recs, "02-target.json");
          const page = makePage(checkedRef);
          writeJson(
            recs,
            "02-target.json",
            status === "agreement_accepted" ? { ...page, single_read: ["topic.title"] } : page,
          );
          if (status !== "not in status.json") writeJson(recs, "status.json", { [checkedRef]: status });
          const row = {
            source_ref: checkedRef,
            final_record_sha256:
              change.report === "other hash" ? otherHash : (change.hash ?? sha256Hex(readFileSync(file))),
          };
          const rows = (change.rows as unknown[] | undefined) ?? [row];
          const reportPath = join(recs, "report.json");
          if (change.link === undefined) {
            writeJson(recs, "report.json", { pages: change.addValidRow ? [row, ...rows] : rows });
            if (typeof change.text === "string") writeFileSync(reportPath, change.text);
          } else {
            if (change.link === "to a report") writeJson(outside, "real.json", { pages: rows });
            symlinkSync(join(outside, "real.json"), reportPath);
          }
          if (change.edit) writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from(" ")]));
          if (replace) {
            caseStore.rows.set(checkedRef, {
              source_ref: checkedRef,
              kind: "page",
              path: null,
              transcript: makePage(checkedRef, "Older title"),
              transcript_status: "machine_read",
            });
          }
        },
      })),
    );

    const refusalCases: RefusalCase[] = [
      ...checkedCases,
      ...reportCases,
      {
        name: "missing recordsDir",
        setup: ({ outside }) => ({ recordsDir: join(outside, "missing-records") }),
        expectedProblem: /records folder .* could not be read/,
      },
      {
        name: "invalid UTF-8 byte 0xff in record file",
        setup: ({ recs }) => {
          const text = JSON.stringify(makePage("sample:M:2a", "MARKER"));
          writeFileSync(join(recs, "02-bad.json"), withInvalidUtf8Byte(text, "MARKER"));
        },
        expectedProblem: /02-bad\.json:.*UTF-8/i,
      },
      {
        name: "invalid JSON in record file",
        setup: ({ recs }) => {
          writeFileSync(join(recs, "02-target.json"), "{ not valid json", "utf8");
        },
        expectedProblem: /02-target\.json: invalid JSON/,
      },
      {
        name: "record fails schema validation",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", { ...makePage("sample:M:2a"), extra_key: "nope" });
        },
        expectedProblem: /02-target\.json.*extra_key/,
      },
      {
        name: "multiple record errors in one batch (schema, JSON, duplicate all reported)",
        setup: ({ recs }) => {
          writeJson(recs, "02-bad-schema.json", { ...makePage("sample:M:2a"), extra_a: 1 });
          writeFileSync(join(recs, "03-bad-json.json"), "{ broken", "utf8");
          writeJson(recs, "04-bad-schema-2.json", { ...makePage("sample:M:4a"), extra_b: 2 });
          writeJson(recs, "05-dup.json", makePage("sample:M:1a"));
        },
        expectedProblems: [
          /02-bad-schema\.json.*extra_a/,
          /03-bad-json\.json: invalid JSON/,
          /04-bad-schema-2\.json.*extra_b/,
          /duplicate source_ref "sample:M:1a".*05-dup\.json/,
        ],
      },
      {
        name: "NUL character in record text",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a", "Bad\u0000title"));
        },
        expectedProblem: /02-target\.json:.*cannot store/,
      },
      {
        name: "lone high surrogate in record text",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a", "Compare \u{1D465} and y".slice(0, 9)));
        },
        expectedProblem: /02-target\.json:.*cannot store/,
      },
      {
        name: "lone low surrogate in record text",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a", "Bad\uDC00title"));
        },
        expectedProblem: /02-target\.json:.*cannot store/,
      },
      {
        name: "U+FFFD replacement character in nested record string",
        setup: ({ recs }) => {
          const page = makePage("sample:M:2a");
          page.sections[0].items[0].printed = "3 + \uFFFD =";
          writeJson(recs, "02-target.json", page);
        },
        expectedProblem: /02-target\.json: \$\.sections\[0\]\.items\[0\]\.printed:.*U\+FFFD/i,
      },
      {
        name: "duplicate source_ref across two record files",
        setup: ({ recs }) => {
          writeJson(recs, "02-dup.json", makePage("sample:M:1a"));
        },
        expectedProblem: /duplicate source_ref "sample:M:1a"/,
      },
      {
        name: "symlink record file",
        setup: ({ recs, outside }) => {
          writeJson(outside, "secret.json", makePage("sample:M:2a"));
          symlinkSync(join(outside, "secret.json"), join(recs, "02-link.json"));
        },
        expectedProblem: /02-link\.json: refusing symlink/,
      },
      {
        name: "symlink status.json",
        setup: ({ recs, outside }) => {
          writeJson(outside, "status.json", { "sample:M:1a": "double_read" });
          symlinkSync(join(outside, "status.json"), join(recs, "status.json"));
        },
        expectedProblem: /status\.json: refusing symlink/,
      },
      {
        name: "invalid UTF-8 byte 0xff in status.json",
        setup: ({ recs }) => {
          const text = JSON.stringify({ "sample:M:1a": "MARKER" });
          writeFileSync(join(recs, "status.json"), withInvalidUtf8Byte(text, "MARKER"));
        },
        expectedProblem: /status\.json:.*UTF-8/i,
      },
      {
        name: "U+FFFD replacement character in status.json key",
        setup: ({ recs }) => {
          writeJson(recs, "status.json", {
            "sample:M:1a": "double_read",
            "sample:M:2\uFFFDa": "double_read",
          });
        },
        expectedProblem: /status\.json: \$\.<key>:.*U\+FFFD/i,
      },
      {
        name: "NUL character in status.json key",
        setup: ({ recs }) => {
          writeJson(recs, "status.json", {
            "sample:M:1a": "double_read",
            "sample:M:2\u0000a": "double_read",
          });
        },
        expectedProblem: /status\.json: \$\.<key>:.*cannot store/i,
      },
      {
        name: "lone surrogate in status.json key",
        setup: ({ recs }) => {
          writeJson(recs, "status.json", {
            "sample:M:1a": "double_read",
            "sample:M:2\uD800a": "double_read",
          });
        },
        expectedProblem: /status\.json: \$\.<key>:.*cannot store/i,
      },
      {
        name: "invalid JSON in status.json",
        setup: ({ recs }) => {
          writeFileSync(join(recs, "status.json"), "{ bad", "utf8");
        },
        expectedProblem: /status\.json: invalid JSON/,
      },
      {
        name: "non-object status.json",
        setup: ({ recs }) => {
          writeJson(recs, "status.json", ["double_read"]);
        },
        expectedProblem: /status\.json: must be a JSON object/,
      },
      {
        name: "unknown status value",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeJson(recs, "status.json", { "sample:M:2a": "verified_by_magic" });
        },
        expectedProblem: /unknown status for "sample:M:2a"/,
      },
      {
        name: "prototype property keys in status.json",
        setup: ({ recs }) => {
          writeFileSync(
            join(recs, "status.json"),
            '{"__proto__":"machine_read","constructor":"double_read","toString":"human_checked"}\n',
            "utf8",
          );
        },
        expectedProblems: [
          /"__proto__" has no matching record file/,
          /"constructor" has no matching record file/,
          /"toString" has no matching record file/,
        ],
      },
      {
        name: "prototype property name as status value in status.json",
        setup: ({ recs }) => {
          writeFileSync(join(recs, "status.json"), '{"sample:M:1a":"toString"}\n', "utf8");
        },
        expectedProblem: /unknown status for "sample:M:1a": "toString"/,
      },
      {
        name: "orphan source_ref in status.json",
        setup: ({ recs }) => {
          writeJson(recs, "status.json", { "sample:M:99a": "double_read" });
        },
        expectedProblem: /"sample:M:99a" has no matching record file/,
      },
      {
        name: "agreement_accepted without single_read",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", makeContents("sample:M:contents"));
          writeJson(recs, "status.json", { "sample:M:contents": "agreement_accepted" });
        },
        expectedProblem: /sample:M:contents.*single_read/,
      },
      {
        name: "agreement_accepted with empty single_read",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", { ...makeContents("sample:M:contents"), single_read: [] });
          writeJson(recs, "status.json", { "sample:M:contents": "agreement_accepted" });
        },
        expectedProblem: /sample:M:contents.*single_read/,
      },
      {
        name: "single_read on default machine_read",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", {
            ...makeContents("sample:M:contents"),
            single_read: ["topics[0].title"],
          });
        },
        expectedProblem: /sample:M:contents.*single_read/,
      },
      {
        name: "single_read on explicit machine_read",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", {
            ...makeContents("sample:M:contents"),
            single_read: ["topics[0].title"],
          });
          writeJson(recs, "status.json", { "sample:M:contents": "machine_read" });
        },
        expectedProblem: /sample:M:contents.*single_read/,
      },
      {
        name: "single_read on double_read",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", {
            ...makeContents("sample:M:contents"),
            single_read: ["topics[0].title"],
          });
          writeJson(recs, "status.json", { "sample:M:contents": "double_read" });
        },
        expectedProblem: /sample:M:contents.*single_read/,
      },
      {
        name: "single_read on human_checked",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", { ...makePage("sample:M:2a"), single_read: ["topic.title"] });
          writeJson(recs, "status.json", { "sample:M:2a": "human_checked" });
        },
        expectedProblem: /sample:M:2a.*single_read/,
      },
      {
        name: "single_read path out of range",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", {
            ...makeContents("sample:M:contents"),
            single_read: ["topics[9].title"],
          });
          writeJson(recs, "status.json", { "sample:M:contents": "agreement_accepted" });
        },
        expectedProblem: /sample:M:contents.*topics\[9\]\.title/,
      },
      {
        name: "single_read path using [] syntax",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", {
            ...makePage("sample:M:2a"),
            single_read: ["sections[0].scaffolds[]"],
          });
          writeJson(recs, "status.json", { "sample:M:2a": "agreement_accepted" });
        },
        expectedProblem: /sample:M:2a.*sections\[0\]\.scaffolds\[\]/,
      },
      {
        name: "single_read path targeting metadata single_read",
        setup: ({ recs }) => {
          writeJson(recs, "02-target.json", { ...makePage("sample:M:2a"), single_read: ["single_read"] });
          writeJson(recs, "status.json", { "sample:M:2a": "agreement_accepted" });
        },
        expectedProblem: /sample:M:2a.*single_read/,
      },
      {
        name: "photosDir is not a directory",
        usePhotos: true,
        setup: ({ outside }) => {
          const notDir = join(outside, "not-a-dir");
          writeFileSync(notDir, "x", "utf8");
          return { photosDir: notDir };
        },
        expectedProblem: /is not a directory/,
      },
      {
        name: "missing photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          rmSync(join(photos, "photos-manifest.json"));
        },
        expectedProblem: /photos-manifest\.json/,
      },
      {
        name: "symlink photos-manifest.json",
        usePhotos: true,
        setup: ({ photos, outside }) => {
          rmSync(join(photos, "photos-manifest.json"));
          writeJson(outside, "photos-manifest.json", { version: 1, photos: [] });
          symlinkSync(join(outside, "photos-manifest.json"), join(photos, "photos-manifest.json"));
        },
        expectedProblem: /photos-manifest\.json: refusing symlink/,
      },
      {
        name: "invalid UTF-8 byte 0xff in photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          const text = JSON.stringify({
            version: 1,
            photos: [{ ...manifestEntry("good.jpg", goodImg, "sample:M:1a"), original_name: "MARKER" }],
          });
          writeFileSync(join(photos, "photos-manifest.json"), withInvalidUtf8Byte(text, "MARKER"));
        },
        expectedProblem: /photos-manifest\.json:.*UTF-8/i,
      },
      {
        name: "U+FFFD replacement character in photos-manifest.json field",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              { ...manifestEntry("good.jpg", goodImg, "sample:M:1a"), original_name: "IMG_\uFFFD.jpg" },
            ],
          });
        },
        expectedProblem: /photos-manifest\.json: \$\.photos\[0\]\.original_name:.*U\+FFFD/i,
      },
      {
        name: "NUL character in photos-manifest.json field",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              { ...manifestEntry("good.jpg", goodImg, "sample:M:1a"), original_name: "IMG_\u0000.jpg" },
            ],
          });
        },
        expectedProblem: /photos-manifest\.json: \$\.photos\[0\]\.original_name:.*cannot store/i,
      },
      {
        name: "lone surrogate in photos-manifest.json field",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              { ...manifestEntry("good.jpg", goodImg, "sample:M:1a"), original_name: "IMG_\uDC00.jpg" },
            ],
          });
        },
        expectedProblem: /photos-manifest\.json: \$\.photos\[0\]\.original_name:.*cannot store/i,
      },
      {
        name: "invalid JSON in photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          writeFileSync(join(photos, "photos-manifest.json"), "{ bad", "utf8");
        },
        expectedProblem: /photos-manifest\.json: could not be read or parsed/,
      },
      {
        name: "wrong shape photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", { version: 2, photos: [] });
        },
        expectedProblem: /version: 1 and a photos array/,
      },
      {
        name: "non-object entry in photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [manifestEntry("good.jpg", goodImg, "sample:M:1a"), "bad-entry"],
          });
        },
        expectedProblem: /photos\[1\] must be an object/,
      },
      {
        name: "empty source_ref in photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [manifestEntry("good.jpg", goodImg, "sample:M:1a"), manifestEntry("x.jpg", secondImg, "   ")],
          });
        },
        expectedProblem: /photos\[1\]\.source_ref must be a non-empty string/,
      },
      {
        name: "duplicate source_ref in photos-manifest.json",
        usePhotos: true,
        setup: ({ photos }) => {
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("dup.jpg", secondImg, "sample:M:1a"),
            ],
          });
        },
        expectedProblem: /photos-manifest\.json: duplicate source_ref "sample:M:1a"/,
      },
      {
        name: "path traversal in manifest file name",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("../escape.jpg", secondImg, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /outside the photos folder/,
      },
      {
        name: "unsupported photo extension (.gif)",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeBytes(photos, "bad.gif", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("bad.gif", secondImg, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /unsupported photo extension "\.gif"/,
      },
      {
        name: "inherited property extension (mask.constructor)",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeBytes(photos, "mask.constructor", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("mask.constructor", secondImg, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /unsupported photo extension.*mask\.constructor/,
      },
      {
        name: "invalid sha256 format in manifest",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeBytes(photos, "target.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              { ...manifestEntry("target.jpg", secondImg, "sample:M:2a"), sha256: "not-hex" },
            ],
          });
        },
        expectedProblem: /sha256 must be a 64-character hex string/,
      },
      {
        name: "missing photo file",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("missing.jpg", secondImg, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /sample:M:2a \(missing\.jpg\): missing file/,
      },
      {
        name: "symlink photo file",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          symlinkSync(join(photos, "good.jpg"), join(photos, "link.jpg"));
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("link.jpg", goodImg, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /link\.jpg.*refusing symlink/,
      },
      {
        name: "non-regular photo file (directory)",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          mkdirSync(join(photos, "dir.jpg"), { recursive: true });
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("dir.jpg", secondImg, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /dir\.jpg.*not a regular file/,
      },
      {
        name: "empty photo file (0 bytes)",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          const empty = new Uint8Array(0);
          writeBytes(photos, "empty.png", empty);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("empty.png", empty, "sample:M:2a"),
            ],
          });
        },
        expectedProblem: /empty\.png.*file size 0 bytes is not allowed/,
      },
      {
        name: "photo too large (above bucket limit)",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          const bigPath = join(photos, "big.jpg");
          writeFileSync(bigPath, "");
          truncateSync(bigPath, MAX_REFERENCE_PHOTO_BYTES + 1);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              { ...manifestEntry("big.jpg", secondImg, "sample:M:2a"), sha256: "a".repeat(64) },
            ],
          });
        },
        expectedProblem: /big\.jpg.*above the limit/,
      },
      {
        name: "photo hash mismatch",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeBytes(photos, "bad-hash.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              { ...manifestEntry("bad-hash.jpg", secondImg, "sample:M:2a"), sha256: "b".repeat(64) },
            ],
          });
        },
        expectedProblem: /sample:M:2a.*sha256 mismatch/,
      },
      {
        name: "multiple photo hash mismatches in one batch (all reported)",
        usePhotos: true,
        setup: ({ recs, photos }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeJson(recs, "03-target.json", makePage("sample:M:3a"));
          writeBytes(photos, "bad-hash-1.jpg", secondImg);
          writeBytes(photos, "bad-hash-2.jpg", new Uint8Array([9, 10, 11, 12]));
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              { ...manifestEntry("bad-hash-1.jpg", secondImg, "sample:M:2a"), sha256: "b".repeat(64) },
              {
                ...manifestEntry("bad-hash-2.jpg", new Uint8Array([9, 10, 11, 12]), "sample:M:3a"),
                sha256: "c".repeat(64),
              },
            ],
          });
        },
        expectedProblems: [
          /sample:M:2a \(bad-hash-1\.jpg\): sha256 mismatch/,
          /sample:M:3a \(bad-hash-2\.jpg\): sha256 mismatch/,
        ],
      },
      {
        name: "existing storage object sha256 mismatch for new row",
        usePhotos: true,
        setup: ({ recs, photos, store: caseStore }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeBytes(photos, "target.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("target.jpg", secondImg, "sample:M:2a"),
            ],
          });
          caseStore.objects.set("sample/M/2a.jpg", {
            bytes: new Uint8Array([99, 98, 97]),
            contentType: "image/jpeg",
          });
        },
        expectedProblem: /sample\/M\/2a\.jpg.*does not match planned photo/,
      },
      {
        name: "replace would overwrite a photo shared by another row",
        usePhotos: true,
        replace: true,
        setup: ({ recs, photos, store: caseStore }) => {
          writeJson(recs, "02-target.json", makePage("sample:M:2a"));
          writeBytes(photos, "target.jpg", secondImg);
          writeJson(photos, "photos-manifest.json", {
            version: 1,
            photos: [
              manifestEntry("good.jpg", goodImg, "sample:M:1a"),
              manifestEntry("target.jpg", secondImg, "sample:M:2a"),
            ],
          });
          caseStore.rows.set("sample:M:2a", {
            source_ref: "sample:M:2a",
            kind: "page",
            path: "sample/M/2a.jpg",
            transcript: makePage("sample:M:2a"),
            transcript_status: "machine_read",
          });
          caseStore.rows.set("sample:M:9a", {
            source_ref: "sample:M:9a",
            kind: "page",
            path: "sample/M/2a.jpg",
            transcript: makePage("sample:M:9a"),
            transcript_status: "machine_read",
          });
          caseStore.objects.set("sample/M/2a.jpg", {
            bytes: new Uint8Array([99, 98, 97]),
            contentType: "image/jpeg",
          });
        },
        expectedProblem: /would overwrite the photo that the row "sample:M:9a" also uses/,
      },
    ];

    for (const c of refusalCases) {
      const caseDir = mkdtempSync(join(rootDir, "refuse-"));
      const recs = join(caseDir, "records");
      const photos = join(caseDir, "photos");
      const outside = join(caseDir, "outside");
      mkdirSync(recs, { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeJson(recs, "01-good.json", makePage("sample:M:1a"));
      if (c.usePhotos) {
        writeBytes(photos, "good.jpg", goodImg);
        writeJson(photos, "photos-manifest.json", {
          version: 1,
          photos: [manifestEntry("good.jpg", goodImg, "sample:M:1a")],
        });
      }
      const caseStore = new MemoryReferenceStore();
      const override = c.setup({ recs, photos, outside, store: caseStore }) ?? {};
      const rowsBefore = caseStore.rows.size;
      const objectsBefore = caseStore.objects.size;

      const res = await importReferenceRecords({
        recordsDir: override.recordsDir ?? recs,
        ...(c.usePhotos || override.photosDir ? { photosDir: override.photosDir ?? photos } : {}),
        ...(c.replace ? { replace: true } : {}),
        store: caseStore,
      });

      expect(res.ok, c.name).toBe(false);
      expect(res.stopped, c.name).toBeUndefined();
      expect(res.counts.inserted, c.name).toBe(0);
      expect(res.counts.replaced, c.name).toBe(0);
      expect(res.counts.photosUploaded, c.name).toBe(0);
      expect(caseStore.rows.size, c.name).toBe(rowsBefore);
      expect(caseStore.objects.size, c.name).toBe(objectsBefore);
      expect(
        caseStore.calls.filter((call) => WRITE_CALL_RE.test(call)),
        `${c.name} must perform zero writes`,
      ).toEqual([]);
      const patterns = c.expectedProblems ?? (c.expectedProblem ? [c.expectedProblem] : []);
      expect(patterns.length, `${c.name} must define expected problem pattern(s)`).toBeGreaterThan(0);
      for (const pattern of patterns) {
        expect(
          res.problems.some((p) => pattern.test(p)),
          `${c.name} missing ${pattern}: ${res.problems.join("; ")}`,
        ).toBe(true);
      }
    }
  });

  it("is idempotent on re-run and reports skipped_different without modifying existing rows or uploading photos", async () => {
    const page1 = makePage("sample:M:3a", "First title");
    const page2 = makePage("sample:M:4a", "Second title");
    writeJson(recordsDir, "p1.json", page1);
    writeJson(recordsDir, "p2.json", page2);

    const first = await importReferenceRecords({ recordsDir, store });
    expect(first.ok).toBe(true);
    expect(first.counts.inserted).toBe(2);

    const second = await importReferenceRecords({ recordsDir, store });
    expect(second.ok).toBe(true);
    expect(second.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
      replaced: 0,
      skipped: 2,
      skippedDifferent: 0,
      photosUploaded: 0,
    });

    // Mutate page2 on disk and add a photo for page2 - existing row must not change and photo must not upload.
    writeJson(recordsDir, "p2.json", makePage("sample:M:4a", "Changed title"));
    const img = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    writeBytes(photosDir, "IMG_0002.jpg", img);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0002.jpg",
          sha256: sha256Hex(img),
          original_name: "IMG_0002.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:4a",
        },
      ],
    });

    const third = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(third.ok).toBe(true);
    expect(third.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
      replaced: 0,
      skipped: 1,
      skippedDifferent: 1,
      photosUploaded: 0,
    });
    expect(third.skippedDifferentRefs).toEqual(["sample:M:4a"]);
    expect((store.rows.get("sample:M:4a")?.transcript as PageRecord).topic.title).toBe(
      "Second title",
    );
    expect(store.objects.size).toBe(0);
    expect(formatImportResult(third)).toContain("sample:M:4a");
  });

  it("uploads matched photos before row insert, ignores unmanifested or unidentified photos, and never overwrites existing objects", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
    writeJson(recordsDir, "p3.json", makePage("sample:M:4a"));

    const img1 = new Uint8Array([1, 2, 3, 4]);
    const img2 = new Uint8Array([5, 6, 7, 8]);
    const other = new Uint8Array([7, 7, 7]);
    const loose = new Uint8Array([9, 9, 9]);
    writeBytes(photosDir, "IMG_0001.jpg", img1);
    writeBytes(photosDir, "IMG_0002.png", img2);
    writeBytes(photosDir, "OTHER.jpg", other);
    writeBytes(photosDir, "UNLISTED.jpg", loose);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img1),
          original_name: "IMG_0001.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3a",
        },
        {
          file: "IMG_0002.png",
          sha256: sha256Hex(img2),
          original_name: "IMG_0002.png",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3b",
        },
        {
          // Manifest entry for a record not in this batch: ignored
          file: "OTHER.jpg",
          sha256: sha256Hex(other),
          original_name: "OTHER.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:99a",
        },
        {
          // No source_ref yet: ignored
          file: "UNIDENTIFIED.jpg",
          sha256: "0".repeat(64),
          original_name: "UNIDENTIFIED.jpg",
          width: 3024,
          height: 4032,
        },
      ],
    });

    // Pre-populate matching object for sample/M/3b.png so import reuses it without overwriting.
    store.objects.set("sample/M/3b.png", {
      bytes: new Uint8Array(img2),
      contentType: "image/png",
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 3,
      inserted: 3,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 1,
    });
    expect(store.rows.get("sample:M:3a")?.path).toBe("sample/M/3a.jpg");
    expect(store.rows.get("sample:M:3b")?.path).toBe("sample/M/3b.png");
    expect(store.rows.get("sample:M:4a")?.path).toBeNull();
    expect(store.objects.get("sample/M/3a.jpg")?.contentType).toBe("image/jpeg");
    expect(store.objects.get("sample/M/3b.png")?.bytes).toEqual(img2);
    expect(store.objects.has("sample/M/99a.jpg")).toBe(false);

    // Upload must happen before row insert for sample:M:3a.
    const uploadIdx = store.calls.indexOf("uploadObject:sample/M/3a.jpg");
    const insertIdx = store.calls.indexOf("insertRow:sample:M:3a");
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(uploadIdx);
  });

  it("refuses dry-run on invalid input and performs no write calls on valid dry-run", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    const img = new Uint8Array([10, 20, 30]);
    writeBytes(photosDir, "IMG_0001.jpg", img);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img),
          original_name: "IMG_0001.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3a",
        },
      ],
    });

    const res = await importReferenceRecords({
      recordsDir,
      photosDir,
      dryRun: true,
      store,
    });
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 1,
      inserted: 1,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 1,
    });
    expect(store.rows.size).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(store.calls.some((c) => c.startsWith("insertRow:") || c.startsWith("uploadObject:"))).toBe(
      false,
    );
    expect(formatImportResult(res)).toContain("Dry run");
  });

  it("reclassifies concurrent duplicate inserts as skipped or skipped_different instead of inflating inserted", async () => {
    const page1 = makePage("sample:M:3a", "Same title");
    const page2 = makePage("sample:M:4a", "Local title");
    writeJson(recordsDir, "p1.json", page1);
    writeJson(recordsDir, "p2.json", page2);

    // Simulate another writer inserting both rows after initial findExisting returns empty.
    let initialLookupDone = false;
    const baseFindExisting = store.findExisting.bind(store);
    store.findExisting = async (sourceRefs: string[]) => {
      const result = await baseFindExisting(sourceRefs);
      if (!initialLookupDone) {
        initialLookupDone = true;
        store.rows.set("sample:M:3a", {
          source_ref: "sample:M:3a",
          kind: "page",
          path: null,
          transcript: structuredClone(page1),
          transcript_status: "machine_read",
        });
        store.rows.set("sample:M:4a", {
          source_ref: "sample:M:4a",
          kind: "page",
          path: null,
          transcript: makePage("sample:M:4a", "Concurrent different title"),
          transcript_status: "machine_read",
        });
      }
      return result;
    };

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
      replaced: 0,
      skipped: 1,
      skippedDifferent: 1,
      photosUploaded: 0,
    });
    expect(res.skippedDifferentRefs).toEqual(["sample:M:4a"]);
  });

  it("CLI fails with a clear error before reading files when SUPABASE_URL or SUPABASE_SECRET_KEY is missing", () => {
    const scriptPath = resolve(process.cwd(), "scripts/reference-import.mjs");
    let failed = false;
    let stderr = "";
    try {
      execFileSync(process.execPath, [scriptPath, "--records", join(rootDir, "does-not-exist")], {
        env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      failed = true;
      const e = err as { status?: number; stderr?: string };
      expect(e.status).not.toBe(0);
      stderr = e.stderr ?? "";
    }
    expect(failed).toBe(true);
    expect(stderr).toContain("SUPABASE_URL");
    expect(stderr).toContain("SUPABASE_SECRET_KEY");
  });

  describe("with replace", () => {
    const WRITE_CALL_RE = /^(insertRow|uploadObject|replaceObject|updateRow):/;
    const oldImg = new Uint8Array([1, 2, 3, 4]);
    const newImg = new Uint8Array([5, 6, 7, 8]);

    function writeCalls(target: MemoryReferenceStore = store): string[] {
      return target.calls.filter((c) => WRITE_CALL_RE.test(c));
    }

    function rowOf(ref: string, target: MemoryReferenceStore = store): StoredRow {
      const row = target.rows.get(ref);
      if (!row) throw new Error(`no row for ${ref}`);
      return row;
    }

    function titleOf(ref: string, target: MemoryReferenceStore = store): string | null {
      return (rowOf(ref, target).transcript as PageRecord).topic.title;
    }

    function writePhotos(entries: Array<{ file: string; bytes: Uint8Array; ref: string }>): void {
      for (const e of entries) writeBytes(photosDir, e.file, e.bytes);
      writeJson(photosDir, "photos-manifest.json", {
        version: 1,
        photos: entries.map((e) => ({
          file: e.file,
          sha256: sha256Hex(e.bytes),
          original_name: e.file,
          width: 3024,
          height: 4032,
          source_ref: e.ref,
        })),
      });
    }

    it("without the flag still counts a different row as skipped_different and writes nothing", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, store });
      expect(res.counts).toMatchObject({ replaced: 0, skippedDifferent: 1 });
      expect(res.skippedDifferentRefs).toEqual(["sample:M:3a"]);
      expect(res.replacedRefs).toEqual([]);
      expect(writeCalls()).toEqual([]);
      expect(titleOf("sample:M:3a")).toBe("First title");
      expect(formatImportResult(res)).toContain("inserted=0 replaced=0 skipped=0 skipped_different=1");

      // A new photo for the existing row: still no write, and no lookup of which rows use a path.
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.calls = [];
      const withPhoto = await importReferenceRecords({ recordsDir, photosDir, store });
      expect(withPhoto.counts).toMatchObject({ skippedDifferent: 1, photosUploaded: 0 });
      expect(writeCalls()).toEqual([]);
      expect(store.calls.some((c) => c.startsWith("refsByPath:"))).toBe(false);
    });

    it("refuses two records of one run that plan the same photo path", () => {
      // buildReferencePhotoPath gives each source_ref its own path, so files alone cannot make this.
      const res = checkPathOwnership(
        [
          { ref: "sample:M:3a", plannedPhotoPath: "sample/M/3a.jpg", decision: null },
          { ref: "sample:M:3b", plannedPhotoPath: "sample/M/3a.jpg", decision: null },
        ],
        new Map(),
      );
      expect(res.problems).toEqual([
        'storage: sample:M:3a and sample:M:3b plan the same photo path "sample/M/3a.jpg"; nothing was written',
      ]);
    });

    it("replaces a changed transcript in place and keeps id, created_at and note", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      await importReferenceRecords({ recordsDir, store });
      rowOf("sample:M:3a").note = "kept note";
      const before = { ...rowOf("sample:M:3a") };
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(res.counts).toEqual({
        recordsRead: 1,
        inserted: 0,
        replaced: 1,
        skipped: 0,
        skippedDifferent: 0,
        photosUploaded: 0,
      });
      expect(res.replacedRefs).toEqual(["sample:M:3a"]);
      expect(res.statusLowered).toEqual([]);
      expect(res.leftoverPhotos).toEqual([]);
      expect(writeCalls()).toEqual(["updateRow:sample:M:3a"]);
      expect(titleOf("sample:M:3a")).toBe("Changed title");
      const after = rowOf("sample:M:3a");
      expect(after).toMatchObject({
        id: before.id,
        created_at: before.created_at,
        note: "kept note",
        path: null,
        transcript_status: "machine_read",
      });
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(formatImportResult(res)).toContain("replaced: sample:M:3a");
    });

    it("replaces a status change up without a list entry, and lists every change down", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      await importReferenceRecords({ recordsDir, store });

      writeJson(recordsDir, "status.json", { "sample:M:3a": "human_checked" });
      tieChecked(recordsDir, "p1.json", "sample:M:3a", oldImg);
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      const up = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(up.problems).toEqual([]);
      expect(up.counts.replaced).toBe(1);
      const again = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(again.counts).toMatchObject({ replaced: 0, skipped: 1 });
      expect(up.statusLowered).toEqual([]);
      expect(rowOf("sample:M:3a").transcript_status).toBe("human_checked");

      writeJson(recordsDir, "status.json", { "sample:M:3a": "double_read" });
      const down = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(down.counts.replaced).toBe(1);
      expect(down.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "human_checked", to: "double_read" },
      ]);
      expect(rowOf("sample:M:3a").transcript_status).toBe("double_read");
      expect(formatImportResult(down)).toContain(
        "status_lowered: sample:M:3a (human_checked -> double_read)",
      );

      // A record left out of status.json is machine_read, which is also a change down.
      // (The page was read again in a new folder: it has no digests there.)
      rmSync(join(recordsDir, "status.json"));
      rmSync(join(recordsDir, CHECKED_DIGESTS_FILE));
      const dropped = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(dropped.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "double_read", to: "machine_read" },
      ]);
    });

    it("accepts agreement_accepted status on import and orders it between machine_read and double_read", async () => {
      writeJson(recordsDir, "p1.json", {
        ...makePage("sample:M:3a"),
        single_read: ["topic.title"],
      });
      writeJson(recordsDir, "status.json", { "sample:M:3a": "agreement_accepted" });

      const first = await importReferenceRecords({ recordsDir, store });
      expect(first.ok).toBe(true);
      expect(first.counts.inserted).toBe(1);
      expect(rowOf("sample:M:3a").transcript_status).toBe("agreement_accepted");

      // Upgrading agreement_accepted -> double_read is not a lowering.
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "status.json", { "sample:M:3a": "double_read" });
      const up = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(up.ok).toBe(true);
      expect(up.statusLowered).toEqual([]);
      expect(rowOf("sample:M:3a").transcript_status).toBe("double_read");

      // Lowering double_read -> agreement_accepted and agreement_accepted -> machine_read are both reported.
      writeJson(recordsDir, "p1.json", {
        ...makePage("sample:M:3a"),
        single_read: ["topic.title"],
      });
      writeJson(recordsDir, "status.json", { "sample:M:3a": "agreement_accepted" });
      const toAccepted = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(toAccepted.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "double_read", to: "agreement_accepted" },
      ]);

      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "status.json", { "sample:M:3a": "machine_read" });
      const toMachine = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(toMachine.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "agreement_accepted", to: "machine_read" },
      ]);
    });

    it("overwrites the photo when only its bytes changed and touches nothing in the row but updated_at", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      const before = { ...rowOf("sample:M:3a") };
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(res.counts).toMatchObject({ replaced: 1, skipped: 0, photosUploaded: 1 });
      expect(writeCalls()).toEqual(["replaceObject:sample/M/3a.jpg", "updateRow:sample:M:3a"]);
      expect(store.objects.get("sample/M/3a.jpg")?.bytes).toEqual(newImg);
      const after = rowOf("sample:M:3a");
      expect({ ...after, updated_at: undefined }).toEqual({ ...before, updated_at: undefined });
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(res.leftoverPhotos).toEqual([]);
    });

    it("moves the row to a new photo path and names the old object as a leftover without deleting it", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      writePhotos([{ file: "IMG_0001.png", bytes: newImg, ref: "sample:M:3a" }]);
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(rowOf("sample:M:3a").path).toBe("sample/M/3a.png");
      expect(store.objects.get("sample/M/3a.jpg")?.bytes).toEqual(oldImg);
      expect(store.objects.get("sample/M/3a.png")?.bytes).toEqual(newImg);
      expect(res.leftoverPhotos).toEqual(["sample/M/3a.jpg"]);
      expect(writeCalls()).toEqual(["replaceObject:sample/M/3a.png", "updateRow:sample:M:3a"]);
      expect(formatImportResult(res)).toContain('leftover_photo: "sample/M/3a.jpg"');
    });

    it("prints a stored path in one quoted form with quote, backslash, control and direction marks escaped", async () => {
      // Escape, Arabic letter mark, left-to-right and right-to-left marks, embeddings and
      // overrides, isolates, and the byte order mark.
      const marks = [0x1b, 0x61c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e]
        .concat([0x2066, 0x2067, 0x2068, 0x2069, 0xfeff])
        .map((code) => String.fromCodePoint(code));
      const storedPath = `sample/M/3a"\\${marks.join("")}.jpg`;
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.rows.set("sample:M:3a", {
        source_ref: "sample:M:3a",
        kind: "page",
        path: storedPath,
        transcript: makePage("sample:M:3a"),
        transcript_status: "machine_read",
      });

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      const out = formatImportResult(res);
      expect(res.leftoverPhotos).toEqual([storedPath]);
      const escaped = [
        "\\u{1b}\\u{61c}\\u{200e}\\u{200f}\\u{202a}\\u{202b}\\u{202c}\\u{202d}\\u{202e}",
        "\\u{2066}\\u{2067}\\u{2068}\\u{2069}\\u{feff}",
      ].join("");
      expect(out).toContain(`leftover_photo: "sample/M/3a\\"\\\\${escaped}.jpg" is no longer used`);
      for (const mark of marks) expect(out).not.toContain(mark);
    });

    it("refuses before any write when a replace would overwrite a photo that another row uses", async () => {
      writeJson(recordsDir, "z.json", makeContents("demo:Z:contents"));
      writePhotos([{ file: "chart.jpg", bytes: oldImg, ref: "demo:Z:contents" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      // A row that is not in this run points to the same object.
      store.rows.set("demo:Y:contents", {
        source_ref: "demo:Y:contents",
        kind: "contents",
        path: "demo/Z/contents.jpg",
        transcript: makeContents("demo:Y:contents"),
        transcript_status: "machine_read",
      });
      writePhotos([{ file: "chart.jpg", bytes: newImg, ref: "demo:Z:contents" }]);

      for (const dryRun of [true, false]) {
        store.calls = [];
        const res = await importReferenceRecords({
          recordsDir,
          photosDir,
          store,
          replace: true,
          dryRun,
        });
        expect(res.ok).toBe(false);
        expect(res.stopped).toBeUndefined();
        expect(store.calls).toContain("refsByPath:demo/Z/contents.jpg");
        expect(writeCalls()).toEqual([]);
        expect(res.problems).toHaveLength(1);
        expect(res.problems[0]).toContain('"demo/Z/contents.jpg"');
        expect(res.problems[0]).toContain('"demo:Y:contents"');
      }
      expect(store.objects.get("demo/Z/contents.jpg")?.bytes).toEqual(oldImg);
    });

    it("names an old path as a leftover only when no row uses it after the run, and only once", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      // sample:M:3b uses the same object as sample:M:3a.
      rowOf("sample:M:3b").path = "sample/M/3a.jpg";

      // The run holds only sample:M:3a and moves it to a new path; sample:M:3b still uses the old one.
      rmSync(join(recordsDir, "p2.json"));
      writePhotos([{ file: "IMG_0001.png", bytes: newImg, ref: "sample:M:3a" }]);
      const dryOne = await importReferenceRecords({
        recordsDir,
        photosDir,
        store,
        replace: true,
        dryRun: true,
      });
      const one = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect({ ...dryOne, dryRun: false }).toEqual(one);
      expect(one.counts.replaced).toBe(1);
      expect(one.leftoverPhotos).toEqual([]);
      expect(formatImportResult(one)).not.toContain("leftover_photo");
      expect(rowOf("sample:M:3b").path).toBe("sample/M/3a.jpg");
      expect(store.objects.get("sample/M/3a.jpg")?.bytes).toEqual(oldImg);

      // Both rows use the old path again, and this run moves both away: one leftover line.
      rowOf("sample:M:3a").path = "sample/M/3a.jpg";
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
      writePhotos([
        { file: "IMG_0001.png", bytes: newImg, ref: "sample:M:3a" },
        { file: "IMG_0002.png", bytes: oldImg, ref: "sample:M:3b" },
      ]);
      const dryBoth = await importReferenceRecords({
        recordsDir,
        photosDir,
        store,
        replace: true,
        dryRun: true,
      });
      const both = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect({ ...dryBoth, dryRun: false }).toEqual(both);
      expect(both.counts.replaced).toBe(2);
      expect(both.leftoverPhotos).toEqual(["sample/M/3a.jpg"]);
      expect(formatImportResult(both).match(/leftover_photo:/g)).toHaveLength(1);
      expect(store.objects.has("sample/M/3a.jpg")).toBe(true);
    });

    it("keeps the stored path and touches no object when a record has no planned photo", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      writePhotos([
        { file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" },
        { file: "IMG_0002.jpg", bytes: newImg, ref: "sample:M:3b" },
      ]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));

      // The manifest no longer has an entry for sample:M:3b.
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      store.calls = [];
      const partial = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(partial.counts).toMatchObject({ replaced: 2, photosUploaded: 0 });
      expect(rowOf("sample:M:3b").path).toBe("sample/M/3b.jpg");
      expect(store.calls.some((c) => c.includes("sample/M/3b"))).toBe(false);
      expect(partial.leftoverPhotos).toEqual([]);

      // No --photos at all.
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Third title"));
      store.calls = [];
      const none = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(none.counts).toMatchObject({ replaced: 1, skipped: 1, photosUploaded: 0 });
      expect(rowOf("sample:M:3a").path).toBe("sample/M/3a.jpg");
      expect(
        store.calls.filter((c) => c.startsWith("objectSha256:") || c.startsWith("replaceObject:")),
      ).toEqual([]);
      expect(none.leftoverPhotos).toEqual([]);
    });

    it("skips a row that is the same in transcript, status, path and photo bytes with zero writes", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
      writeJson(recordsDir, "status.json", { "sample:M:3a": "double_read" });
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.counts).toEqual({
        recordsRead: 2,
        inserted: 0,
        replaced: 0,
        skipped: 2,
        skippedDifferent: 0,
        photosUploaded: 0,
      });
      expect(writeCalls()).toEqual([]);
    });

    it("inserts new rows, replaces changed rows and skips same rows in one run", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));
      writeJson(recordsDir, "p3.json", makePage("sample:M:4a"));

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(res.counts).toEqual({
        recordsRead: 3,
        inserted: 1,
        replaced: 1,
        skipped: 1,
        skippedDifferent: 0,
        photosUploaded: 0,
      });
      expect(res.replacedRefs).toEqual(["sample:M:3b"]);
      expect(titleOf("sample:M:3b")).toBe("Changed title");
      expect(store.rows.has("sample:M:4a")).toBe(true);
      expect(formatImportResult(res).split("\n")[0]).toBe(
        "Import summary: records_read=3 inserted=1 replaced=1 skipped=1 skipped_different=0 photos_uploaded=0",
      );
    });

    it("dry run makes zero write calls and reports the same counts and lists as the real run", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      writeJson(recordsDir, "status.json", { "sample:M:3a": "human_checked" });
      tieChecked(recordsDir, "p1.json", "sample:M:3a", oldImg);
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      const firstRun = await importReferenceRecords({ recordsDir, photosDir, store });
      expect(firstRun.problems).toEqual([]);

      // The page was read again in a new folder: it has no digests there.
      writeJson(recordsDir, "status.json", {});
      rmSync(join(recordsDir, CHECKED_DIGESTS_FILE));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));
      writeJson(recordsDir, "p3.json", makePage("sample:M:4a"));
      writePhotos([{ file: "IMG_0001.png", bytes: newImg, ref: "sample:M:3a" }]);
      const snapshot = () => structuredClone({ rows: [...store.rows], objects: [...store.objects] });
      const before = snapshot();
      store.calls = [];

      const dry = await importReferenceRecords({
        recordsDir,
        photosDir,
        store,
        dryRun: true,
        replace: true,
      });
      expect(dry.ok).toBe(true);
      expect(writeCalls()).toEqual([]);
      expect(snapshot()).toEqual(before);
      expect(formatImportResult(dry)).toContain("Dry run summary");

      const real = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(real.counts).toEqual({
        recordsRead: 3,
        inserted: 1,
        replaced: 2,
        skipped: 0,
        skippedDifferent: 0,
        photosUploaded: 1,
      });
      expect(real.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "human_checked", to: "machine_read" },
      ]);
      expect(real.leftoverPhotos).toEqual(["sample/M/3a.jpg"]);
      expect({ ...dry, dryRun: false }).toEqual(real);
    });

    it("still refuses before any write when an object with other bytes is at the path of a ref with no row", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.objects.set("sample/M/3a.jpg", { bytes: oldImg, contentType: "image/jpeg" });

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.ok).toBe(false);
      expect(res.stopped).toBeUndefined();
      expect(writeCalls()).toEqual([]);
      expect(res.problems.some((p) => p.includes("sample/M/3a.jpg") && p.includes("by hand"))).toBe(
        true,
      );
    });

    it("refuses an invalid record before any write", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p2.json", { ...makePage("sample:M:3b"), extra_key: "nope" });
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(false);
      expect(store.calls).toEqual([]);
      expect(res.problems.some((p) => p.includes("p2.json"))).toBe(true);
    });

    it("stops when a row update fails after its photo was replaced, and a second run ends like a clean run", async () => {
      const clean = new MemoryReferenceStore();
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      writePhotos([{ file: "IMG_0002.jpg", bytes: oldImg, ref: "sample:M:3b" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      await importReferenceRecords({ recordsDir, photosDir, store: clean });

      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));
      writePhotos([{ file: "IMG_0002.jpg", bytes: newImg, ref: "sample:M:3b" }]);

      const realUpdate = store.updateRow.bind(store);
      let failNext = true;
      store.updateRow = async (row) => {
        if (row.source_ref === "sample:M:3b" && failNext) {
          failNext = false;
          throw new Error("database is not reachable");
        }
        return realUpdate(row);
      };

      const first = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(first.ok).toBe(false);
      expect(first.stopped).toBe(true);
      expect(first.counts).toMatchObject({ replaced: 1, photosUploaded: 1 });
      expect(first.replacedRefs).toEqual(["sample:M:3a"]);
      expect(
        first.problems.some(
          (p) => p.includes('"sample/M/3b.jpg"') && p.includes("already the new one"),
        ),
      ).toBe(true);
      expect(first.problems.some((p) => p.includes("replaced 1"))).toBe(true);
      expect(formatImportResult(first)).toContain("Import stopped after a write error");
      expect(store.objects.get("sample/M/3b.jpg")?.bytes).toEqual(newImg);
      expect(titleOf("sample:M:3b")).toBe("First title");

      const second = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(second.ok).toBe(true);
      expect(second.counts).toMatchObject({ replaced: 1, skipped: 1, photosUploaded: 0 });
      expect(second.replacedRefs).toEqual(["sample:M:3b"]);

      const cleanRun = await importReferenceRecords({
        recordsDir,
        photosDir,
        store: clean,
        replace: true,
      });
      expect(cleanRun.ok).toBe(true);
      const endState = (target: MemoryReferenceStore) => ({
        rows: [...target.rows].map(([ref, row]) => [ref, { ...row, updated_at: undefined }]),
        objects: [...target.objects],
      });
      expect(endState(store)).toEqual(endState(clean));
    });

    it("stops with a clear problem when the row to update is no longer there", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      // Another person removes the row after this run read it.
      store.updateRow = async (row) => {
        store.rows.delete(row.source_ref);
        return false;
      };

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(false);
      expect(res.stopped).toBe(true);
      expect(res.counts.replaced).toBe(0);
      expect(res.replacedRefs).toEqual([]);
      expect(
        res.problems.some((p) => p.includes("sample:M:3a") && p.includes("no row with this source_ref")),
      ).toBe(true);
    });
  });
});

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHECKED_DIGESTS_FILE, importReferenceRecords, type PageRecord } from "@/lib/reference-record";
import { MemoryReferenceStore } from "@/lib/reference-record/import-store.fixtures";
import { checkAndMarkPage } from "./check";
import { compareWorkFolder, countPageStatuses, formatPagesSentToPerson } from "./compare-batch";
import { addPreparedPhoto, fakePhoto } from "./photo.fixtures";

const REF = "sample:M:3a";
const RECORD_CHANGED = "record changed after the check";
const PHOTO_CHANGED = "photo changed after the check";
const PHOTO_MISSING = "photo of the check is missing";
const PHOTO_MISMATCH = "photo does not match the photo list";
const BEFORE_DIGESTS = "checked before the photo check was saved";
const NOT_MARKED = "check does not count any more (check the page again)";

function makePage(sourceRef: string, title = "Adding Numbers"): PageRecord {
  return {
    kind: "page",
    source_ref: sourceRef,
    topic: { title, number: 1 },
    sections: [
      {
        instruction: "Add the numbers.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "12 + 5 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [12, 5] },
            responses: [{ position: "after_equals", cue: null, answer: "17", answer_source: "computed" }],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  };
}

describe("a page checked by a person", () => {
  let root: string;
  let repo: string;
  let work: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ref-checked-"));
    repo = join(root, "repo");
    work = join(root, "work");
    mkdirSync(repo);
    mkdirSync(work);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const finalPath = (name: string) => join(work, "final", name);
  const recordPath = (ref = REF) => finalPath(`${ref.replace(/:/g, "-")}.json`);
  const viewPath = (ref = REF) => join(work, "final-view", `${ref.replace(/:/g, "-")}.md`);
  const recordBytes = (ref = REF) => readFileSync(recordPath(ref));
  const statusMap = () =>
    JSON.parse(readFileSync(finalPath("status.json"), "utf8")) as Record<string, string>;
  const digestFile = () =>
    JSON.parse(readFileSync(finalPath(CHECKED_DIGESTS_FILE), "utf8")) as {
      pages: Array<{ source_ref: string }>;
      checked_before: string[];
    };
  const reportMd = () => readFileSync(finalPath("report.md"), "utf8");
  const compare = () => compareWorkFolder({ workDir: work, repoRoot: repo });
  const check = (ref = REF) =>
    checkAndMarkPage({ workDir: work, page: ref, repoRoot: repo, photoCompared: true });

  // Both readers give each of these photos the same page id (reader b also by its own readB id).
  function setReadings(
    readings: Array<{ photo: string; name?: string; ref: string; title?: string; titleB?: string }>,
  ): void {
    for (const [slot, family] of [["a", "codex"], ["b", "claude"]] as const) {
      const dir = join(work, `reader-${slot}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir);
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      const photos = readings.map((r, i) => {
        const file = `record-${i}.json`;
        const title = slot === "b" ? (r.titleB ?? r.title) : r.title;
        writeFileSync(join(dir, file), JSON.stringify(makePage(r.ref, title)));
        const { sha256, file: photo } = fakePhoto(r.photo);
        return {
          photo,
          original_name: r.name ?? `${r.photo}.jpg`,
          photo_sha256: sha256,
          status: "ok",
          source_ref: r.ref,
          record_file: file,
          notes: [],
        };
      });
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({ slot, reader: { family, model: "m1" }, source: "sample", photos }),
      );
    }
  }

  // Page 3a is corrected by a person and checked against photo "p1"; page 4a is not checked.
  function setUpChecked(): Buffer {
    addPreparedPhoto(work, "p1");
    addPreparedPhoto(work, "p2");
    setReadings([{ photo: "p1", ref: REF }, { photo: "p2", ref: "sample:M:4a" }]);
    compare();
    writeFileSync(recordPath(), JSON.stringify(makePage(REF, "Corrected by a person")));
    check();
    return recordBytes();
  }

  function pageOf(report: ReturnType<typeof compare>, ref = REF) {
    const page = report.pages.find((p) => p.source_ref === ref);
    if (!page) throw new Error(`no page ${ref}`);
    return page;
  }

  // The page is machine_read in every output, and its reason is in the list of pages for a person.
  function expectSentToPerson(report: ReturnType<typeof compare>, reasons: string[], ref = REF): void {
    expect(statusMap()[ref]).toBe("machine_read");
    expectSameCounts(report);
    const page = report.pages.find((p) => p.source_ref === ref);
    if (page) {
      expect(page.status).toBe("machine_read");
      expect(page.result).toBe("sent to a person");
      expect(page.check_problems).toEqual(reasons);
    }
    const sent = report.pages_sent_to_person?.find((p) => p.source_ref === ref);
    for (const reason of reasons) {
      expect(sent?.reason).toContain(reason);
      expect(reportMd()).toContain(reason);
      expect(formatPagesSentToPerson(report)).toContain(reason);
    }
    expect(reportMd()).toContain("run reference:check for this page");
    expect(report.kept_human_checked.find((k) => k.source_ref === ref)?.check_problems).toEqual(reasons);
  }

  // The summary counts of a run, the list of pages for a person and status.json say the same.
  function expectSameCounts(report: ReturnType<typeof compare>): void {
    const counts = countPageStatuses(report);
    const statuses = Object.values(statusMap());
    for (const status of ["double_read", "agreement_accepted", "machine_read", "human_checked"] as const) {
      expect(counts[status], status).toBe(statuses.filter((s) => s === status).length);
    }
    const sent = report.pages_sent_to_person ?? [];
    expect(sent).toHaveLength(counts.machine_read);
    expect(sent.map((p) => p.source_ref).sort()).toEqual(
      Object.keys(statusMap()).filter((ref) => statusMap()[ref] === "machine_read").sort(),
    );
    expect(formatPagesSentToPerson(report)).toContain(
      sent.length === 0 ? "Pages sent to a person: none." : `Pages sent to a person (${sent.length}):`,
    );
  }

  it("stays human_checked when nothing changed, also on a second and a third run", () => {
    const before = setUpChecked();
    for (let round = 1; round <= 3; round += 1) {
      const report = compare();
      expect(pageOf(report).status).toBe("human_checked");
      expect(pageOf(report).result).toBe("checked by a person");
      expect(pageOf(report).check_problems).toBeUndefined();
      expect(report.pages_sent_to_person).toEqual([]);
      expectSameCounts(report);
      expect(statusMap()).toEqual({ [REF]: "human_checked", "sample:M:4a": "double_read" });
      expect(recordBytes().equals(before)).toBe(true);
    }
    expect(reportMd()).not.toContain("reference:check");

    // A page with no reading in this run keeps its check too: its photo is still in the photo list.
    setReadings([{ photo: "p2", ref: "sample:M:4a" }]);
    for (let round = 1; round <= 2; round += 1) {
      const report = compare();
      expect(statusMap()[REF]).toBe("human_checked");
      expect(report.pages_sent_to_person).toEqual([]);
      expectSameCounts(report);
      expect(recordBytes().equals(before)).toBe(true);
    }
  });

  it("is sent to a person, with its record kept byte for byte, after each change of the record or the photo", () => {
    const photosDir = () => join(work, "photos");
    const changeAnswer = () => {
      const record = JSON.parse(readFileSync(recordPath(), "utf8")) as PageRecord;
      record.sections[0].items[0].responses[0].answer = "18";
      writeFileSync(recordPath(), `${JSON.stringify(record, null, 2)}\n`);
    };
    const replacePhoto = () => {
      addPreparedPhoto(work, "p9");
      setReadings([{ photo: "p9", ref: REF }, { photo: "p2", ref: "sample:M:4a" }]);
    };
    const rows: Array<{ name: string; change: () => void; reasons: string[] }> = [
      { name: "stored answer changed", change: changeAnswer, reasons: [RECORD_CHANGED] },
      {
        name: "one byte added",
        change: () => writeFileSync(recordPath(), Buffer.concat([recordBytes(), Buffer.from(" ")])),
        reasons: [RECORD_CHANGED],
      },
      {
        name: "single_read added",
        change: () =>
          writeFileSync(recordPath(), JSON.stringify({ ...makePage(REF), single_read: ["topic.title"] })),
        reasons: [RECORD_CHANGED],
      },
      {
        name: "record is not valid now",
        change: () => writeFileSync(recordPath(), "{ not json"),
        reasons: [RECORD_CHANGED],
      },
      { name: "new photo with the same page id", change: replacePhoto, reasons: [PHOTO_CHANGED] },
      {
        name: "photo file has other bytes",
        change: () => writeFileSync(join(photosDir(), fakePhoto("p1").file), "other bytes"),
        reasons: [PHOTO_MISMATCH],
      },
      {
        name: "photo list gives another digest, photo file is the one of the check",
        change: () => {
          const path = join(photosDir(), "photos-manifest.json");
          const { sha256 } = fakePhoto("p1");
          writeFileSync(path, readFileSync(path, "utf8").replace(sha256, `${sha256.slice(0, 12)}${"0".repeat(52)}`));
          // With no reading, the photo list alone names the photo of the page.
          setReadings([{ photo: "p2", ref: "sample:M:4a" }]);
        },
        reasons: [PHOTO_MISMATCH],
      },
      {
        name: "photo list gives the digest of the check, photo file has other bytes, record changed",
        change: () => {
          changeAnswer();
          writeFileSync(join(photosDir(), fakePhoto("p1").file), "other bytes");
        },
        reasons: [RECORD_CHANGED, PHOTO_MISMATCH],
      },
      {
        name: "photo file is missing",
        change: () => rmSync(join(photosDir(), fakePhoto("p1").file)),
        reasons: [PHOTO_MISSING],
      },
      {
        name: "photos folder is missing",
        change: () => rmSync(photosDir(), { recursive: true }),
        reasons: [PHOTO_MISSING],
      },
      {
        name: "photo list does not name the photo",
        change: () => {
          rmSync(join(photosDir(), "photos-manifest.json"));
          addPreparedPhoto(work, "p2");
        },
        reasons: [PHOTO_MISSING],
      },
      {
        name: "record and photo changed",
        change: () => {
          changeAnswer();
          replacePhoto();
        },
        reasons: [RECORD_CHANGED, PHOTO_CHANGED],
      },
      {
        name: "the two readers read different photos",
        change: () => {
          addPreparedPhoto(work, "p9");
          setReadings([{ photo: "p9", ref: REF }]);
          const runB = join(work, "reader-b", "run.json");
          const text = readFileSync(runB, "utf8");
          writeFileSync(runB, text.replaceAll(fakePhoto("p9").sha256, fakePhoto("p1").sha256));
        },
        reasons: [PHOTO_CHANGED],
      },
      {
        name: "page with no reading, record changed",
        change: () => {
          changeAnswer();
          setReadings([{ photo: "p2", ref: "sample:M:4a" }]);
        },
        reasons: [RECORD_CHANGED],
      },
      {
        name: "page with no reading, its photo now has another page id",
        change: () => setReadings([{ photo: "p1", ref: "sample:M:5a" }]),
        reasons: [PHOTO_MISSING],
      },
      {
        name: "status.json has another status",
        change: () => writeFileSync(finalPath("status.json"), JSON.stringify({ [REF]: "double_read" })),
        reasons: [NOT_MARKED],
      },
      {
        name: "status.json is missing",
        change: () => rmSync(finalPath("status.json")),
        reasons: [NOT_MARKED],
      },
    ];
    for (const row of rows) {
      rmSync(work, { recursive: true });
      mkdirSync(work);
      setUpChecked();
      compare();
      row.change();
      const before = recordBytes();
      // Also on later runs, when status.json does not say human_checked any more.
      for (let round = 1; round <= 3; round += 1) {
        const report = compare();
        expect(recordBytes().equals(before), `${row.name}, round ${round}`).toBe(true);
        expectSentToPerson(report, row.reasons);
        // The photo of another page is not touched, and the page id is in the photo list once at most.
        expect(digestFile().pages.map((p) => p.source_ref), row.name).toEqual([REF]);
      }
      // The loss of one saved file does not lose the record of the person.
      for (const name of ["status.json", "report.json", CHECKED_DIGESTS_FILE]) {
        rmSync(finalPath(name));
        expect(pageStatusAfterCompare(), `${row.name}, without ${name}`).not.toBe("human_checked");
        expect(recordBytes().equals(before), `${row.name}, without ${name}`).toBe(true);
      }
    }
  });

  function pageStatusAfterCompare(ref = REF): string {
    compare();
    return statusMap()[ref];
  }

  it("keeps its photo when the winning pair of readings names no photo, and only then", async () => {
    const manifestRefs = () =>
      (JSON.parse(readFileSync(join(work, "photos", "photos-manifest.json"), "utf8")) as {
        photos: Array<{ sha256: string; source_ref?: string }>;
      }).photos.filter((p) => p.source_ref === REF).map((p) => p.sha256);
    const rows: Array<{ name: string; runs: string[]; photo: string; reasons: string[]; unlisted?: boolean }> = [
      { name: "new photo that the photo list does not have", runs: [], photo: "p9", reasons: [], unlisted: true },
      { name: "both runs lost", runs: ["a", "b"], photo: "p1", reasons: [] },
      { name: "run of reader a lost", runs: ["a"], photo: "p1", reasons: [] },
      { name: "run of reader b lost", runs: ["b"], photo: "p1", reasons: [] },
      // Reader b's photo does not name the photo of reader a's text.
      { name: "run of reader a lost, reader b read a new photo", runs: ["a"], photo: "p9", reasons: [] },
      { name: "new photo", runs: [], photo: "p9", reasons: [PHOTO_CHANGED] },
      { name: "new photo, run of reader b lost", runs: ["b"], photo: "p9", reasons: [PHOTO_CHANGED] },
    ];
    for (const { name, runs, photo, reasons, unlisted } of rows) {
      rmSync(work, { recursive: true });
      mkdirSync(work);
      const before = setUpChecked();
      compare();
      if (!unlisted) addPreparedPhoto(work, "p9");
      setReadings([{ photo, ref: REF }, { photo: "p2", ref: "sample:M:4a" }]);
      for (const slot of runs) rmSync(join(work, `reader-${slot}`, "run.json"));
      for (let round = 1; round <= 2; round += 1) {
        const report = compare();
        expect(recordBytes().equals(before), name).toBe(true);
        expect(manifestRefs(), name).toEqual([fakePhoto(reasons.length > 0 ? photo : "p1").sha256]);
        if (reasons.length > 0) expectSentToPerson(report, reasons);
        else expect(statusMap()[REF], name).toBe("human_checked");
      }
      if (reasons.length === 0) await expectImported("human_checked", "Corrected by a person", "p1", name);
    }
  });

  it("is never written over or removed under a page id in other letter case", () => {
    const ALIAS = "sample:m:3a";
    const rows: Array<{ name: string; change: () => void }> = [
      {
        name: "a reader gives the id, and the checked record is not valid now",
        change: () => {
          writeFileSync(recordPath(), "{ not json");
          setReadings([{ photo: "p1", ref: ALIAS }]);
        },
      },
      { name: "a reader gives the id", change: () => setReadings([{ photo: "p1", ref: ALIAS }]) },
      {
        name: "status.json lists both ids",
        change: () =>
{
          writeFileSync(finalPath("sample-m-3a.json"), recordBytes());
          writeFileSync(finalPath("status.json"), JSON.stringify({ [REF]: "human_checked", [ALIAS]: "double_read" }));
        },
      },
    ];
    for (const row of rows) {
      rmSync(work, { recursive: true });
      mkdirSync(work);
      setUpChecked();
      compare();
      row.change();
      const before = recordBytes();
      const status = readFileSync(finalPath("status.json"), "utf8");
      expect(compare, row.name).toThrow(/Refusing to (write|overwrite).*sample-m-3a\.json/i);
      expect(recordBytes().equals(before), row.name).toBe(true);
      expect(readFileSync(finalPath("status.json"), "utf8"), row.name).toBe(status);
    }

    // After the person let go of the record, the page with the other id gets a record of its own.
    rmSync(work, { recursive: true });
    mkdirSync(work);
    setUpChecked();
    compare();
    rmSync(recordPath());
    setReadings([{ photo: "p1", ref: ALIAS }]);
    for (let round = 1; round <= 2; round += 1) {
      compare();
      expect(statusMap()).toEqual({ [ALIAS]: "double_read" });
      expect(JSON.parse(recordBytes(ALIAS).toString("utf8")).source_ref).toBe(ALIAS);
      expect(existsSync(viewPath(ALIAS))).toBe(true);
    }
  });

  it("keeps the record when its file name on disk has another letter case", () => {
    const before = setUpChecked();
    const alias = finalPath("sample-m-3a.json");
    renameSync(recordPath(), alias);
    // On a disk that sees two files here, the record file of the page is gone: the person let it go.
    if (!existsSync(recordPath())) return;
    for (let round = 1; round <= 2; round += 1) {
      compare();
      expect(recordBytes().equals(before)).toBe(true);
      expect(statusMap()[REF]).toBe("human_checked");
    }
  });

  it("keeps both records when the photos of two checked pages swap their page ids", () => {
    addPreparedPhoto(work, "p1");
    addPreparedPhoto(work, "p2");
    setReadings([{ photo: "p1", ref: REF }, { photo: "p2", ref: "sample:M:4a" }]);
    compare();
    check(REF);
    check("sample:M:4a");
    const before = [recordBytes(REF), recordBytes("sample:M:4a")];
    expect(compare().pages.map((p) => p.status)).toEqual(["human_checked", "human_checked"]);

    setReadings([{ photo: "p2", ref: REF, title: "New" }, { photo: "p1", ref: "sample:M:4a", title: "New" }]);
    for (let round = 1; round <= 2; round += 1) {
      const report = compare();
      expectSentToPerson(report, [PHOTO_CHANGED], REF);
      expectSentToPerson(report, [PHOTO_CHANGED], "sample:M:4a");
      expect(recordBytes(REF).equals(before[0])).toBe(true);
      expect(recordBytes("sample:M:4a").equals(before[1])).toBe(true);
    }
  });

  it("is human_checked again, with new digests, after the person corrects it and checks it again", () => {
    setUpChecked();
    const oldDigests = digestFile();
    addPreparedPhoto(work, "p9");
    setReadings([{ photo: "p9", ref: REF }]);
    const changed = makePage(REF, "Corrected for the new photo");
    writeFileSync(recordPath(), JSON.stringify(changed));
    expectSentToPerson(compare(), [RECORD_CHANGED, PHOTO_CHANGED]);

    check();
    expect(digestFile()).not.toEqual(oldDigests);
    const before = recordBytes();
    for (let round = 1; round <= 2; round += 1) {
      const report = compare();
      expect(pageOf(report).status).toBe("human_checked");
      expect(report.pages_sent_to_person).toEqual([]);
      expect(recordBytes().equals(before)).toBe(true);
    }
    expect(JSON.parse(before.toString("utf8")).topic.title).toBe("Corrected for the new photo");
  });

  it("keeps a page of an older folder and sends it to a person until the person checks it again", () => {
    for (const inBatch of [true, false]) {
      rmSync(work, { recursive: true });
      mkdirSync(work);
      const before = setUpChecked();
      // A folder of an older kit has the status and no digests.
      rmSync(finalPath(CHECKED_DIGESTS_FILE));
      rmSync(finalPath("report.json"));
      if (!inBatch) setReadings([{ photo: "p2", ref: "sample:M:4a" }]);
      for (let round = 1; round <= 3; round += 1) {
        const report = compare();
        expectSentToPerson(report, [BEFORE_DIGESTS]);
        expect(recordBytes().equals(before)).toBe(true);
        // Compare saves no digest for it.
        expect(digestFile()).toEqual({ version: 1, pages: [], checked_before: [REF] });
      }
      rmSync(finalPath("report.json"));
      expectSentToPerson(compare(), [BEFORE_DIGESTS]);
      expect(recordBytes().equals(before)).toBe(true);

      check();
      expect(digestFile().checked_before).toEqual([]);
      expect(pageStatusAfterCompare()).toBe("human_checked");
      expect(pageStatusAfterCompare()).toBe("human_checked");
    }
  });

  it("gets a fresh record only when the person removed the record file", () => {
    setUpChecked();
    compare();
    rmSync(recordPath());
    const report = compare();
    expect(pageOf(report).status).toBe("double_read");
    expect(JSON.parse(readFileSync(recordPath(), "utf8")).topic.title).toBe("Adding Numbers");
    expect(digestFile().pages).toEqual([]);
    expect(pageOf(compare()).status).toBe("double_read");
  });

  async function importAll() {
    const store = new MemoryReferenceStore();
    const result = await importReferenceRecords({
      recordsDir: join(work, "final"),
      photosDir: join(work, "photos"),
      store,
    });
    return { result, store };
  }

  async function expectRefused(cause: string, name: string): Promise<void> {
    const { result, store } = await importAll();
    expect(result.problems.join("\n"), name).toMatch(new RegExp(`${REF}: .*${cause}`));
    expect([store.rows.size, store.objects.size], name).toEqual([0, 0]);
  }

  async function expectImported(status: string, title: string, photo: string, name: string): Promise<void> {
    const { result, store } = await importAll();
    expect(result.problems, name).toEqual([]);
    const row = store.rows.get(REF);
    expect(row?.transcript_status, name).toBe(status);
    expect(row?.transcript.kind === "page" && row.transcript.topic.title, name).toBe(title);
    expect(await store.objectSha256("sample/M/3a.jpg"), name).toBe(fakePhoto(photo).sha256);
  }

  it("is imported under a machine status only as compare wrote it, and an edited page only after a check", async () => {
    const edited = "Edited by a person";
    const editRecord = () => {
      const record = JSON.parse(readFileSync(recordPath(), "utf8")) as PageRecord;
      record.topic.title = edited;
      writeFileSync(recordPath(), `${JSON.stringify(record, null, 2)}\n`);
    };
    const rows: Array<{ status: string; setUp: () => void }> = [
      { status: "double_read", setUp: () => setReadings([{ photo: "p1", ref: REF }]) },
      {
        status: "agreement_accepted",
        setUp: () => setReadings([{ photo: "p1", ref: REF, titleB: "Adding Nombers" }]),
      },
      {
        status: "machine_read",
        setUp: () => {
          setReadings([{ photo: "p1", ref: REF }]);
          rmSync(join(work, "reader-b"), { recursive: true });
        },
      },
    ];
    for (const { status, setUp } of rows) {
      for (const path of ["edit after compare", "edit, then compare", "edit, then compare twice"]) {
        const name = `${status}, ${path}`;
        rmSync(work, { recursive: true });
        mkdirSync(work);
        addPreparedPhoto(work, "p1");
        setUp();
        compare();
        expect(statusMap()[REF], name).toBe(status);
        await expectImported(status, "Adding Numbers", "p1", name);

        editRecord();
        await expectRefused("report\\.json.*run reference:compare", name);
        if (path !== "edit after compare") compare();
        if (path === "edit, then compare twice") compare();
        if (path !== "edit after compare") {
          expect(statusMap()[REF], name).toBe("machine_read");
          await expectRefused("report\\.json.*run reference:compare", name);
        }

        check();
        await expectImported("human_checked", edited, "p1", name);
        compare();
        await expectImported("human_checked", edited, "p1", name);
      }
    }
  });

    it("is not imported under a machine status with the photo of another work folder", async () => {
    for (const titleB of [undefined, "Adding Nombers"]) {
      rmSync(work, { recursive: true });
      mkdirSync(work);
      addPreparedPhoto(work, "p1");
      setReadings([{ photo: "p1", ref: REF, titleB }]);
      compare();
      const status = titleB ? "agreement_accepted" : "double_read";
      await expectImported(status, "Adding Numbers", "p1", status);

      rmSync(join(work, "photos"), { recursive: true });
      addPreparedPhoto(work, "p9", REF);
      await expectRefused("another photo", status);
    }
  });

  it("ties a photo-mismatch page to reader A's photo via final_photo_sha256, accepts A's photo, and refuses B's photo", async () => {
    addPreparedPhoto(work, "p1");
    addPreparedPhoto(work, "p9");
    setReadings([{ photo: "p1", ref: REF }]);
    const runB = join(work, "reader-b", "run.json");
    writeFileSync(
      runB,
      readFileSync(runB, "utf8").replaceAll(fakePhoto("p1").sha256, fakePhoto("p9").sha256),
    );

    const report = compare();
    const page = pageOf(report);
    expect(page.status).toBe("machine_read");
    expect(page.photo_sha256).toBeNull();
    expect(page.final_photo_sha256).toBe(fakePhoto("p1").sha256);

    // Reader A's photo supplied the final text: accepted on import.
    await expectImported("machine_read", "Adding Numbers", "p1", "reader A photo");

    // Reader B's photo did not supply the final text: refused on import.
    rmSync(join(work, "photos"), { recursive: true });
    addPreparedPhoto(work, "p9", REF);
    await expectRefused("another photo", "reader B photo");

    // Reader B only: final_photo_sha256 is reader B's photo.
    rmSync(join(work, "reader-a"), { recursive: true });
    const reportB = compare();
    expect(pageOf(reportB).final_photo_sha256).toBe(fakePhoto("p9").sha256);

    // Edited or checked record keeps its own text, so final_photo_sha256 is null.
    rmSync(work, { recursive: true });
    mkdirSync(work);
    setUpChecked();
    const checkedReport = compare();
    expect(pageOf(checkedReport).photo_sha256).toBe(fakePhoto("p1").sha256);
    expect(pageOf(checkedReport).final_photo_sha256).toBeNull();

    // Person-edited (unchecked) record also has final_photo_sha256: null.
    const ref4 = "sample:M:4a";
    writeFileSync(recordPath(ref4), JSON.stringify(makePage(ref4, "Edited by hand")));
    const editedReport = compare();
    expect(pageOf(editedReport, ref4).edited_by_person).toBe(true);
    expect(pageOf(editedReport, ref4).photo_sha256).toBe(fakePhoto("p2").sha256);
    expect(pageOf(editedReport, ref4).final_photo_sha256).toBeNull();
  });

  it("is not imported after its check lapsed, until the person checks it again or lets the record go", async () => {
    const rows: Array<{ name: string; cause: string; photo: string; change: () => void }> = [
      {
        name: "new photo",
        cause: PHOTO_CHANGED,
        photo: "p9",
        change: () => {
          addPreparedPhoto(work, "p9");
          setReadings([{ photo: "p9", ref: REF }]);
        },
      },
      {
        name: "new text",
        cause: RECORD_CHANGED,
        photo: "p1",
        change: () => writeFileSync(recordPath(), JSON.stringify(makePage(REF, "Changed again"))),
      },
      {
        name: "older folder",
        cause: BEFORE_DIGESTS,
        photo: "p1",
        change: () => rmSync(finalPath(CHECKED_DIGESTS_FILE)),
      },
    ];
    for (const row of rows) {
      for (const way of ["checked again", "let go"]) {
        const name = `${row.name}, ${way}`;
        rmSync(work, { recursive: true });
        mkdirSync(work);
        setUpChecked();
        compare();
        row.change();
        compare();
        expect(statusMap()[REF], name).toBe("machine_read");
        await expectRefused(`a person checked this page before.*${row.cause}`, name);

        // Even if checked-pages.digests is lost (copied folder), report.json still refuses the lapsed check.
        const savedDigests = readFileSync(finalPath(CHECKED_DIGESTS_FILE));
        rmSync(finalPath(CHECKED_DIGESTS_FILE));
        await expectRefused(`a person checked this page before.*${BEFORE_DIGESTS}`, `${name} (digests removed)`);
        writeFileSync(finalPath(CHECKED_DIGESTS_FILE), savedDigests);

        if (way === "checked again") {
          const title = (JSON.parse(readFileSync(recordPath(), "utf8")) as PageRecord).topic.title as string;
          check();
          await expectImported("human_checked", title, row.photo, name);
        } else {
          rmSync(recordPath());
          compare();
          await expectImported("double_read", "Adding Numbers", row.photo, name);
        }
      }
    }
  });

  it("stops compare on a damaged file before any write, and never reads it as a missing file", () => {
    const manifest = () => join(work, "photos", "photos-manifest.json");
    const rows: Array<{ name: string; file: () => string; change: (path: string) => void }> = [
      ...["{ bad", "null", "[]", JSON.stringify({ [REF]: 1 })].map((text) => ({
        name: `status.json ${text}`,
        file: () => finalPath("status.json"),
        change: (path: string) => writeFileSync(path, text),
      })),
      ...["{ bad", "", JSON.stringify({ version: 1, pages: [{ source_ref: REF, record_sha256: "x", photo_sha256: "y" }], checked_before: [] })].map((text) => ({
        name: `digests ${text}`,
        file: () => finalPath(CHECKED_DIGESTS_FILE),
        change: (path: string) => writeFileSync(path, text),
      })),
      {
        name: "report with a kept list that is not a list",
        file: () => finalPath("report.json"),
        change: (path: string) => writeFileSync(path, JSON.stringify({ pages: [], kept_human_checked: {} })),
      },
      {
        name: "photo list with another shape",
        file: manifest,
        change: (path: string) => writeFileSync(path, JSON.stringify({ version: 2, photos: [] })),
      },
      {
        name: "photo is a link",
        file: () => join(work, "photos", fakePhoto("p1").file),
        change: (path: string) => {
          renameSync(path, join(root, "photo"));
          symlinkSync(join(root, "photo"), path);
        },
      },
      {
        name: "record is a link",
        file: () => recordPath(),
        change: (path: string) => {
          renameSync(path, join(root, "record"));
          symlinkSync(join(root, "record"), path);
        },
      },
    ];
    for (const row of rows) {
      rmSync(work, { recursive: true });
      mkdirSync(work);
      const record = setUpChecked();
      compare();
      row.change(row.file());
      const status = readFileSync(finalPath("status.json"), "utf8");
      const digests = readFileSync(finalPath(CHECKED_DIGESTS_FILE), "utf8");
      expect(compare, row.name).toThrow(row.file());
      expect(recordBytes().equals(record), row.name).toBe(true);
      expect(readFileSync(finalPath("status.json"), "utf8"), row.name).toBe(status);
      expect(readFileSync(finalPath(CHECKED_DIGESTS_FILE), "utf8"), row.name).toBe(digests);
      expect(existsSync(viewPath()), row.name).toBe(true);
    }
  });
});

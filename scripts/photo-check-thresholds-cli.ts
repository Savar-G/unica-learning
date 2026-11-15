// The threshold run of the photo check (#855, spec #850 slice C; real photos #856). Asks the photo check's questions about the fixed 40
// synthetic photos (10 blurry, 30 clear) and prints each photo's P(yes) and the threshold rule's result. Run through
// scripts/photo-check-thresholds.mjs; docs/photo-check-thresholds.md. Reads the set folder and never writes into it.
// Writes the raw answers under .workbook-sample/photo-check/ (gitignored). The key comes only from
// DECISIONS_OPENROUTER_API_KEY in the process environment; this script never prints it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { decisionClient } from "../src/lib/decision-client";
import { createHash } from "node:crypto";
import { bookSet, photoKind, type BookSetBook } from "../src/lib/photo-check-book-set";
import { kindThreshold, parseMaxUsd, runKindSet, runThresholdSet, type KindRow, type PhotoKind } from "../src/lib/photo-check-thresholds";
import { PHOTO_CHECK_QUESTIONS, PHOTO_PROBLEMS, chooseThreshold, photoCheckImage, type PhotoProblem } from "../src/lib/scan-photo-check";

const { values: v } = parseArgs({ options: {
  set: { type: "string" }, physical: { type: "string" }, estimate: { type: "boolean" }, model: { type: "string" }, runs: { type: "string", default: "1" }, "max-usd": { type: "string", default: "0.5" },
  question: { type: "string", default: "blurry" }, out: { type: "string", default: ".workbook-sample/photo-check" },
  with: { type: "string", multiple: true }, book: { type: "string" }, photos: { type: "string" }, labels: { type: "string" },
} });
if (v.book) { await prepareBook(v.book, v.photos, v.labels, v.out!); process.exit(0); }
if (v.physical) { await physical(v.physical); process.exit(0); }
if (!v.set) throw new Error("--set DIR or --physical DIR is required");
const question = v.question as PhotoProblem;
if (!PHOTO_CHECK_QUESTIONS[question]) throw new Error(`unknown question ${question}`);
// Checked before the key is read or anything is sent.
const maxUsd = parseMaxUsd(v["max-usd"]), runs = Number(v.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a whole number of at least 1");
const client = decisionClient(process.env, v.model, { timeout: 20_000, maxRetries: 0 });
if (!client) throw new Error("DECISIONS_OPENROUTER_API_KEY is not set");
const manifest = JSON.parse(await readFile(resolve(v.set, "manifest.json"), "utf8")) as { photos: { id: string; clear: boolean; image: { path: string } }[] };
const { rows, cap } = await runThresholdSet({
  client, question, maxUsd, runs,
  photos: manifest.photos.map((p) => ({ id: p.id, problem: !p.clear, image: async () => photoCheckImage(new Uint8Array(await readFile(resolve(v.set!, p.image.path)))) })),
});
const spent = cap.spentUsd, unpriced = rows.reduce((n, r) => n + r.unpriced, 0);
const perRun = Array.from({ length: runs }, (_, n) => ({ run: n + 1, ...chooseThreshold(rows.filter((r) => r.run === n + 1)) }));
// Over all runs together: a threshold that holds for every run.
const all = chooseThreshold(rows);
const ms = rows.flatMap((r) => (r.ms === null ? [] : [r.ms])).sort((a, b) => a - b);
const summary = { model: client.model, question, runs, perRun, all, spentUsd: Math.round(spent * 1e6) / 1e6, unpricedAttempts: unpriced, spentNote: "known costs plus the bound of each attempt with no cost",
  p50Ms: ms[Math.floor(ms.length / 2)], p95Ms: ms[Math.floor(ms.length * 0.95)], over3s: rows.filter((r) => (r.ms ?? 0) > 3000).length, notAdmitted: rows.filter((r) => r.error === "budget").length, maxUsd };
await mkdir(v.out!, { recursive: true });
await writeFile(resolve(v.out!, `${question}-${client.model.replace("/", "_")}.json`), JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log(rows.map((r) => `${r.run}\t${r.problem ? "blurry" : "clear "}\t${r.yes === null ? "error" : r.yes.toFixed(4)}\t${r.ms}ms\t${r.photo}${r.error ? `\t${r.error}` : ""}`).join("\n"));

/**
 * #856: the real labelled photos. DIR is a Robin phone test folder (scripts/scan-marking-physical.mjs --estimate): its
 * set.json maps each photo to its straightened page under images/. Only a photo whose page calibrated has one, as in the
 * app, where the check runs only on a ready page. The kind comes from the photo's file name (-blurry, -glare, -shadow,
 * -faint; else clear). All four questions in one request per photo. --estimate prints the request count and cost bound only.
 */
async function physical(dir: string) {
  const set = JSON.parse(await readFile(resolve(dir, "set.json"), "utf8")) as { photos: { mapping: { file: string }; status: string; reason: string | null; photo: { image: { path: string } } }[] };
  const kindOf = (file: string): PhotoKind => PHOTO_PROBLEMS.find((p) => new RegExp(`-${p}\\d*\\.`).test(file)) ?? "clear";
  const ready = set.photos.filter((p) => p.status === "ready");
  const refused = set.photos.filter((p) => p.status !== "ready").map((p) => ({ file: p.mapping.file, kind: kindOf(p.mapping.file), reason: p.reason }));
  const photos = await Promise.all(ready.map(async (p) => {
    const bytes = new Uint8Array(await readFile(resolve(dir, p.photo.image.path)));
    return { id: p.mapping.file, kind: kindOf(p.mapping.file), sha256: createHash("sha256").update(bytes).digest("hex"), image: async () => photoCheckImage(bytes) };
  }));
  const runs = Number(v.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a whole number of at least 1");
  const maxUsd = parseMaxUsd(v["max-usd"]);
  const count = (k: PhotoKind) => photos.filter((p) => p.kind === k).length;
  const kinds = Object.fromEntries((["clear", ...PHOTO_PROBLEMS] as PhotoKind[]).map((k) => [k, count(k)]));
  if (v.estimate) {
    const { attemptCostBound } = await import("../src/lib/decision-client");
    console.log(JSON.stringify({ requests: photos.length * runs, kinds, refusedBeforeTheCheck: refused.length, boundPerAttemptUsd: attemptCostBound(v.model ?? "typesafe/jev-1.14"), maxUsd }, null, 2));
    return;
  }
  const client = decisionClient(process.env, v.model, { timeout: 20_000, maxRetries: 0 });
  if (!client) throw new Error("DECISIONS_OPENROUTER_API_KEY is not set");
  const { rows, cap } = await runKindSet({ client, maxUsd, runs, photos });
  // --with: rows of an earlier run (its JSON results file) on the same model and PHOTO_CHECK_VERSION's questions; none is asked again.
  const earlier = await Promise.all((v.with ?? []).map(async (f) => {
    const prior = JSON.parse(await readFile(f, "utf8")) as { summary: { model: string }; rows: KindRow[] };
    if (prior.summary.model !== client.model) throw new Error(`--with ${f}: model ${prior.summary.model}, not ${client.model}`);
    return prior.rows;
  }));
  const all = [...earlier.flat(), ...rows];
  if (new Set(all.map((r) => `${r.run}:${r.photo}`)).size !== all.length) throw new Error("--with: the same photo name in two sets");
  const thresholds = PHOTO_PROBLEMS.map((p) => kindThreshold(all, p));
  const ms = rows.flatMap((r) => (r.ms === null ? [] : [r.ms])).sort((a, b) => a - b);
  const summary = { model: client.model, runs, kinds, withRows: earlier.flat().length, withKinds: Object.fromEntries((["clear", ...PHOTO_PROBLEMS] as PhotoKind[]).map((k) => [k, new Set(earlier.flat().filter((r) => r.kind === k).map((r) => r.photo)).size])), refusedBeforeTheCheck: refused, photos: photos.map(({ id, kind, sha256 }) => ({ id, kind, sha256 })), thresholds,
    spentUsd: Math.round(cap.spentUsd * 1e6) / 1e6, unpricedAttempts: rows.reduce((n, r) => n + r.unpriced, 0),
    p50Ms: ms[Math.floor(ms.length / 2)], p95Ms: ms[Math.floor(ms.length * 0.95)], failed: rows.filter((r) => r.error).length, maxUsd };
  await mkdir(v.out!, { recursive: true });
  await writeFile(resolve(v.out!, `physical-${client.model.replace("/", "_")}.json`), JSON.stringify({ summary, rows }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  console.log(rows.map((r) => `${r.run}\t${r.kind.padEnd(6)}\t${PHOTO_PROBLEMS.map((p) => `${p} ${r.probabilities[p]?.toFixed(3) ?? "-"}`).join("  ")}\t${r.photo}${r.error ? `\t${r.error}` : ""}`).join("\n"));
}

/**
 * #856: a labelled set of real photos of one printed book, made the way the app makes it (src/lib/photo-check-book-set.ts),
 * written to OUT in the format --physical reads: set.json and images/. BOOK is a JSON file with the book's printed revision
 * and its pages (number, kind, code, size, stored print contract or null, question regions, and the path of the printed
 * page image at the stored size). LABELS is a CSV of `file,label` rows, the file relative to PHOTOS. Each photo is named
 * by its place in LABELS and its label (photo-07-shadow.jpg), never by its own file name; OUT/sources.json keeps which is
 * which. Sends nothing anywhere: no key is read.
 */
async function prepareBook(bookPath: string, photosDir: string | undefined, labelsPath: string | undefined, out: string) {
  if (!photosDir || !labelsPath) throw new Error("--book needs --photos DIR and --labels CSV");
  const raw = JSON.parse(await readFile(bookPath, "utf8")) as Omit<BookSetBook, "pages"> & { pages: (Omit<BookSetBook["pages"][number], "printed"> & { printed: string })[] };
  const book: BookSetBook = { ...raw, pages: await Promise.all(raw.pages.map(async (p) => ({ ...p, printed: new Uint8Array(await readFile(resolve(dirname(bookPath), p.printed))) }))) };
  const lines = (await readFile(labelsPath, "utf8")).split(/\r?\n/).filter((l) => l.trim());
  if (lines[0]?.replace(/\s/g, "") !== "file,label") throw new Error("--labels: the first line must be the header file,label");
  const rows = lines.slice(1).map((l, i) => {
    const cut = l.lastIndexOf(",");
    if (cut < 1) throw new Error(`--labels line ${i + 2}: expected file,label`);
    return [l.slice(0, cut), l.slice(cut + 1)];
  });
  const photos = await Promise.all(rows.map(async ([file, label], i) => ({ id: `photo-${String(i + 1).padStart(2, "0")}`, source: file, kind: photoKind(label), bytes: new Uint8Array(await readFile(resolve(photosDir, file))) })));
  const results = await bookSet(book, photos);
  await mkdir(resolve(out, "images"), { recursive: true });
  const named = (r: (typeof results)[number]) => `${r.id}${r.kind === "clear" ? "" : `-${r.kind}`}.jpg`;
  for (const r of results) if (r.straight) await writeFile(resolve(out, "images", named(r)), r.straight);
  const set = { source: "book", photos: results.map((r) => ({ mapping: { file: named(r) }, status: r.status, reason: r.reason, page: r.page, photo: { image: { path: `images/${named(r)}` } } })) };
  await writeFile(resolve(out, "set.json"), JSON.stringify(set, null, 2) + "\n");
  await writeFile(resolve(out, "sources.json"), JSON.stringify(photos.map((p) => ({ id: p.id, source: p.source, kind: p.kind })), null, 2) + "\n");
  const count = (status: string) => Object.fromEntries((["clear", ...PHOTO_PROBLEMS] as PhotoKind[]).map((k) => [k, results.filter((r) => r.kind === k && r.status === status).length]));
  console.log(JSON.stringify({ photos: photos.length, pages: results.length, ready: count("ready"), refused: count("refused"), reasons: results.filter((r) => r.status === "refused").reduce<Record<string, number>>((a, r) => ({ ...a, [r.reason!]: (a[r.reason!] ?? 0) + 1 }), {}) }, null, 2));
}

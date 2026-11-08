// The synthetic photo set for the marking evaluation (#537). No AI, no database, no child data. See
// docs/scan-photo-set.md for what it makes and what it does not prove.
//
// Usage: node scripts/scan-photo-set.mjs [--out /tmp/ui-review/scan-photo-set] [--seed 537] [--levels U4,U16]
//          [--pages 20] [--books <folder>]
// 1. The fake books: <books>/<level>-draft.json from the workbook sample tool with a fake AI and a fixed book id
//    (WORKBOOK_SAMPLE_ID), days 1, 3, 5, 8 and 10. Without --books it makes them in <out>/books, or reuses them there.
// 2. Each level's printed day pages are rendered once with the real template and the production print engine
//    (Chromium), which captures each page's print contract: its scan marks and every question's answer regions. The
//    render is kept in <books>/rendered and reused, as Chromium's anti-aliasing can differ a little between renders.
// 3. --pages pages per level with at least two whole-number write-number questions are picked by the seed; each gets
//    synthetic handwriting and one camera effect (src/lib/scan-photo-set.ts), and one truth file.
// 4. Out: photos/<id>.jpg, truth/<id>.json, pages/<id>.png (the clean page), manifest.json with every file's SHA-256,
//    SHA256SUMS, contact-<level>.png, crops.png (answers up close) and index.html (every photo with its truth).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import { renderableDraft } from "@/lib/workbook-fit";
import { renderWorkbook } from "@/lib/workbook-render";
import type { PrintedRegion } from "@/lib/workbook-print-contract";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import {
  PHOTO_SIZE,
  SYNTHETIC_NOTE,
  answerCrop,
  makeScanPhoto,
  pageQuestions,
  planPhotoSet,
  seededRandom,
  truthProblems,
  writablePage,
  type PhotoPage,
  type PhotoTruth,
  type RawImage,
} from "@/lib/scan-photo-set";

/** The fake books' fixed id: the item seed of the sample tool, so the same books come back every time. */
const BOOK_ID = "5ca70000-0000-4000-8000-000000000537";
/** Rendering needs a child id; the fake book's own is random, so a fixed one keeps the pages the same. */
const CHILD_ID = "00000000-0000-4000-8000-000000000537";
/** The printed days of the fake books: enough pages with whole-number answers at U4, which has the fewest. */
const DAYS = [1, 3, 5, 8, 10];

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "/tmp/ui-review/scan-photo-set" }, seed: { type: "string", default: "537" },
    levels: { type: "string", default: "U4,U16" }, pages: { type: "string", default: "20" }, books: { type: "string" },
  },
});
const out = resolve(values.out!);
const seed = values.seed!;
const levels = values.levels!.split(",").map((s) => s.trim()).filter(Boolean);
const perLevel = Number(values.pages);
if (!Number.isInteger(perLevel) || perLevel < 2 || perLevel > 60) throw new Error("--pages must be a whole number from 2 to 60.");
const books = resolve(values.books ?? `${out}/books`);

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const exists = (p: string) => access(p).then(() => true, () => false);

// ---------- 1. The fake books ----------

const missing = [];
for (const level of levels) if (!(await exists(`${books}/${level}-draft.json`))) missing.push(level);
if (missing.length) {
  if (values.books) throw new Error(`no ${missing.map((l) => `${l}-draft.json`).join(", ")} in ${books}`);
  console.log(`Making the fake books (${missing.join(", ")}) in ${books}: no AI, nothing stored.`);
  const run = spawnSync(process.execPath, [
    resolve("scripts/workbook-samples.mjs"), "--fake", "--no-store", "--check-only", "--levels", missing.join(","),
    "--days", DAYS.join(","), "--concurrency", "3", "--out", books,
  ], { stdio: "inherit", env: { ...process.env, WORKBOOK_SAMPLE_ID: BOOK_ID } });
  if (run.status !== 0) throw new Error(`the sample tool failed (exit ${run.status})`);
}

// ---------- 2. Render each level's day pages with their print contracts ----------

const template = workbookTemplate(await fixedTemplateFonts());
const engine = chromiumPrintEngine();

async function raw(png: Uint8Array): Promise<RawImage> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: 3, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

interface Rendered { photoPage: PhotoPage; png: Uint8Array; mistakes: Map<number, number[]> }

/**
 * What a render keeps beside the books: each page's image file and the parts of its print contract the photos use.
 * Chromium's anti-aliasing can differ by a few pixels from one render to the next, so the first render is kept and
 * every later run reuses it: the photos are then the same bytes for the same seed.
 */
interface KeptRender {
  bookSha256: string;
  pages: {
    page: number; label: string | null; day: number | null; pageOfDay: number | null; workbookId: string;
    png: string; imageSha256: string; marks: PhotoPage["marks"]; regions: Record<string, PrintedRegion[]>;
  }[];
}

async function renderLevel(level: string): Promise<Rendered[]> {
  const bookText = await readFile(`${books}/${level}-draft.json`, "utf8");
  const draft = JSON.parse(bookText) as GeneratedWorkbook;
  if (draft.id !== BOOK_ID && !values.books) throw new Error(`${level}: the book in ${books} is not the fixed fake book`);
  const book = renderableDraft(draft);
  const days = [...new Set(book.pages.flatMap((p) => (p.content?.kind === "day" && !p.content.extraPractice ? [p.content.day] : [])))];
  if (!values.books && days.join(",") !== DAYS.join(",")) throw new Error(`${level}: the book in ${books} has days ${days.join(",")}, not ${DAYS.join(",")}; delete it`);
  const pages = book.pages.filter((p) => p.content?.kind === "day" && !p.content.extraPractice && p.questions.length > 0);
  const bookSha256 = sha(new TextEncoder().encode(bookText));
  const keptPath = `${books}/rendered/${level}.json`;
  let kept = await readFile(keptPath, "utf8").then((t) => JSON.parse(t) as KeptRender, () => null);
  const pngs = new Map<number, Uint8Array>();
  if (kept && kept.bookSha256 === bookSha256) {
    for (const k of kept.pages) {
      const png = new Uint8Array(await readFile(`${books}/rendered/${k.png}`));
      if (sha(png) !== k.imageSha256) { kept = null; break; }
      pngs.set(k.page, png);
    }
  } else kept = null;
  if (kept) console.log(`  ${level}: reusing the kept render in ${books}/rendered`);
  else {
    console.log(`  ${level}: rendering ${pages.length} day pages with Chromium`);
    const rendered = await renderWorkbook({ draft: { ...book, childId: CHILD_ID, pages }, parentId: "scan-photo-set", template, engine });
    if (rendered.status === "failed") throw new Error(`${level}: the render failed: ${rendered.problems.map((p) => `page ${p.page}: ${p.reason}`).join("; ")}`);
    await mkdir(`${books}/rendered`, { recursive: true });
    const next: KeptRender = { bookSha256, pages: [] };
    for (const [i, page] of rendered.workbook.pages.entries()) {
      const contract = page.printContract;
      if (!contract) {
        console.log(`  ${level} page ${page.number}: no print contract (${rendered.pages[i].contractProblem}), left out`);
        continue;
      }
      const png = rendered.files[1 + i].bytes;
      const name = `${level}-p${String(page.number).padStart(2, "0")}.png`;
      await writeFile(`${books}/rendered/${name}`, png);
      pngs.set(page.number, png);
      next.pages.push({
        page: page.number, label: contract.label, day: contract.day, pageOfDay: contract.pageOfDay, workbookId: contract.workbookId,
        png: name, imageSha256: contract.fingerprints.image, marks: contract.marks.points,
        regions: Object.fromEntries(page.questions.map((q) => [String(q.number), q.regions ?? []])),
      });
    }
    await writeFile(keptPath, `${JSON.stringify(next, null, 2)}\n`);
    kept = next;
  }
  const result: Rendered[] = [];
  for (const k of kept.pages) {
    const source = pages.find((p) => p.number === k.page);
    if (!source) throw new Error(`${level}: the kept render has page ${k.page}, which the book does not`);
    const png = pngs.get(k.page)!;
    const questions = pageQuestions(source.questions, new Map(Object.entries(k.regions).map(([n, r]) => [Number(n), r])));
    const mistakes = new Map(source.questions.map((q) => [q.number, q.package.wrongAnswers.flatMap((w) =>
      w.value.type === "number" && Number.isInteger(w.value.value) ? [w.value.value] : [])]));
    result.push({
      png, mistakes,
      photoPage: {
        level, workbookId: k.workbookId, page: k.page, label: k.label, day: k.day, pageOfDay: k.pageOfDay,
        imageSha256: k.imageSha256, image: await raw(png), marks: k.marks, questions,
      },
    });
  }
  return result;
}

// ---------- 3. Pick the pages and make the photos ----------

await rm(`${out}/photos`, { recursive: true, force: true });
await rm(`${out}/truth`, { recursive: true, force: true });
await rm(`${out}/pages`, { recursive: true, force: true });
await Promise.all(["photos", "truth", "pages"].map((d) => mkdir(`${out}/${d}`, { recursive: true })));

const chosen: Rendered[] = [];
for (const level of levels) {
  const all = await renderLevel(level);
  const eligible = all.filter((p) => writablePage(p.photoPage.questions, 2));
  if (eligible.length < perLevel) throw new Error(`${level}: only ${eligible.length} pages have two whole-number answers to write`);
  const picked = seededRandom(`${seed}:pick:${level}`).shuffle(eligible).slice(0, perLevel).sort((a, b) => a.photoPage.page - b.photoPage.page);
  console.log(`  ${level}: ${all.length} day pages, ${eligible.length} with two whole-number answers, ${picked.length} picked`);
  chosen.push(...picked);
}

const plan = planPhotoSet(chosen.map((p) => ({ level: p.photoPage.level, page: p.photoPage.page, label: p.photoPage.label })), seed);
const files: { path: string; sha256: string }[] = [];
const truths: PhotoTruth[] = [];
const photos = new Map<string, Uint8Array>();
for (const entry of plan) {
  const page = chosen.find((p) => p.photoPage.level === entry.level && p.photoPage.page === entry.page)!;
  const { photo, truth } = makeScanPhoto(page.photoPage, {
    seed, id: entry.id, effect: entry.effect, submittedAs: entry.submittedAs ?? undefined, mistakes: page.mistakes,
  });
  // JPEG quality as a phone saves it: a little different on each photo, by the seed.
  const quality = seededRandom(`${seed}:${entry.id}:jpeg`).int(74, 90);
  const jpg = new Uint8Array(await sharp(Buffer.from(photo.data), { raw: { width: photo.width, height: photo.height, channels: 3 } }).jpeg({ quality }).toBuffer());
  const json = new TextEncoder().encode(`${JSON.stringify({ ...truth, photo: { ...truth.photo, file: `photos/${entry.id}.jpg`, jpegQuality: quality } }, null, 2)}\n`);
  await writeFile(`${out}/photos/${entry.id}.jpg`, jpg);
  await writeFile(`${out}/truth/${entry.id}.json`, json);
  await writeFile(`${out}/pages/${entry.id}.png`, page.png);
  files.push({ path: `photos/${entry.id}.jpg`, sha256: sha(jpg) }, { path: `truth/${entry.id}.json`, sha256: sha(json) }, { path: `pages/${entry.id}.png`, sha256: sha(page.png) });
  // Fail closed: a truth that names an answer a reader could fairly be unsure of never enters the set.
  const problems = truthProblems(truth);
  if (problems.length) throw new Error(`the truth of ${entry.id} cannot be trusted:\n${problems.join("\n")}`);
  truths.push(truth);
  photos.set(entry.id, jpg);
  const c = truth.counts;
  console.log(`  ${entry.id} ${entry.effect.padEnd(11)} right ${c.right}, wrong ${c.wrong}, blank ${c.blank}, not visible ${c["not-visible"]}, not marked ${c["not-marked"]}`);
}

// ---------- 4. Manifest, contact sheets and index ----------

const tally = (keys: string[]) => keys.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
const written = truths.flatMap((t) => t.questions.filter((q) => q.scope === "write"));
const summary = {
  photos: truths.length,
  modelCalls: { perModel: truths.length, twoModels: truths.length * 2 },
  effects: tally(truths.map((t) => t.effect)),
  expectedPhoto: tally(truths.map((t) => t.expectedPhoto)),
  cases: tally(written.map((q) => q.case!)),
  expectedMarks: tally(truths.flatMap((t) => t.questions.map((q) => q.expectedMark))),
  decoys: truths.reduce((n, t) => n + t.decoys.length, 0),
};
await writeFile(`${out}/manifest.json`, `${JSON.stringify({
  synthetic: true, note: SYNTHETIC_NOTE, seed, bookId: BOOK_ID, levels, pagesPerLevel: perLevel, days: DAYS,
  tool: "scripts/scan-photo-set.ts", summary, files,
}, null, 2)}\n`);
await writeFile(`${out}/SHA256SUMS`, files.map((f) => `${f.sha256}  ${f.path}\n`).join(""));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const label = (text: string, width: number, height: number, size = 15) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>`
  + text.split("\n").map((line, i) => `<text x="6" y="${size + 2 + i * (size + 4)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#222">${esc(line)}</text>`).join("")
  + `</svg>`);

const caption = (t: PhotoTruth) => {
  const c = t.counts;
  const head = t.expectedPhoto === "wrong-page" ? `sent as p${t.submittedAs.page}: wrong page` : t.expectedPhoto === "cut-off" ? "cut off: retake" : "mark it";
  return `${t.id} · ${t.effect}\n${head}\nR${c.right} W${c.wrong} B${c.blank} NV${c["not-visible"]} · ${c["not-marked"]} not drawn`;
};

async function contactSheet(level: string, mine: PhotoTruth[]) {
  const tw = 300, th = Math.round(tw * PHOTO_SIZE.height / PHOTO_SIZE.width), cap = 64, cols = 5, gap = 8;
  const rows = Math.ceil(mine.length / cols);
  const tiles = await Promise.all(mine.map(async (t, i) => {
    const thumb = await sharp(photos.get(t.id)!).resize(tw, th).toBuffer();
    const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + cap + gap);
    return [{ input: thumb, left: x, top: y }, { input: label(caption(t), tw, cap, 14), left: x, top: y + th }];
  }));
  await sharp({ create: { width: gap + cols * (tw + gap), height: gap + rows * (th + cap + gap), channels: 3, background: "#d9d9d9" } })
    .composite(tiles.flat()).png().toFile(`${out}/contact-${level}.png`);
}
for (const level of levels) await contactSheet(level, truths.filter((t) => t.level === level));

// Answers up close: written answers of the photos with the whole page in frame, cropped from the photo with all their ink.
async function crops() {
  const cw = 260, ch = 130, cap = 22, cols = 6, gap = 6;
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  let n = 0;
  // Every crossed-out answer first, then the messy ones, then the rest, as far as the sheet goes.
  const rank = (c: string | null) => (c?.startsWith("crossed-out") ? 0 : c?.startsWith("messy") ? 1 : 2);
  const answers = truths.filter((x) => x.effect !== "cut-off")
    .flatMap((t) => t.questions.filter((q) => q.scope === "write" && q.written.length).map((q) => ({ t, q })))
    .sort((a, b) => rank(a.q.case) - rank(b.q.case));
  for (const { t, q } of answers) {
    // (The crop holds the box and all of the answer's ink: a correction beside the box too.)
    const crop = n < 96 ? answerCrop(q) : null;
    if (!crop) continue;
    const { x: left, y: top, width, height } = crop;
    const img = await sharp(photos.get(t.id)!).extract({ left, top, width, height }).resize(cw, ch, { fit: "contain", background: "#fff" }).toBuffer();
    const x = gap + (n % cols) * (cw + gap), y = gap + Math.floor(n / cols) * (ch + cap + gap);
    tiles.push({ input: img, left: x, top: y }, { input: label(`${t.id} q${q.number} ${q.case}: ${q.finalText ?? "-"} (key ${q.answer})`, cw, cap, 11), left: x, top: y + ch });
    n++;
  }
  const rows = Math.ceil(n / cols);
  await sharp({ create: { width: gap + cols * (cw + gap), height: gap + rows * (ch + cap + gap), channels: 3, background: "#d9d9d9" } })
    .composite(tiles).png().toFile(`${out}/crops.png`);
}
await crops();

const row = (t: PhotoTruth) => `<section><h2>${esc(t.id)} · ${esc(t.effect)} · ${esc(t.expectedPhoto)}</h2>`
  + `<a href="photos/${esc(t.id)}.jpg"><img src="photos/${esc(t.id)}.jpg" alt="${esc(t.id)}" loading="lazy"></a>`
  + `<div><p>Shows page ${t.source.page} (${esc(t.source.label ?? "no label")}, Day ${t.source.day ?? "-"}), sent as page ${t.submittedAs.page}. `
  + `Rotation ${t.photo.camera.rotationDeg}°, keystone ${t.photo.camera.keystone}, blur ${t.photo.camera.blurSigma}, light ${t.photo.camera.light}, shadow ${t.photo.camera.shadow}. <a href="truth/${esc(t.id)}.json">truth</a> · <a href="pages/${esc(t.id)}.png">clean page</a></p>`
  + `<table><tr><th>Q</th><th>Format</th><th>Case</th><th>Written</th><th>Key</th><th>Expected</th></tr>`
  + t.questions.map((q) => `<tr class="${q.expectedMark}"><td>${q.number}</td><td>${esc(q.format)}</td><td>${esc(q.case ?? "")}</td>`
    + `<td>${q.written.map((w) => (w.crossedOut ? `<s>${esc(w.text)}</s>` : esc(w.text)) + (w.placement === "in-box" ? "" : ` (${w.placement})`)).join(" ")}</td>`
    + `<td>${esc(q.answer ?? "")}</td><td>${q.expectedMark}</td></tr>`).join("")
  + `</table>${t.decoys.length ? `<p>Decoys in work spaces: ${t.decoys.map((d) => `q${d.question} "${esc(d.text)}"`).join(", ")}</p>` : ""}</div></section>`;
await writeFile(`${out}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scan photo set</title>
<style>body{font:14px/1.45 -apple-system,Helvetica,Arial,sans-serif;margin:16px;background:#fafafa;color:#222}section{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:16px;background:#fff;border:1px solid #ddd;padding:12px;margin:0 0 12px}
section h2{grid-column:1/-1;margin:0;font-size:16px}img{width:100%;height:auto;border:1px solid #ccc}table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #ddd;padding:2px 6px;text-align:left}
tr.right td:last-child{color:#1a7f37}tr.wrong td:last-child{color:#b42318}tr.not-visible td:last-child{color:#8a5a00}tr.not-marked{color:#999}.note{background:#fff4e5;border:1px solid #f0c27a;padding:8px 12px}
@media (max-width:640px){section{grid-template-columns:1fr}}</style></head><body>
<h1>Scan photo set (seed ${esc(seed)})</h1><p class="note">${esc(SYNTHETIC_NOTE)} Fake books, no child data, no AI.</p>
<p>${truths.length} photos. Effects: ${esc(JSON.stringify(summary.effects))}. Answer cases: ${esc(JSON.stringify(summary.cases))}. Expected marks: ${esc(JSON.stringify(summary.expectedMarks))}.</p>
<p>Sheets: ${levels.map((l) => `<a href="contact-${esc(l)}.png">${esc(l)}</a>`).join(" · ")} · <a href="crops.png">answers up close</a></p>
${truths.map(row).join("\n")}</body></html>\n`);

console.log(`\n${truths.length} photos in ${out}`);
console.log(`  effects ${JSON.stringify(summary.effects)}`);
console.log(`  cases ${JSON.stringify(summary.cases)}`);
console.log(`  expected marks ${JSON.stringify(summary.expectedMarks)}; decoys ${summary.decoys}`);
console.log(`  set hash ${sha(new TextEncoder().encode(files.map((f) => f.sha256).join("")))} (SHA256SUMS)`);

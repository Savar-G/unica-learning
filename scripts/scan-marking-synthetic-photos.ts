// Deterministic synthetic ink on the final Robin render. No browser, font service, generator, inference or storage.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import type { WorkbookInput } from "../src/lib/workbook-content";
import { markingRegions, type MarkingRegion } from "../src/lib/scan-marking-regions";
import { COMPARISON_FORMATS, SYNTHETIC_IDS, comparisonItemFormat, hashBytes, syntheticPrintRevision, validateComparisonManifest, type ComparisonManifest, type ComparisonPhoto, type LabelledReading } from "../src/lib/scan-marking-comparison";
import { durableJson, loadComparisonAssets } from "./scan-marking-comparison-cli";

// Each coordinate is a single-line code-drawn glyph. This is not real handwriting evidence.
const GLYPHS: Record<string, number[][][]> = {
  "0": [[[.5,0],[.1,0],[0,.3],[0,.8],[.2,1],[.5,1],[.6,.7],[.6,.2],[.5,0]]],
  "1": [[[.1,.2],[.35,0],[.35,1]]], "2": [[[0,.2],[.15,0],[.5,0],[.6,.2],[.5,.4],[0,1],[.6,1]]],
  "3": [[[0,.1],[.3,0],[.6,.15],[.3,.5],[.6,.7],[.5,1],[.15,1],[0,.9]]],
  "4": [[[.45,1],[.45,0],[0,.65],[.6,.65]]], "5": [[[.6,0],[.1,0],[.1,.45],[.45,.4],[.6,.65],[.5,.95],[.15,1],[0,.85]]],
  "6": [[[.55,0],[.2,.05],[0,.4],[0,.8],[.2,1],[.5,.95],[.6,.7],[.45,.5],[0,.55]]],
  "7": [[[0,0],[.6,0],[.2,1]]], "8": [[[.3,.5],[0,.25],[.2,0],[.5,.05],[.6,.3],[.3,.5],[0,.7],[.1,1],[.5,1],[.6,.75],[.3,.5]]],
  "9": [[[.6,.45],[.1,.5],[0,.2],[.2,0],[.5,.05],[.6,.3],[.55,.8],[.3,1]]],
  "/": [[[.55,0],[0,1]]], "-": [[[0,.5],[.6,.5]]], ".": [[[.2,.96],[.22,1]]],
  "e": [[[.05,.55],[.55,.5],[.45,.3],[.15,.3],[0,.6],[.1,.9],[.5,.9]]],
  "v": [[[0,.3],[.25,.95],[.6,.3]]], "n": [[[0,1],[0,.3],[0,.6],[.15,.3],[.4,.3],[.55,.45],[.55,1]]],
  "o": [[[.3,.3],[.05,.35],[0,.7],[.15,1],[.45,.95],[.6,.6],[.45,.3],[.3,.3]]],
  "d": [[[.5,0],[.5,1],[.1,.95],[0,.7],[.1,.4],[.45,.4]]], " ": [],
};
const polyline = (points: number[][], width = 2.8) => `<polyline points="${points.map(p => p.map(v => v.toFixed(2)).join(",")).join(" ")}" fill="none" stroke="#163d72" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
export function syntheticTextSvg(text: string, box: { x: number; y: number; width: number; height: number }): string {
  const height = Math.min(34, box.height * .55, (box.width - 14) / Math.max(.7, text.length * .75));
  const x = box.x + (box.width - text.length * height * .75) / 2, y = box.y + (box.height - height) / 2;
  return [...text].map((ch, i) => {
    if (!GLYPHS[ch]) throw new Error("unsupported-synthetic-glyph");
    return GLYPHS[ch].map(line => polyline(line.map(([a, b]) => [x + (i * .75 + a) * height, y + b * height]))).join("");
  }).join("");
}
export function syntheticReading(region: MarkingRegion, variant: number): LabelledReading {
  if (variant === 2) return { regionId: region.id, state: "blank", text: "", issue: null };
  if (variant === 3) return { regionId: region.id, state: "uncertain", text: null, issue: "blurry" };
  const wrong = variant === 1;
  const text = region.kind === "number" ? String(region.answer + (wrong ? 1 : 0)) : region.kind === "text" ? wrong ? "odd" : region.answer : region.kind === "choice" ? wrong ? region.choices.find(c => c !== region.answer)! : region.answer :
    region.answer.type === "mixed" ? `${region.answer.whole + (wrong ? 1 : 0)} ${region.answer.numerator}/${region.answer.denominator}` : region.answer.type === "fraction" ? `${region.answer.numerator + (wrong ? 1 : 0)}/${region.answer.denominator}` : String(region.answer.value + (wrong ? 1 : 0));
  return { regionId: region.id, state: "written", text, issue: null };
}
/** Find the printed option geometry in its measured region, rather than guess its positions. */
export async function syntheticChoiceCenters(bytes: Uint8Array, region: Extract<MarkingRegion, { kind: "choice" }>): Promise<{ x: number; y: number; width: number; height: number }[]> {
  const left = Math.floor(region.box.x), top = Math.floor(region.box.y), width = Math.ceil(region.box.width), height = Math.ceil(region.box.height);
  const { data, info } = await sharp(bytes).extract({ left, top, width, height }).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const black = (x: number, y: number) => x >= 0 && y >= 0 && x < info.width && y < info.height && data[y * info.width + x] < 90;
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  if (region.mark === "circle") {
    let first = -1, last = -1;
    const finish = () => {
      if (first < 0) return;
      let lo = width, hi = 0;
      for (let y = first; y <= last; y++) for (let x = 0; x < width; x++) if (black(x, y)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      boxes.push({ x: left + (lo + hi) / 2, y: top + (first + last) / 2, width: hi - lo + 12, height: last - first + 14 }); first = -1;
    };
    for (let y = 0; y < height; y++) {
      let ink = false; for (let x = 0; x < width; x++) if (black(x, y)) { ink = true; break; }
      if (ink) { if (first >= 0 && y - last > 5) finish(); if (first < 0) first = y; last = y; }
    }
    finish();
  } else {
    const visited = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x; if (visited[index] || !black(x, y)) continue;
      const queue = [[x, y]]; visited[index] = 1; let loX = x, hiX = x, loY = y, hiY = y;
      for (let n = 0; n < queue.length; n++) {
        const [px, py] = queue[n]; loX = Math.min(loX, px); hiX = Math.max(hiX, px); loY = Math.min(loY, py); hiY = Math.max(hiY, py);
        for (const [nx, ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]]) if (black(nx, ny) && !visited[ny * width + nx]) { visited[ny * width + nx] = 1; queue.push([nx, ny]); }
      }
      const w = hiX-loX+1, h = hiY-loY+1;
      if (w >= 24 && w <= 40 && h >= 24 && h <= 40 && Math.abs(w-h) <= 2 && !black(Math.round((loX+hiX)/2), Math.round((loY+hiY)/2))) boxes.push({ x: left + (loX+hiX)/2, y: top + (loY+hiY)/2, width: w, height: h });
    }
    boxes.sort((a, b) => a.x - b.x);
  }
  if (boxes.length !== region.choices.length) throw new Error(`synthetic-choice-geometry-not-proven:${region.id}`);
  return boxes;
}
export async function makeComparisonPhotos(source: string, output: string): Promise<string> {
  sharp.concurrency(2);
  source = resolve(source); output = resolve(output);
  if (output === source) throw new Error("photo-output-must-be-separate");
  const renderedBytes = await readFile(resolve(source, "rendered-workbook.json")), rendered = JSON.parse(renderedBytes.toString()) as WorkbookInput;
  const fixture = JSON.parse(await readFile(resolve(source, "fixture-manifest.json"), "utf8"));
  const draft = JSON.parse(await readFile(resolve(source, "synthetic-draft.json"), "utf8"));
  if (fixture.synthetic !== true || fixture.childName !== "Robin" || fixture.apiCalls !== 0 || fixture.stored !== false || draft.model !== "fake" || draft.profileBuild !== null || !draft.pages.some((p: { content?: { kind?: string; child?: string } }) => p?.content?.kind === "cover" && p.content.child === "Robin")) throw new Error("synthetic-source-required");
  if (hashBytes(await readFile(resolve(source, "Robin-marking-test-booklet.pdf"))) !== rendered.pdfSha256) throw new Error("synthetic-pdf-hash-mismatch");
  const revision = syntheticPrintRevision(rendered), pages = rendered.pages.filter(p => p.questions.length);
  if (pages.length !== 10) throw new Error("ten-exercise-pages-required");
  await mkdir(output, { recursive: false }); await mkdir(resolve(output, "photos"));
  for (const name of ["synthetic-draft.json", "fixture-manifest.json", "rendered-workbook.json", "Robin-marking-test-booklet.pdf"]) await copyFile(resolve(source, name), resolve(output, name));
  const manifest: ComparisonManifest = { version: 1, synthetic: true, identity: { name: "Robin", madeUp: true, containsRealData: false, profileSource: "sampleChild/samplePlanInput" }, source: { synthetic: true, draftSha256: hashBytes(await readFile(resolve(source, "synthetic-draft.json"))), renderSha256: hashBytes(renderedBytes), fixtureSha256: hashBytes(await readFile(resolve(source, "fixture-manifest.json"))) }, photos: [] };
  for (let variant = 0; variant < 4; variant++) for (const page of pages) {
    const id = `synthetic-p${page.number}-${["right", "wrong", "blank", "blurry"][variant]}`, bytes = await readFile(resolve(source, `page-${page.number}.png`));
    if (hashBytes(bytes) !== page.printContract?.fingerprints.image) throw new Error("source-page-hash-mismatch");
    const photo: ComparisonPhoto = { id, clear: variant !== 3, image: { path: `photos/${id}.jpg`, sha256: "", width: page.image!.width, height: page.image!.height, metadataFree: true },
      frame: { ...{ parentId: SYNTHETIC_IDS.parent, childId: SYNTHETIC_IDS.child, workbookId: rendered.id }, pageId: `synthetic-page-${page.number}`, pageNumber: page.number, photo: id, printedRevision: revision, ready: true, questions: page.questions.map(q => ({ number: q.number, package: q.package, regions: q.regions ?? null, teaching: q.teaching ?? null })) }, truth: [] };
    let drawing = "";
    for (const q of photo.frame.questions) {
      const format = comparisonItemFormat(photo.frame, q.package!.id), regions = markingRegions(q), readings = regions.map(r => syntheticReading(r, variant));
      photo.truth.push({ itemId: q.package!.id, format, result: format === "two-ways" ? "parent" : ["right", "wrong", "blank", "uncertain"][variant] as "right" | "wrong" | "blank" | "uncertain", readings });
      for (let k = 0; k < regions.length; k++) {
        const r = regions[k], label = readings[k]; if (variant === 2) continue;
        if (r.kind === "choice") {
          const centers = await syntheticChoiceCenters(bytes, r), indexes = variant === 3 ? [0, 1] : [r.choices.indexOf(label.text!)];
          for (const index of indexes) { const c = centers[index]; drawing += r.mark === "circle" ? `<ellipse cx="${c.x}" cy="${c.y}" rx="${c.width/2}" ry="${c.height/2}" fill="none" stroke="#163d72" stroke-width="3"/>` : polyline([[c.x-8,c.y],[c.x-2,c.y+8],[c.x+10,c.y-9]],3); }
        } else if (variant === 3) {
          const b = r.box; drawing += polyline([[b.x+10,b.y+15],[b.x+b.width-10,b.y+b.height-15],[b.x+10,b.y+b.height-15],[b.x+b.width-10,b.y+15]],5);
        } else drawing += syntheticTextSvg(label.text!, r.box);
      }
      // Work-space decoys test that show-work scoring reads only the final box.
      if (format === "show-work" && variant < 2) for (const r of q.regions ?? []) if (r.kind === "work" && r.box) drawing += syntheticTextSvg("999", { ...r.box, width: Math.min(130, r.box.width), height: Math.min(70, r.box.height) });
    }
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${photo.image.width}" height="${photo.image.height}">${drawing}</svg>`);
    let pipeline = sharp(bytes).composite([{ input: svg }]);
    const inked = await pipeline.png().toBuffer(); pipeline = sharp(inked); if (variant === 3) pipeline = pipeline.blur(7);
    const jpeg = await pipeline.jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer(); photo.image.sha256 = hashBytes(jpeg);
    await writeFile(resolve(output, photo.image.path), jpeg, { flag: "wx" }); manifest.photos.push(photo);
  }
  validateComparisonManifest(manifest); const path = resolve(output, "manifest.json"); await durableJson(path, manifest, true); await loadComparisonAssets(path);
  const counts = Object.fromEntries(COMPARISON_FORMATS.map(f => [f, manifest.photos.flatMap(p => p.truth).filter(t => t.format === f).length]));
  await durableJson(resolve(output, "synthetic-coverage.json"), { syntheticOnly: true, realHandwritingProof: false, sourcePdfSha256: rendered.pdfSha256, photos: manifest.photos.length, clearPhotos: manifest.photos.filter(p => p.clear).length, truthRows: manifest.photos.flatMap(p => p.truth).length, formats: counts });
  const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  await writeFile(resolve(output, "index.html"), `<!doctype html><meta charset="utf-8"><title>Robin synthetic marking photos</title><style>body{font:16px system-ui;margin:24px}article{margin-bottom:48px;display:grid;grid-template-columns:minmax(200px,650px) 1fr;gap:24px}img{width:100%}td,th{padding:6px;text-align:left;border-bottom:1px solid #ddd}</style><h1>40 synthetic marking photos</h1><p>Made-up Robin. Code-drawn ink. No real handwriting proof. No model call.</p>${manifest.photos.map(p => `<article><a href="${p.image.path}"><img src="${p.image.path}" alt="${p.id}"></a><section><h2>${p.id}</h2><p>${p.clear ? "Clear" : "Blurry control"}. SHA-256 ${p.image.sha256}</p><table><tr><th>Question</th><th>Format</th><th>Truth</th><th>Written</th></tr>${p.truth.map(t => `<tr><td>${p.frame.questions.find(q => q.package?.id === t.itemId)!.number}</td><td>${t.format}</td><td>${t.result}</td><td>${escape(t.readings.map(r => r.text ?? r.issue ?? "").join("; "))}</td></tr>`).join("")}</table></section></article>`).join("")}`, { flag: "wx" });
  for (const variant of ["right", "wrong", "blank", "blurry"]) {
    const selected = manifest.photos.filter(p => p.id.endsWith(`-${variant}`));
    const composites: OverlayOptions[] = [];
    for (let i = 0; i < selected.length; i++) {
      const p = selected[i], x = (i % 5) * 255, y = Math.floor(i / 5) * 356;
      composites.push({ input: await sharp(resolve(output, p.image.path)).resize(255, 330).toBuffer(), left: x, top: y + 26 });
      composites.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="255" height="26"><text x="5" y="18" font-size="14">${p.id}</text></svg>`), left: x, top: y });
    }
    await sharp({ create: { width: 1275, height: 712, channels: 3, background: "white" } }).composite(composites).jpeg({ quality: 90 }).toFile(resolve(output, `contact-${variant}.jpg`));
  }
  return path;
}

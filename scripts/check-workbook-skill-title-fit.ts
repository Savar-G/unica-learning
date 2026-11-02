// Print every committed skill title in the real template's font, weight, size and 688 px title column.
// This is a print job through the existing Chromium print engine. No provider calls or database writes.
import { mkdir, writeFile } from "node:fs/promises";
import { BC_CURRICULUM } from "../src/lib/workbook-curriculum";
import { chromiumPrintEngine } from "../src/lib/print-engine-chromium";
import { PRINT_PAGE } from "../src/lib/workbook-render";
import { SKILL_TITLES } from "../src/lib/workbook-skill-titles";
import { skillTitleProblems } from "../src/lib/workbook-skill-title-check";
import { UNIT_TITLES } from "../src/lib/workbook-titles";
import { bandOf, workbookTemplate } from "../src/lib/workbook-template";
import { fixedTemplateFonts } from "../src/lib/workbook-template-fonts";

const problems = skillTitleProblems(SKILL_TITLES);
if (problems.length) throw new Error(problems.join("\n"));
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const rows = [
  ...BC_CURRICULUM.skills.map((s) => ({ id: s.id, level: Number(s.level.slice(1)), title: SKILL_TITLES[s.id] })),
  ...BC_CURRICULUM.units.map((u) => ({ id: `unit-${u.code}`, level: Number(u.level.slice(1)), title: UNIT_TITLES[u.code] })),
];
if (process.argv.includes("--probe-overflow")) rows.push({ id: "overflow-probe", level: 3,
  title: "Multiplication multiplication multiplication multiplication" });
const sheets: string[] = [];
for (let i = 0; i < rows.length; i += 16) {
  const titles = rows.slice(i, i + 16).map((r, n) => `<div class="pg ${bandOf(r.level).name}" style="top:${40 + n * 60}px;left:64px;width:688px;height:58px;bottom:auto;right:auto"><h1 class="tt" data-measure="${escape(r.id)}">${escape(r.title)}</h1></div>`).join("");
  sheets.push(`<section data-sheet="${sheets.length}">${titles}</section>`);
}
const template = workbookTemplate(await fixedTemplateFonts());
const frame = `@page{size:8.5in 11in;margin:0}html,body{margin:0;padding:0;background:white}[data-sheet]{position:relative;width:816px;height:1056px;overflow:hidden;break-after:page}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${frame}${template.css}</style></head><body>${sheets.join("")}</body></html>`;
const result = await chromiumPrintEngine().print({ html, sheets: sheets.length, page: PRINT_PAGE, scale: 1 });
if (result.pdfPages !== sheets.length || result.images.length !== sheets.length) throw new Error("Incomplete title print job");
const measurements = rows.map((r) => {
  const found = result.measured.filter((m) => m.name === r.id);
  const m = found[0];
  const fits = found.length === 1 && m.visible && m.textPrinted && m.text === r.title
    && m.clientWidth === 688 && m.scrollWidth <= m.clientWidth + 1 && m.scrollHeight <= m.clientHeight + 1;
  return { ...r, fits, measurement: m };
});
const out = "/tmp/ui-review/wording-r2";
await mkdir(out, { recursive: true });
await writeFile(`${out}/skill-title-fit.json`, JSON.stringify(measurements, null, 2) + "\n");
const failed = measurements.filter((m) => !m.fits);
for (const row of failed) console.error(`${row.id}: "${row.title}" did not print on one line`);
console.log(`${rows.length} titles measured in Chromium; ${failed.length} failures`);
if (failed.length) process.exitCode = 1;

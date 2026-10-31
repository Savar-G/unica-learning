// Renders sample books with the workbook templates (#310) and writes page images for review:
//   node scripts/render-workbook-templates.mjs <folder> [U2,U6,U12,U22 ...] [--test U12] [--overflow]
// One PNG per page type and level (<level>-<book page>-<type>.png), the PDF of each book, and with --overflow one
// deliberately overflowing page with its failure drawn on it. Uses the local Chromium (src/lib/print-engine-chromium.ts).
import { mkdir, writeFile } from "node:fs/promises";
import { chromiumPrintEngine } from "../src/lib/print-engine-chromium";
import { proofPages, renderWorkbook, type WorkbookDraft } from "../src/lib/workbook-render";
import type { BookOmission } from "../src/lib/workbook-page";
import { sampleBook } from "../src/lib/workbook-sample-book";
import { workbookTemplate } from "../src/lib/workbook-template";
import { fixedTemplateFonts } from "../src/lib/workbook-template-fonts";

const [out = "/tmp/ui-review/templates", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const levels = rest.filter((a, i) => /^U\d+$/.test(a) && rest[i - 1] !== "--test");
const tests = rest.flatMap((a, i) => (rest[i - 1] === "--test" ? [a] : []));
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const ids = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const NAMES: Record<string, string> = { U2: "Ava", U6: "Leah", U12: "Mateo", U22: "Ethan" };

await mkdir(out, { recursive: true });
const template = workbookTemplate(await fixedTemplateFonts());
const engine = chromiumPrintEngine();

async function one(label: string, draft: WorkbookDraft, omissions: BookOmission[]) {
  const t0 = Date.now();
  const result = await renderWorkbook({ draft, parentId: PARENT, template, engine });
  console.log(`${label}: ${draft.pages.length} pages, ${result.status} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (omissions.length) {
    console.log(`  ${omissions.length} planned parts placed fewer items, for example:`);
    for (const x of omissions.slice(0, 4)) console.log(`    page ${x.page} (day ${x.day} p${x.dayPage}) ${x.kind}: ${x.placed} of ${x.requested}: ${x.reason}`);
  }
  if (result.status !== "rendered") {
    for (const p of result.problems.slice(0, 30)) console.log(`  page ${p.page}${p.question ? ` q${p.question}` : ""}${p.slot ? ` [${p.slot}]` : ""}: ${p.reason}`);
    const proofs = await proofPages({ draft, template, engine, problems: result.problems });
    for (const p of proofs.slice(0, 12)) await writeFile(`${out}/${label}-FAILED-p${String(p.page).padStart(2, "0")}.png`, p.png);
    return;
  }
  await writeFile(`${out}/${label}.pdf`, result.files[0].bytes);
  const seen = new Set<string>();
  draft.pages.forEach((page, i) => {
    const c = page.content;
    const key = page.type === "parent-led" && c?.kind === "day" ? `parent-led-${c.blocks[0]?.slot}` : page.type;
    if (seen.has(key) && !flags.has("--all")) return;
    seen.add(key);
    void writeFile(`${out}/${label}-p${String(page.number).padStart(2, "0")}-${key}.png`, result.files[i + 1].bytes);
  });
}

let n = 0;
for (const level of levels) {
  const book = sampleBook({ level, workbookId: ids(++n), childId: CHILD, child: NAMES[level] ?? "Sam", number: 2 });
  await one(level, book.draft, book.omissions);
}
for (const level of tests) {
  const book = sampleBook({ level, workbookId: ids(++n), childId: CHILD, child: NAMES[level] ?? "Sam", number: 4, testWorkbook: true });
  await one(`${level}-test-book`, book.draft, book.omissions);
}
if (flags.has("--overflow")) {
  // A practice page given more questions than its On your own slot holds, past the content area.
  const book = sampleBook({ level: "U12", workbookId: ids(++n), childId: CHILD, child: "Mateo", number: 2 });
  const page = book.draft.pages.find((p) => p.type === "practice")!;
  const content = page.content!;
  if (content.kind !== "day") throw new Error("not a day page");
  const own = content.blocks.find((b) => b.slot === "on-your-own")!;
  const mine = page.questions.filter((q) => own.items.includes(q.number));
  const extra = [...mine, ...mine, ...mine].map((q, k) => ({ ...q, number: page.questions.length + k + 1 }));
  for (const q of extra) q.package = { ...q.package, id: `${q.package.id}-x${q.number}`, ref: { ...q.package.ref, question: q.number } as typeof q.package.ref };
  page.questions.push(...extra);
  own.items.push(...extra.map((q) => q.number));
  const only: WorkbookDraft = { ...book.draft, pages: [page] };
  await one("overflow-U12-practice", only, []);
}

// Renders the synthetic answer-box layout pages (#1212, src/lib/workbook-answer-layout-fixture.ts) to PNG for review:
//   node scripts/render-workbook-answer-layout.mjs <folder> [--levels 6,12] [--legacy]
// One page per scenario and level on the measured layout (and, with --legacy, the saved legacy layout). A page that
// fails the strict render is written as <name>-FAILED.png with its reasons drawn on it.
import { mkdir, writeFile } from "node:fs/promises";
import { chromiumPrintEngine } from "../src/lib/print-engine-chromium";
import { ANSWER_LAYOUT_BOOK, answerLayoutPages } from "../src/lib/workbook-answer-layout-fixture";
import { proofPages, renderWorkbook } from "../src/lib/workbook-render";
import { workbookTemplate } from "../src/lib/workbook-template";
import { fixedTemplateFonts } from "../src/lib/workbook-template-fonts";

const [out = "/tmp/ui-review/answer-layout", ...rest] = process.argv.slice(2);
const levelsAt = rest.indexOf("--levels");
const levels = (levelsAt >= 0 ? rest[levelsAt + 1] : "6").split(",").map(Number);
const layouts = rest.includes("--legacy") ? [true, false] : [true];
await mkdir(out, { recursive: true });
const template = workbookTemplate(await fixedTemplateFonts());
const engine = chromiumPrintEngine();
const parentId = "11111111-1111-4111-8111-111111111111";

for (const level of levels) for (const consistent of layouts) {
  for (const [name, page] of Object.entries(answerLayoutPages(level, consistent))) {
    const label = `${name}-U${level}${consistent ? "" : "-legacy"}`;
    const draft = { ...ANSWER_LAYOUT_BOOK, levels: [level], pages: [page] };
    const result = await renderWorkbook({ draft, parentId, template, engine });
    if (result.status === "rendered") {
      await writeFile(`${out}/${label}.png`, result.files[1].bytes);
      console.log(`${label}: rendered`);
    } else {
      console.log(`${label}: FAILED`);
      for (const p of result.problems.slice(0, 6)) console.log(`  ${p.question ? `q${p.question}: ` : ""}${p.reason}`);
      const proofs = await proofPages({ draft, template, engine, problems: result.problems });
      for (const p of proofs) await writeFile(`${out}/${label}-FAILED.png`, p.png);
    }
  }
}

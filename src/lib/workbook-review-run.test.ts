import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { findChromium } from "./print-engine-chromium";
import type { GeneratedWorkbook } from "./workbook-generator";
import { workbookBuilderCoverage } from "./workbook-builder-coverage";
import { curriculumFor } from "./workbook-curriculum";
import { itemContractProblem, planItem } from "./workbook-item-plan";
import { planLevel } from "./workbook-plan";
import { PDFDocument } from "pdf-lib";
import { chromiumPrintEngine } from "./print-engine-chromium";
import { renderableDraft } from "./workbook-fit";
import { renderWorkbook } from "./workbook-render";
import { workbookTemplate } from "./workbook-template";
import { fixedTemplateFonts } from "./workbook-template-fonts";

const chromium=await findChromium();
const run=promisify(execFile);

it.skipIf(!chromium)("completes the full 40-page U4 review command with real fit and fullness checks",async()=>{
  const out=await mkdtemp(join(tmpdir(),"workbook-u4-review-"));
  const env={...process.env};
  for(const key of ["OPENROUTER_API_KEY","OPENROUTER_API_KEY_FILE","ANTHROPIC_API_KEY","ANTHROPIC_API_KEY_FILE"]) delete env[key];
  // A zero exit without a book used to hide the capacity failure. Require the
  // actual draft, PDF, measured fullness, coverage and printed review summary.
  const result=await run(process.execPath,["scripts/workbook-samples.mjs","--fake","--no-store","--levels","U4","--days","1,3,5,8,10","--concurrency","2","--out",out],{cwd:process.cwd(),env,timeout:600_000,maxBuffer:2_000_000});
  const draft:GeneratedWorkbook=JSON.parse(await readFile(join(out,"U4-draft.json"),"utf8"));
  const index=await readFile(join(out,"index.md"),"utf8");
  expect(result.stdout).toContain("done: 1 books");
  expect(draft.pages).toHaveLength(44);
  expect(draft.pages.filter(p=>p.day!==null)).toHaveLength(40);
  expect(draft.counts.failed).toBe(0);
  expect(draft.counts.failedPages).toBe(0);
  expect(draft.quality).toMatchObject({ready:true,dropped:0,issues:[]});
  expect(draft.pages.every(p=>p.fit.status!=="failed")).toBe(true);
  const extra=draft.pages.filter(p=>p.content?.kind==="day" && p.content.extraPractice);
  expect(extra).toHaveLength(2);
  expect(extra.every(p=>p.questions.length>=8 && p.day===null)).toBe(true);
  expect(draft.pages.some(p=>p.type==="blank" || p.type==="back-cover")).toBe(false);
  for(const p of draft.pages) if(p.content?.kind==="day") for(const b of p.content.blocks) {
    if(["worked-example","watch-one"].includes(b.slot)) expect(Boolean(b.methods?.some(m=>m.lines.length) || b.lines?.length || b.figure)).toBe(true);
  }
  expect(draft.pages.flatMap(p=>p.leftOut ?? [])).toEqual([]);
  expect(index).toContain("## Failures (0)");
  expect(index).toContain("subscription 0; API 0 | PASS | HOLD");
  expect((await stat(join(out,"U4.pdf"))).size).toBeGreaterThan(10_000);
  expect((await PDFDocument.load(await readFile(join(out,"U4.pdf")))).getPageCount()).toBe(44);
  for(const day of [5,10]) expect(draft.pages.filter(p=>p.day===day).flatMap(p=>p.questions).filter(q=>q.part==="friday-5")).toHaveLength(5);
  for(const day of [1,3,5,8,10]) expect(draft.pages.filter(p=>p.day===day).flatMap(p=>p.questions).filter(q=>q.place==="challenge")).toHaveLength(3);
  // #482 review finding 3: the generated approved-v1 day-start page keeps 18 px below Name and Date (DESIGN 4).
  const starts=draft.pages.filter(p=>p.content?.kind==="day" && p.content.consistentLayout && p.pageOfDay===1).slice(0,2);
  expect(starts.length).toBe(2);
  const engine=chromiumPrintEngine(), template=workbookTemplate(await fixedTemplateFonts());
  const book=renderableDraft(draft);
  let printed!: Awaited<ReturnType<typeof engine.print>>;
  await renderWorkbook({draft:{...book,pages:book.pages.filter(p=>starts.some(s=>s.number===p.number))},parentId:"11111111-1111-4111-8111-111111111111",template,
    engine:{print:async job=>(printed=await engine.print(job))}});
  for(const sheet of [0,1]) {
    const name=printed.measured.find(m=>m.sheet===sheet && m.name==="slot-name-date")!;
    const label=printed.measured.find(m=>m.sheet===sheet && m.name==="slot-day-label")!;
    expect(label.y-name.y-name.height).toBeGreaterThanOrEqual(18);
  }
  await rm(out,{recursive:true,force:true});
},600_000);

it("reports each level's covered and existing-path skills without changing the curriculum",()=>{
  const c=curriculumFor("bc")!;
  const report=workbookBuilderCoverage(c);
  expect(report).toHaveLength(30);
  // #489: the taught skills take their step templates; U14's multiplication and fractions too.
  expect(report.find(r=>r.level==="U14")!.templates).toEqual(expect.arrayContaining(["4.5-multiply-1-digit","4.5-divide-1-digit","4.3-same-denominator"]));
  expect(report.find(r=>r.level==="U4")!.existing).toEqual([]);
  for(const row of report) {
    const expected=[...new Set([...(c.levelSkills(row.level) ?? []).map(s=>s.id),...planLevel(c,row.level)!.fluency])].sort();
    expect([...row.templates,...row.approved,...row.existing].sort()).toEqual(expected);
    expect(new Set([...row.templates,...row.approved,...row.existing]).size).toBe(expected.length);
  }
});

it("selects a short fixed story before fitting and rejects a longer writer answer",()=>{
  const p=planItem({skill:"1.1-count-to-20",slot:"1.1",level:4,day:1,ordinal:280,story:true,range:{min:1,max:8,pictures:false,help:"none"},textBudget:{lines:3,perLine:23,characters:69}})!;
  expect(p).not.toBeNull();
  expect(itemContractProblem(p.item,p)).toBeNull();
  const long={...p.item,text:`${p.item.text} Please think carefully about every step before you write your answer.`};
  expect(itemContractProblem(long,p)).toMatch(/fit 3 lines/);
});

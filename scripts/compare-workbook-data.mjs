// Compare stored local sample output. No model calls or database access.
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const [before, after, output] = process.argv.slice(2);
if (!before || !after || !output) throw new Error("Usage: node scripts/compare-workbook-data.mjs <v1-dir> <v2-dir> <report.json>");
const temp = mkdtempSync(join(tmpdir(), "workbook-data-comparison-"));
try {
  await build({ stdin: { contents: 'export { sentenceFrameOf, stemOf, largestNumber } from "./src/lib/workbook-task-identity";', resolveDir: process.cwd(), loader: "ts" }, outfile: join(temp, "reads.mjs"), bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") } });
  const { sentenceFrameOf, stemOf, largestNumber } = await import(pathToFileURL(join(temp, "reads.mjs")));
  const count = values => Object.fromEntries([...new Set(values)].sort().map(v => [v, values.filter(x => x === v).length]));
  const summarize = (dir, level) => {
    const d = JSON.parse(readFileSync(join(dir, `${level}-draft.json`), "utf8"));
    const m = JSON.parse(readFileSync(join(dir, `${level}-measurements.json`), "utf8"));
    const uses = m.pageUse.filter(p => p.fraction !== null).map(p => p.fraction);
    const frames = [], stems = [], truth = [], challenges = [], byDay = new Map();
    for (const p of d.pages.filter(p => p.day !== null)) {
      const questions = p.questions.filter(q => q.package && q.place !== "warm-up" && q.itemPlan?.source !== "explain");
      const sf = questions.map(q => sentenceFrameOf(q.package)).filter(Boolean);
      const st = questions.map(q => stemOf(q.package)).filter(Boolean);
      frames.push(...Object.values(count(sf))); stems.push(...Object.values(count(st)));
      byDay.set(p.day, [...byDay.get(p.day) ?? [], ...sf]);
      const tf = questions.filter(q => q.itemPlan?.template?.format === "true-false");
      const answers = tf.map(q => q.itemPlan.template.answer.toLowerCase());
      if (tf.length) truth.push({ page: p.number, true: answers.filter(a => ["true", "yes"].includes(a)).length, false: answers.filter(a => ["false", "no"].includes(a)).length });
      for (const q of questions.filter(q => q.place === "challenge")) challenges.push({ page: p.number, difficulty: q.itemPlan?.template?.difficulty ?? "builder", skill: q.itemPlan?.template?.skill, step: q.itemPlan?.template?.step, largestNumber: largestNumber(q.package) });
    }
    const dayFrames = [...byDay.values()].flatMap(values => Object.values(count(values)));
    return { counts: d.counts, failedPercent: 100 * d.quality.failedRate, droppedForRoom: d.quality.dropped, leftOut: d.pages.reduce((n,p) => n + (p.leftOut?.length ?? 0), 0), omissions: d.pages.reduce((n,p) => n + (p.omissions ?? []).filter(o => !o.time).reduce((n,o) => n + Math.max(0,o.requested-o.placed),0),0), renderErrors: m.renderProblems.length, fitFailures: d.counts.failedPages, fullness: { min: Math.min(...uses), mean: uses.reduce((a,b) => a+b,0)/uses.length }, spacingFailures: m.pageUse.filter(p => p.problem).length, days: d.quality.days, steps: d.quality.steps, sources: d.quality.sources, variety: { pageFrameMax: Math.max(0,...frames), dayFrameMax: Math.max(0,...dayFrames), pageStemMax: Math.max(0,...stems), pageFrameDistribution: count(frames), dayFrameDistribution: count(dayFrames), pageStemDistribution: count(stems), issues: d.quality.issues.filter(i => i.kind === "variety"), truth }, challenge: { difficulties: count(challenges.map(c => c.difficulty)), cards: challenges }, issues: d.quality.issues, ready: d.quality.ready };
  };
  const report = [];
  for (const level of ["U4", "U10", "U14", "U16", "U26"]) if (existsSync(join(before, `${level}-draft.json`)) && existsSync(join(after, `${level}-draft.json`))) {
    const v1 = summarize(before,level), v2 = summarize(after,level);
    const worse = [];
    for (const key of ["failedPercent","droppedForRoom","leftOut","omissions","renderErrors","fitFailures","spacingFailures"]) if (v2[key] > v1[key]) worse.push(key);
    for (const key of ["min","mean"]) if (v2.fullness[key] + 1e-9 < v1.fullness[key]) worse.push(`fullness.${key}`);
    for (const key of ["pageFrameMax","dayFrameMax","pageStemMax"]) if (v2.variety[key] > v1.variety[key]) worse.push(`variety.${key}`);
    if (v2.variety.issues.length > v1.variety.issues.length) worse.push("variety.issues");
    report.push({ level, before: resolve(before), after: resolve(after), v1, v2, worse });
  }
  writeFileSync(output, JSON.stringify(report,null,2)+"\n");
  console.log(report.map(r => ({ level:r.level, failed:[r.v1.failedPercent,r.v2.failedPercent], dropped:[r.v1.droppedForRoom,r.v2.droppedForRoom], fullness:[r.v1.fullness,r.v2.fullness], worse:r.worse })));
} finally { rmSync(temp,{recursive:true,force:true}); }

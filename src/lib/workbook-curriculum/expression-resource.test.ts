import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "unica-expression-limits-"));
  buildSync({ stdin: { contents: 'export { fillTemplate, prepareTemplate, seededRandom } from "./src/lib/workbook-curriculum/template"; export { parseStepProgressions } from "./src/lib/workbook-curriculum/step-source"; export { evaluateExpression, formatValue, FractionValue } from "./src/lib/workbook-curriculum/expression";', resolveDir: process.cwd(), loader: "ts" }, outfile: join(directory, "api.mjs"), bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  const template = { format: "bare", difficulty: "easy", text: "ok", slots: {}, derived: { a0: "1" } as Record<string, string>, answer: "1" };
  for (let i = 1; i <= 10000; i++) template.derived[`a${i}`] = `a${i - 1}` + " + 0".repeat(50);
  const source = { curriculum: "bc", format: "test", contexts: { people: [{ name: "A", they: "they", them: "them", their: "their" }], things: ["items"], animals: ["cats"], foods: ["apples"], places: ["school"], containers: ["box"], units_length: ["cm"], units_mass: ["g"], units_capacity: ["L"], money: { currency: "$", coins: [1], bills: [5] } }, steps: [{ curriculum: "bc", skill: "test", number: 1, position: "U1.1.1.1", name: "test", change: "test", rules: "test", example: { problem: "test", answer: "1" }, pages: 1, representation: "test", mistakes: [], spotTheError: { wrong: "test", fix: "test" }, arithmetic: "none", templates: [template] }] };
  writeFileSync(join(directory, "chain.json"), JSON.stringify(source));
  writeFileSync(join(directory, "probe.mjs"), `
import {readFileSync} from 'node:fs';
import {fillTemplate, prepareTemplate, parseStepProgressions, seededRandom, evaluateExpression, formatValue, FractionValue} from './api.mjs';
const mode = process.argv[2];
const contexts = {people:[{name:'A',they:'they',them:'them',their:'their'}],things:['items'],animals:['cats'],foods:['apples'],places:['school'],containers:['box'],units_length:['cm'],units_mass:['g'],units_capacity:['L'],money:{currency:'$',coins:[1],bills:[5]}};
const template = {format:'bare',difficulty:'easy',text:'ok',slots:{},derived:{},answer:'1'};
let hugeA=0n,hugeB=1n;
if (mode.startsWith('fraction')) for(let i=0;i<(mode.includes('bounded')?360:5800);i++) [hugeA,hugeB]=[hugeB,hugeA+hugeB];
if (mode === 'format24' || mode === 'equality28') {
  const levels = mode === 'format24' ? 24 : 28;
  template.derived.a0 = '[1, 1]';
  for (let i = 1; i <= levels; i++) template.derived['a'+i] = '[a'+(i-1)+', a'+(i-1)+']';
  template.answer = mode === 'format24' ? 'str(a24)' : 'a28 == a28';
} else if (mode === 'depth') {
  template.derived.a0 = '1';
  for (let i = 1; i <= 20; i++) template.derived['a'+i] = '[[a'+(i-1)+']]';
  template.answer = 'str(a20)';
} else if (mode === 'work' || mode === 'retries') {
  template.derived.a0 = '{' + Array.from({length:64},(_,i)=>i).join(',') + '}';
  if(mode==='work') for (let i = 1; i <= 20; i++) template.derived['a'+i] = 'a0 == a0';
  else template.check = 'a0 != a0';
} else if (mode === 'strings' || mode === 'render') {
  template.derived.a0 = "'" + 'x'.repeat(128) + "'";
  if(mode==='strings') for (let i = 1; i <= 10; i++) template.derived['a'+i] = 'a'+(i-1)+' + a'+(i-1);
  else template.text = '{a0}'.repeat(17);
} else if (mode === 'format-output' || mode === 'format-large') {
  template.derived.a0 = '[' + Array(12).fill("'"+'x'.repeat(20)+"'").join(',') + ']';
  if(mode==='format-large') {
    for(let i=1;i<=3;i++) template.derived['a'+i]='[a'+(i-1)+', a'+(i-1)+']';
    template.answer='str(a3)';
  } else template.answer='str(a0)';
} else if (mode.startsWith('fraction')) {
  template.derived.a=String(hugeA);template.derived.b=String(hugeB);
  template.check=Array(mode==='fraction-default'?100:9).fill('Fraction(a, b)').join(' == ')+' != Fraction(a, b)';
}
const started = performance.now();
try {
  if (mode === 'prepare-import' || mode === 'prepare-fill') {
    const source=JSON.parse(readFileSync(new URL('./chain.json',import.meta.url),'utf8'));
    if(mode==='prepare-import') parseStepProgressions(source);
    else prepareTemplate(source.steps[0],source.steps[0].templates[0],source.contexts);
  } else if (mode === 'power') evaluateExpression('10 ** 10 ** 10');
  else if (mode === 'long-input') evaluateExpression("'"+'x'.repeat(20000)+"'");
  else if (mode === 'long-binding') formatValue('x'.repeat(1000000));
  else if (mode === 'collection') evaluateExpression('len(a)',{a:Array(257).fill(1n)});
  else if (mode === 'fraction-value') new FractionValue(hugeA,hugeB);
  else fillTemplate({}, template, contexts, seededRandom(1),mode.includes('1000')?1000:100);
  console.log(JSON.stringify({accepted:true,elapsedMs:performance.now()-started}));
} catch (error) {
  console.log(JSON.stringify({name:error.name,message:error.message,elapsedMs:performance.now()-started}));
}
`);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe("hard input and value caps in a 64 MB Node child", () => {
  it.each([
    ["prepare-import", "entry limit"], ["prepare-fill", "entry limit"],
    ["fraction-default", "character limit"], ["fraction-1000", "character limit"],
    ["fraction-value", "256-bit"], ["fraction-bounded", "work limit"], ["fraction-bounded-1000", "work limit"],
    ["format24", "expanded value size"], ["equality28", "expanded value size"],
    ["depth", "nesting"], ["work", "work"], ["retries", "work"],
    ["strings", "string"], ["render", "output string length"],
    ["format-large", "output string length"], ["power", "limit"],
    ["long-input", "limit"], ["long-binding", "string"], ["collection", "Collection"],
  ])("rejects %s without a crash or a one-second timeout", (mode, message) => {
    const run = spawnSync(process.execPath, ["--max-old-space-size=64", join(directory, "probe.mjs"), mode], { encoding: "utf8", timeout: 1000, maxBuffer: 20000 });
    expect(run.error).toBeUndefined(); expect(run.signal).toBeNull(); expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result.name).toBe("ExpressionError"); expect(result.message).toContain(message); expect(result.elapsedMs).toBeLessThan(1000);
  });
  it("allows bounded collection formatting as a positive control", () => {
    const run = spawnSync(process.execPath, ["--max-old-space-size=64", join(directory, "probe.mjs"), "format-output"], { encoding: "utf8", timeout: 1000 });
    expect(run.error).toBeUndefined(); expect(run.signal).toBeNull(); expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout).accepted).toBe(true);
  });
});

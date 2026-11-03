import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "unica-expression-limits-"));
  buildSync({ stdin: { contents: 'export { fillTemplate, seededRandom } from "./src/lib/workbook-curriculum/template"; export { evaluateExpression, formatValue } from "./src/lib/workbook-curriculum/expression";', resolveDir: process.cwd(), loader: "ts" }, outfile: join(directory, "api.mjs"), bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  writeFileSync(join(directory, "probe.mjs"), `
import {fillTemplate, seededRandom, evaluateExpression, formatValue} from './api.mjs';
const mode = process.argv[2];
const template = {format:'bare',difficulty:'easy',text:'ok',slots:{},derived:{},answer:'1'};
if (mode === 'format24' || mode === 'equality28') {
  const levels = mode === 'format24' ? 24 : 28;
  template.derived.a0 = '[1, 1]';
  for (let i = 1; i <= levels; i++) template.derived['a'+i] = '[a'+(i-1)+', a'+(i-1)+']';
  template.answer = mode === 'format24' ? 'str(a24)' : 'a28 == a28';
} else if (mode === 'depth') {
  template.derived.a0 = '1';
  for (let i = 1; i <= 80; i++) template.derived['a'+i] = '[a'+(i-1)+']';
  template.answer = 'str(a80)';
} else if (mode === 'work') {
  template.derived.a0 = '{' + Array.from({length:64},(_,i)=>i).join(',') + '}';
  for (let i = 1; i <= 100; i++) template.derived['a'+i] = 'a0 == a0';
} else if (mode === 'retries') {
  template.derived.a0 = '{' + Array.from({length:64},(_,i)=>i).join(',') + '}';
  template.check = 'a0 != a0';
} else if (mode === 'strings') {
  template.derived.a0 = "'" + 'x'.repeat(1000) + "'";
  for (let i = 1; i <= 10; i++) template.derived['a'+i] = 'a'+(i-1)+' + a'+(i-1);
} else if (mode === 'render') {
  template.derived.a0 = "'" + 'x'.repeat(1000) + "'";
  template.text = '{a0}'.repeat(17);
} else if (mode === 'format-output') {
  template.derived.a0 = '[' + Array(300).fill("'"+'x'.repeat(40)+"'").join(',') + ']';
  template.answer = 'str(a0)';
} else if (mode === 'format-large') {
  template.derived.a0 = '[' + Array(370).fill("'"+'x'.repeat(40)+"'").join(',') + ']';
  template.answer = 'str(a0)';
}
const started = performance.now();
try {
  if (mode === 'power') evaluateExpression('10 ** 10 ** 10');
  else if (mode === 'long-input') evaluateExpression("'"+'x'.repeat(20000)+"'");
  else if (mode === 'long-binding') formatValue('x'.repeat(1000000));
  else fillTemplate({}, template, {}, seededRandom(1));
  console.log(JSON.stringify({accepted:true,elapsedMs:performance.now()-started}));
} catch (error) {
  console.log(JSON.stringify({name:error.name,message:error.message,elapsedMs:performance.now()-started}));
}
`);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe("whole-fill resource limits in a 64 MB Node child", () => {
  it.each([
    ["format24", "expanded value size"], ["equality28", "expanded value size"],
    ["depth", "nesting"], ["work", "work"], ["retries", "work"],
    ["strings", "output string length"], ["render", "output string length"],
    ["format-large", "output string length"], ["power", "limit"],
    ["long-input", "limit"], ["long-binding", "output string length"],
  ])("rejects %s without a crash or timeout", (mode, message) => {
    const run = spawnSync(process.execPath, ["--max-old-space-size=64", join(directory, "probe.mjs"), mode], { encoding: "utf8", timeout: 3000, maxBuffer: 20000 });
    expect(run.error).toBeUndefined();
    expect(run.signal).toBeNull();
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result.name).toBe("ExpressionError");
    expect(result.message).toContain(message);
    expect(result.elapsedMs).toBeLessThan(2500);
  });
  it("allows bounded collection formatting as a positive control", () => {
    const run = spawnSync(process.execPath, ["--max-old-space-size=64", join(directory, "probe.mjs"), "format-output"], { encoding: "utf8", timeout: 3000 });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout).accepted).toBe(true);
  });
});

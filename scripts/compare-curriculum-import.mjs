// Fixed --fake draft comparison. No provider, database, PDF renderer, or hosted writes.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
if (!process.argv.includes("--fake")) throw new Error("--fake is required");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(root, ".workbook-sample/pr487-comparison"); mkdirSync(directory, { recursive: true });
const baseline = "f70682df";
const beforeSource = execFileSync("git", ["show", `${baseline}:src/lib/workbook-curriculum/bc.ts`], { cwd: root, encoding: "utf8" });
const modules = {};
for (const [label, contents] of [["before", beforeSource], ["current", readFileSync(join(root, "src/lib/workbook-curriculum/bc.ts"), "utf8")]]) {
  const outfile = join(directory, `${label}-data.mjs`);
  await build({ stdin: { contents, resolveDir: root, loader: "ts" }, outfile, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  modules[label] = (await import(pathToFileURL(outfile))).BC_CURRICULUM;
}
const sample = readFileSync(join(root, "scripts/workbook-samples.ts"), "utf8");
const from = sample.indexOf("function fakeAi(): AiClient {"), to = sample.indexOf("// ---------- The test family ----------");
if (from < 0 || to <= from) throw new Error("Cannot locate the repository fake AI");
const contents = `
import {writeFileSync} from 'node:fs';
import type {AiClient} from '@/lib/ai-client';
import {generateWorkbook} from '@/lib/workbook-generator';
import {curriculumFor} from '@/lib/workbook-curriculum';
import {planWorkbook} from '@/lib/workbook-plan';
import {sampleChild,samplePlanInput} from '@/lib/workbook-sample-profiles';
import {memoryDraftStore} from '@/lib/workbook-draft-memory';
import {keySolver} from '@/lib/workbook-solve-check';
${sample.slice(from, to)}
if(!process.argv.includes('--fake'))throw Error('--fake is required');
const BC=curriculumFor('bc')!, child=sampleChild(BC,'U10')!;
const input=samplePlanInput(BC,child,'first'), plan=planWorkbook(input);if(!plan.ok)throw Error(plan.reason);
const workbookId='00000000-0000-4000-8000-0000000000a1',childId='00000000-0000-4000-8000-0000000000c1',parentId='00000000-0000-4000-8000-0000000000f1';
let token=0;const result=await generateWorkbook({workbookId,childId,number:input.workbook.number,profileBuild:null,plan:plan.plan,curriculum:BC,book:{child:child.name}}, {ai:fakeAi(),fit:{fits:async()=>({ok:true})},store:memoryDraftStore({[childId]:parentId}),qrToken:()=> 'token-'+String(++token).padStart(12,'0'),concurrency:1,timeLimitMs:240000,solver:keySolver(),solveTimeLimitMs:60000,now:()=>0});
if(result.status!=='stored')throw Error(JSON.stringify(result));
writeFileSync(process.argv.at(-1),JSON.stringify(result.draft));
`;
const drafts = {}, hashes = {};
for (const [label, data] of [["before", modules.before], ["after", modules.current], ["oldStepsWithNewMetadata", { ...modules.current, steps: modules.before.steps }]]) {
  const outfile = join(directory, `${label}.mjs`), json = join(directory, `${label}.json`);
  await build({ stdin: { contents, resolveDir: root, loader: "ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", alias: { "@": join(root, "src") }, plugins: [{ name: "pinned-curriculum", setup(b) { b.onLoad({ filter: /workbook-curriculum\/bc\.ts$/ }, () => ({ contents: 'export const BC_CURRICULUM = ' + JSON.stringify(data), loader: "ts" })); } }], logLevel: "silent" });
  execFileSync(process.execPath, ["--conditions=react-server", outfile, "--fake", json], { cwd: root, stdio: "pipe" });
  const bytes = readFileSync(json); drafts[label] = JSON.parse(bytes); hashes[label] = createHash("sha256").update(bytes).digest("hex");
}
if (hashes.before !== hashes.oldStepsWithNewMetadata) throw new Error("Output changed outside the imported step data");
const changedPages = drafts.after.pages.filter((p, i) => !isDeepStrictEqual(p, drafts.before.pages[i])).map(p => p.number);
const identityFields = ["id", "childId", "number", "levels", "profileBuild", "model"];
if (!identityFields.every(k => isDeepStrictEqual(drafts.before[k], drafts.after[k]))) throw new Error("Draft identity changed");
const report = { baselineCommit: execFileSync("git", ["rev-parse", baseline], { cwd: root, encoding: "utf8" }).trim(), level: "U10", mode: "--fake", hashes, before: drafts.before.counts, after: drafts.after.counts, changedPages, unchangedPages: drafts.after.pages.length - changedPages.length, identityFieldsUnchanged: identityFields, oldStepsWithNewMetadataMatchesBaseline: true, proof: "Fixed public generateWorkbook inputs with repository fake AI, key solver, in-memory store, fixed QR tokens and clock, and a passing fit stub. This is draft-output proof, not PDF, layout, real-model, or book-quality acceptance." };
writeFileSync(join(root, "data/curriculum/fake-generation-comparison.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

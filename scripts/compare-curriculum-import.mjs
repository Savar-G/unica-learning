// Run the real --fake sample CLI on pinned main and this worktree. No fit stub or provider/database writes.
import { build } from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
if (!process.argv.includes("--fake")) throw new Error("--fake is required");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(root, ".workbook-sample/pr487-comparison");
mkdirSync(directory, { recursive: true });
const baseline = "8b05542b1afb4fbe5723ecfecb422bbbd8196ae8";
const sourceAt = (path) => execFileSync("git", ["show", `${baseline}:${path}`], { cwd: root, encoding: "utf8" });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
// The CLI has no draft export. Add an observation after generation, and fix only its external identities and clock.
function observeCli(contents) {
  const replacements = [
    ['import { randomBytes, randomUUID } from "node:crypto";', `import { createHash } from "node:crypto";
let identity = 0;
const randomUUID = () => "00000000-0000-4000-8000-" + String(++identity).padStart(12, "0");
const randomBytes = (length: number) => createHash("sha256").update("pr487:" + ++identity).digest().subarray(0, length);`],
    ["now: () => Date.now()", "now: () => 0"],
    ["const draft = result.draft;", 'const draft = result.draft;\n  await writeFile(`${out}/${label}-draft.json`, JSON.stringify(draft));'],
  ];
  for (const [before, after] of replacements) {
    if (contents.split(before).length !== 2) throw new Error(`CLI observation point changed: ${before}`);
    contents = contents.replace(before, after);
  }
  return contents;
}
for (const version of ["main", "head"]) {
  await build({
    absWorkingDir: root, entryPoints: ["scripts/workbook-samples.ts"], outfile: join(directory, `${version}.mjs`),
    bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", logLevel: "silent",
    plugins: [{ name: "pinned-source-and-observation", setup(b) {
      b.onLoad({ filter: /\.(ts|tsx)$/ }, ({ path }) => {
        const name = relative(root, path);
        if (name.startsWith("node_modules/") || name.startsWith("../")) return;
        const contents = version === "main" ? sourceAt(name) : readFileSync(path, "utf8");
        return { contents: name === "scripts/workbook-samples.ts" ? observeCli(contents) : contents, loader: path.endsWith(".tsx") ? "tsx" : "ts" };
      });
    } }],
  });
}
async function run(version, level) {
  const out = join(directory, `${version}-${level}`), log = join(directory, `${version}-${level}.log`);
  mkdirSync(out, { recursive: true });
  const fd = openSync(log, "w");
  console.log(`${version} ${level}: real fit and render started`);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(directory, `${version}.mjs`), "--fake", "--levels", level, "--no-store", "--out", out], { cwd: root, stdio: ["ignore", fd, fd] });
      child.on("error", reject);
      child.on("exit", (code, signal) => code === 0 && !signal ? resolve() : reject(new Error(`${version} ${level}: exit ${code}, signal ${signal}; see ${log}`)));
    });
  } finally { closeSync(fd); }
  const output = readFileSync(log, "utf8");
  const counts = output.match(new RegExp(`${level}: (\\d+) pages, (\\d+) questions, (\\d+) failed, (\\d+) pages do not fit, (\\d+) left out for room, (\\d+) render problems`));
  const solve = output.match(new RegExp(`${level}: (\\d+) solve checks .+, (\\d+) read another way, (\\d+) failed or late, USD ([\\d.]+)`));
  if (!counts || !solve || !output.includes("done: 1 books, USD 0.00")) throw new Error(`Missing successful fake result: ${log}`);
  const fields = ["pages", "questions", "failedQuestions", "failedFitPages", "omissions", "strictRenderProblems"];
  const metrics = Object.fromEntries(fields.map((f, i) => [f, Number(counts[i + 1])]));
  metrics.solveChecks = Number(solve[1]); metrics.solveDisagreements = Number(solve[2]); metrics.solveFailures = Number(solve[3]);
  if (Number(solve[4]) || metrics.failedFitPages || metrics.strictRenderProblems || metrics.solveDisagreements || metrics.solveFailures) throw new Error(`Fit/render/solve gate failed: ${log}`);
  const index = readFileSync(join(out, "index.md"), "utf8");
  for (const [heading, end, field] of [["## Failures (", "## Left out for room", "failedQuestions"], ["## Left out for room (", "## Not checked by code", "omissions"]]) {
    const items = index.split(heading)[1]?.split(end)[0]?.split("\n").filter(line => line.startsWith(`- ${level} `));
    if (items?.length !== metrics[field]) throw new Error(`Index/log count mismatch: ${version} ${level} ${field}`);
  }
  const draftBytes = readFileSync(join(out, `${level}-draft.json`));
  const pdf = readFileSync(join(out, `${level}.pdf`));
  // Keep all PDF bytes except the two volatile timestamps. The replacement has the same length; xrefs stay valid.
  let dates = 0;
  const fixedPdf = Buffer.from(pdf.toString("latin1").replace(/\/(CreationDate|ModDate) \(D:\d{14}\+00'00'\)/g, (_, field) => {
    dates++; return `/${field} (D:20000101000000+00'00')`;
  }), "latin1");
  if (dates !== 2 || fixedPdf.length !== pdf.length) throw new Error("Unexpected PDF timestamp format");
  writeFileSync(join(out, `${level}-fixed-dates.pdf`), fixedPdf);
  const images = Array.from({ length: metrics.pages }, (_, i) => sha256(readFileSync(join(out, "pages", level, `p${String(i + 1).padStart(2, "0")}.png`))));
  console.log(`${version} ${level}: ${metrics.questions} questions; ${metrics.failedQuestions} failed; ${metrics.omissions} omitted`);
  return { metrics, draft: JSON.parse(draftBytes), draftSha256: sha256(draftBytes), pdfSha256: sha256(fixedPdf), rawPdfSha256: sha256(pdf), images };
}
const comparisons = [];
for (const level of ["U4", "U10", "U14"]) {
  // Each process owns a fresh fake client. Do not share its mutable counters across levels.
  const main = await run("main", level), head = await run("head", level);
  const changedDraftFields = [...new Set([...Object.keys(main.draft), ...Object.keys(head.draft)])].filter(key => !isDeepStrictEqual(main.draft[key], head.draft[key]));
  const changedPageImages = main.images.flatMap((hash, i) => hash === head.images[i] ? [] : [i + 1]);
  const sameMetrics = isDeepStrictEqual(main.metrics, head.metrics);
  if (main.draftSha256 !== head.draftSha256 || changedDraftFields.length || !sameMetrics || main.pdfSha256 !== head.pdfSha256) {
    throw new Error(`Book regression: ${JSON.stringify({ level, changedDraftFields, changedPageImages, sameMetrics, pdfMatches: main.pdfSha256 === head.pdfSha256 })}`);
  }
  comparisons.push({ level, main: main.metrics, head: head.metrics, mainDraftSha256: main.draftSha256, headDraftSha256: head.draftSha256, changedDraftFields, mainPdfSha256: main.pdfSha256, headPdfSha256: head.pdfSha256, mainRawPdfSha256: main.rawPdfSha256, headRawPdfSha256: head.rawPdfSha256, identicalPageImages: head.images.length - changedPageImages.length, changedPageImages, mainPageImageSha256: main.images, headPageImageSha256: head.images, pdfBytesEqualAfterFixingDates: true });
}
const report = {
  baselineCommit: baseline, mode: "--fake --levels <one level> --no-store", concurrency: 6,
  proof: "Real repository CLI, fit engine, strict renderer, PDF and page images. Fresh fake client per process. Only CLI identities, QR tokens and generator clock are fixed. Full draft bytes and all PDF bytes must match, with only PDF CreationDate/ModDate fixed. PNG hashes and raster differences are diagnostic and do not change this byte comparison. No fit stub, database writes or model calls.",
  comparisons,
};
writeFileSync(join(root, "data/curriculum/fake-generation-comparison.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(comparisons.map(({ level, head, changedDraftFields, identicalPageImages, pdfBytesEqualAfterFixingDates }) => ({ level, ...head, changedDraftFields, identicalPageImages, pdfBytesEqualAfterFixingDates })), null, 2));

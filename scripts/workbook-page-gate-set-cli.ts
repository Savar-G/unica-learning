// The page layout gate's calibration set and run (#859). See docs/workbook-page-gate-set-report.md.
//
// make: prints every page of the sample drafts as it prints for a family (the real templates, the Chromium print
//   engine, no fit check and no proof marks), and for each gate 12 changed copies with CSS that causes the fault on that
//   one sheet: text clipped or pushed off the sheet, a part moved over another, answer boxes shrunk below writing size.
//   Images go to .design/workbooks/page-gate-set/ (Git LFS), the list to docs/workbook-page-gate-set.json. No AI call.
// run: asks the decision model about every page once (all three gates in one request), at most --max-usd, stores the
//   answers in docs/workbook-page-gate-set-results.json, then writes the held-out report. --from-results only reports.
//
// node scripts/workbook-page-gate-set.mjs make --drafts /tmp/ui-review/759-main-full/U4-draft.json,/tmp/ui-review/759-main-full/U16-draft.json
// node scripts/workbook-page-gate-set.mjs run --estimate
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { attemptCostBound, decisionClient, decisionModelTerms, DecisionError } from "@/lib/decision-client";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { draftPage } from "@/lib/workbook-job";
import { reviewPrint, type PrintEngine } from "@/lib/workbook-render";
import { workbookTemplate } from "@/lib/workbook-template";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import { evaluatePageGateFolds, pageGateProbabilities, PAGE_GATES, type PageGate, type PageGateCase, type PageGateCaseRow } from "@/lib/workbook-page-gates";

const SET = "docs/workbook-page-gate-set.json";
const RESULTS = "docs/workbook-page-gate-set-results.json";
const REPORT = "docs/workbook-page-gate-set-report.md";
const IMAGES = ".design/workbooks/page-gate-set";
const MODEL = "typesafe/jev-1.14";
const COPIES = 12;

/** The CSS that makes each fault on sheet `i`, two ways each, so the set is not one pattern. */
const FAULTS: Record<PageGate, ((i: number) => string)[]> = {
  text_cut_off: [
    // (clip-path hides the right of each question's text without moving anything, so the page shows only this fault.)
    (i) => `[data-sheet="${i}"] .q .qb{clip-path:inset(0 42% 0 0)}`,
    (i) => `[data-sheet="${i}"] [data-measure="slot-title"]{margin-left:-180px!important;white-space:nowrap!important}`,
  ],
  overlap: [
    // (transform moves the second question onto the first without moving the rest of the page.)
    (i) => `[data-sheet="${i}"] .q:nth-of-type(2){transform:translate(-300px,6px);position:relative}`,
    (i) => `[data-sheet="${i}"] [data-measure="slot-title"]{position:relative!important;top:40px!important}`,
  ],
  box_too_small: [
    (i) => `[data-sheet="${i}"] .ab{width:14px!important;min-width:0!important;height:12px!important;min-height:0!important}`,
    (i) => `[data-sheet="${i}"] .ab{width:22px!important;min-width:0!important;height:9px!important;min-height:0!important}`,
  ],
};

interface SetFile { version: 1; model: string; drafts: string[]; cases: (PageGateCase & { image: string; variant: number | null })[] }

/** Prints with extra CSS: the template's own print, with a style added at the end of the head. */
const withCss = (engine: PrintEngine, css: string): PrintEngine => ({ print: (job) => engine.print({ ...job, html: job.html.replace("</head>", `<style>${css}</style></head>`) }) });

async function make(drafts: string[]) {
  const engine = chromiumPrintEngine();
  const template = workbookTemplate();
  const cases: SetFile["cases"] = [];
  await mkdir(IMAGES, { recursive: true });
  for (const file of drafts) {
    const draft = JSON.parse(await readFile(file, "utf8")) as GeneratedWorkbook;
    const level = draft.levels.join("-");
    // (Only pages with an answer box can show each fault; the cover and notes pages are left out.)
    const pages = draft.pages.filter((p) => p.questions.some((q) => q.package));
    const book = { id: draft.id, childId: draft.childId, number: draft.number, levels: draft.levels, profileBuild: draft.profileBuild, pages: pages.map(draftPage) };
    const clean = await reviewPrint({ draft: book, template, engine, problems: [] });
    for (const [i, p] of pages.entries()) {
      const id = `U${level}-p${p.number}`;
      const image = `${IMAGES}/${id}.png`;
      await writeFile(image, clean.images[i]);
      cases.push({ id, source: id, gate: null, image, variant: null });
    }
  }
  // Each gate's copies from spread-out source pages, alternating its two ways.
  const sources = cases.filter((c) => c.gate === null);
  for (const [g, gate] of PAGE_GATES.entries()) {
    for (let k = 0; k < COPIES; k++) {
      const source = sources[(g * 5 + k * Math.floor(sources.length / COPIES)) % sources.length];
      const [, level, number] = /^U(.+)-p(\d+)$/.exec(source.source)!;
      const file = drafts.find((f) => f.includes(`U${level}-`))!;
      const draft = JSON.parse(await readFile(file, "utf8")) as GeneratedWorkbook;
      const page = draft.pages.find((p) => p.number === Number(number))!;
      const book = { id: draft.id, childId: draft.childId, number: draft.number, levels: draft.levels, profileBuild: draft.profileBuild, pages: [draftPage(page)] };
      const variant = k % FAULTS[gate].length;
      const out = await reviewPrint({ draft: book, template, engine: withCss(engine, FAULTS[gate][variant](0)), problems: [] });
      const id = `${source.source}-${gate}-${k + 1}`;
      const image = `${IMAGES}/${id}.png`;
      await writeFile(image, out.images[0]);
      cases.push({ id, source: source.source, gate, image, variant });
    }
  }
  const set: SetFile = { version: 1, model: MODEL, drafts, cases };
  await writeFile(SET, JSON.stringify(set, null, 2) + "\n");
  console.log(JSON.stringify({ unchanged: sources.length, changed: cases.length - sources.length }));
}

async function run(o: { estimate: boolean; fromResults: boolean; max: number }) {
  const set = JSON.parse(await readFile(SET, "utf8")) as SetFile;
  const stored = JSON.parse(await readFile(RESULTS, "utf8").catch(() => '{"version":1,"model":"","rows":[],"knownSpend":0,"unpriced":0}')) as { version: 1; model: string; rows: PageGateCaseRow[]; knownSpend: number; unpriced: number };
  const have = new Set(stored.rows.map((r) => r.id));
  const missing = set.cases.filter((c) => !have.has(c.id));
  // (An image is about 1,600 tokens at the model's scale; the cost bound below holds whatever it is.)
  const estimate = missing.length * 2500 * decisionModelTerms(MODEL).promptUsdPerM / 1e6;
  console.log(JSON.stringify({ requests: missing.length, estimateUsd: estimate }));
  if (o.estimate) return;
  let results = stored;
  if (!o.fromResults && missing.length) {
    if (estimate > o.max) throw new Error("estimate exceeds cap");
    const client = decisionClient(process.env, MODEL, { maxRetries: 0 });
    if (!client) throw new Error("DECISIONS_OPENROUTER_API_KEY is required");
    const rows: PageGateCaseRow[] = [];
    let exposure = 0, knownSpend = 0, unpriced = 0;
    const failures: string[] = [];
    for (const c of missing) {
      const bound = attemptCostBound(MODEL);
      if (exposure + bound > o.max) { failures.push(`${c.id}: cap`); continue; }
      exposure += bound;
      try {
        const { probabilities, result } = await pageGateProbabilities(client, new Uint8Array(await readFile(c.image)), AbortSignal.timeout(60_000));
        if (result.costKnown && result.usd !== null) { exposure -= bound - result.usd; knownSpend += result.usd; } else unpriced += 1;
        rows.push({ id: c.id, probabilities: probabilities as Record<PageGate, number> });
      } catch (e) {
        if (e instanceof DecisionError && e.costKnown && e.usd !== null) { exposure -= bound - e.usd; knownSpend += e.usd; } else unpriced += 1;
        failures.push(`${c.id}: ${e instanceof DecisionError ? e.kind : "invalid answer"}`);
      }
    }
    if (failures.length) throw new Error(`${failures.length} requests failed (${failures.slice(0, 5).join("; ")}); nothing was stored. Spent about USD ${knownSpend.toFixed(6)}.`);
    results = { version: 1, model: MODEL, rows: [...stored.rows, ...rows], knownSpend: stored.knownSpend + knownSpend, unpriced: stored.unpriced + unpriced };
    await writeFile(RESULTS, JSON.stringify(results, null, 2) + "\n");
  }
  const lines = PAGE_GATES.map((gate) => {
    const folds = evaluatePageGateFolds(set.cases, results.rows, gate);
    const cell = (f: (typeof folds)[number]) => f.threshold === null ? "no threshold" : `${f.caught}/${f.changed}, ${f.falseFlags}/${f.unchanged}, ${f.threshold.toFixed(2)}`;
    return `| ${MODEL} | ${gate} | ${cell(folds[0])} | ${cell(folds[1])} | ${folds.every((f) => f.passed) ? "on" : "off"} |`;
  });
  const unchanged = set.cases.filter((c) => c.gate === null).length;
  await writeFile(REPORT, `# Page layout gate set\n\nThe set has ${unchanged} unchanged pages (every page with an answer box of the fake U4 and U16 sample books, days 1, 5 and 10, printed by the real templates) and ${set.cases.length - unchanged} changed copies, ${COPIES} per gate, each printed with CSS that causes its fault on that page in one of two ways (\`scripts/workbook-page-gate-set-cli.ts\`, FAULTS). The copies are synthetic: a real fault may look different.\n\nPages alternate between two halves in source order; a copy stays in its source page's half. Each fold fits a threshold on one half and measures it on the other. A gate may be turned on only when both folds catch at least 90% of its changed pages with at most 5% false flags on unchanged pages. Each cell is caught, false flags and the threshold fitted on the other half.\n\n| Model | Gate | Fold A | Fold B | State |\n|---|---|---|---|---|\n${lines.join("\n")}\n\nThe model runs cost USD ${results.knownSpend.toFixed(6)} with ${results.unpriced} unpriced attempts.\n`);
  console.log(lines.join("\n"));
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { drafts: { type: "string" }, estimate: { type: "boolean" }, "from-results": { type: "boolean" }, "max-usd": { type: "string", default: "0.5" } } });
const max = Number(values["max-usd"]);
if (!Number.isFinite(max) || max <= 0 || max > 0.5) throw new Error("--max-usd must be greater than 0 and no more than 0.5");
// (The print engine's browser can keep the process alive after the last print: end it when the work is done.)
if (positionals[0] === "make") { await make((values.drafts ?? "").split(",").filter(Boolean)); process.exit(0); }
else if (positionals[0] === "run") await run({ estimate: !!values.estimate, fromResults: !!values["from-results"], max });
else throw new Error("usage: make --drafts <U4-draft.json,U16-draft.json> | run [--estimate] [--from-results] [--max-usd 0.5]");

// Sample workbooks for every level (#363), for Savar's review. Nothing here is sent to print or shipped.
//
// 1. The test family: one parent ("Workbook samples", workbook-samples@unicalearning.com), marked as a test family
//    (public.test_accounts, D-099), with one child per level, each with a made-up profile
//    (src/lib/workbook-sample-profiles.ts). Idempotent: a second run finds the family and its children (each child's
//    learning note names its level) and adds only what is missing. It refuses to touch a family that is not marked as
//    a test.
// 2. For each level asked: a full 10-day workbook drafted through the real generator (#311, src/lib/workbook-generator.ts)
//    with the real templates' strict fit check (#310), stored in public.workbook_drafts; then the whole book printed
//    with Chromium: the strict render when every page passes, else the review print with each failing page's failure
//    drawn on it. The PDF and the page images go to the private bucket workbook-pages at <parent>/<draft id>/ (inside
//    the family's folder: the family deletion and the retention worker empty it) and to the review folder.
//    --second U5,U12 also makes workbook 2 (Fix it) for those levels; --test U12 makes the level's test workbook.
// 3. The review folder (default /tmp/ui-review/samples): each book's PDF, a contact sheet PNG (the first 8 pages and the
//    key pages, failures first) and index.md with every count and the AI cost.
//
// Usage: npm run workbooks:samples -- [--levels U1,U2,...|all] [--second U5,U12] [--test U12] [--out <folder>]
//          [--concurrency 6] [--fake] [--no-store] [--family-only]
// --family-only makes (or finds) the test family and its children, prints them, and stops: no AI, no books.
// The AI: OPENROUTER_API_KEY (or OPENROUTER_API_KEY_FILE) and AI_MODEL. --fake uses a fake AI for a dry run of the
// layout: its books are marked FAKE in index.md and are never stored. The secret key: SUPABASE_SECRET_KEY, else the
// Supabase Management API with SUPABASE_ACCESS_TOKEN or the Keychain item "supabase-pagewise". No key is printed.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { AI_DEFAULT_MODEL, type AiClient } from "@/lib/ai-client";
import { openRouterClient } from "@/lib/ai-openrouter";
import type { Database } from "@/lib/database";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { renderableDraft, renderFitCheck } from "@/lib/workbook-fit";
import { generateWorkbook, type GeneratedWorkbook, type WorkbookDraftStore } from "@/lib/workbook-generator";
import { planWorkbook } from "@/lib/workbook-plan";
import { renderWorkbook, reviewPrint, type PrintEngine, type RenderProblem } from "@/lib/workbook-render";
import { sampleChild, samplePlanInput, type SampleBookKind, type SampleChild } from "@/lib/workbook-sample-profiles";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const URL = `https://${PROJECT}.supabase.co`;
const FAMILY_EMAIL = "workbook-samples@unicalearning.com";
const NOTE = (level: string) => `Sample child for level ${level} (#363): made-up profile, never a real child.`;

const { values } = parseArgs({
  options: {
    levels: { type: "string", default: "all" }, second: { type: "string", default: "" }, test: { type: "string", default: "" },
    out: { type: "string", default: "/tmp/ui-review/samples" }, concurrency: { type: "string", default: "6" },
    fake: { type: "boolean", default: false }, "family-only": { type: "boolean", default: false }, "no-store": { type: "boolean", default: false },
  },
});
const BC = curriculumFor("bc")!;
const allLevels = BC.levels.map((l) => l.id);
const list = (s: string) => (s === "all" ? allLevels : s.split(",").map((x) => x.trim()).filter(Boolean));
const levels = list(values.levels!);
for (const l of [...levels, ...list(values.second!), ...list(values.test!)]) if (!allLevels.includes(l as never)) throw new Error(`no level ${l}`);
const store = !values["no-store"] && !values.fake;

// ---------- Keys ----------

async function secretKey(): Promise<string> {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`api keys: HTTP ${res.status}`);
  const keys = await res.json() as { name: string; type: string; api_key: string | null }[];
  const key = keys.find((k) => k.type === "legacy" && k.name === "service_role")?.api_key ?? keys.find((k) => k.type === "secret")?.api_key;
  if (!key) throw new Error("no secret key");
  return key;
}

async function openRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  if (process.env.OPENROUTER_API_KEY_FILE) return (await readFile(process.env.OPENROUTER_API_KEY_FILE, "utf8")).trim();
  return null;
}

// ---------- The AI, with its cost ----------

/** The cost of every AI call, in US dollars, by book: OpenRouter's usage.cost on each answer. */
const costs = new Map<string, { usd: number; calls: number; failed: number; inTokens: number; outTokens: number }>();
let costKey = "";

function costingFetch(): typeof fetch {
  return async (input, init) => {
    const key = costKey;
    const res = await fetch(input, { ...init, body: typeof init?.body === "string" ? JSON.stringify({ ...JSON.parse(init.body), usage: { include: true } }) : init?.body });
    const text = await res.clone().text().catch(() => "");
    const c = costs.get(key) ?? { usd: 0, calls: 0, failed: 0, inTokens: 0, outTokens: 0 };
    c.calls++;
    try {
      const u = (JSON.parse(text) as { usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } }).usage;
      c.usd += u?.cost ?? 0;
      c.inTokens += u?.prompt_tokens ?? 0;
      c.outTokens += u?.completion_tokens ?? 0;
    } catch {
      c.failed++;
    }
    if (!res.ok) c.failed++;
    costs.set(key, c);
    return res;
  };
}

/**
 * A fake AI for a layout dry run: every slot gets a sum in the format its place takes. A Spot the error slot takes the
 * offered mistakes in turn, with a sum that mistake fits and Sam's answer exactly what it makes. Every number keeps to the
 * slot's range (its numbers.max) and is written in digits, never as words, as the real AI is asked to.
 */
function fakeAi(): AiClient {
  let n = 0;
  let m = 0;
  const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
  const op = (kind: "add" | "subtract", a: number, b: number) => ({ kind, operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });
  const SAM: Record<string, { kind: "add" | "subtract"; a: number; b: number; wrong: number; step: string | null }> = {
    "forgot-carry": { kind: "add", a: 48, b: 37, wrong: 75, step: "tens" },
    "smaller-from-larger": { kind: "subtract", a: 52, b: 17, wrong: 45, step: "ones" },
    "regroup-not-taken": { kind: "subtract", a: 62, b: 28, wrong: 44, step: "tens" },
    "counted-one-extra": { kind: "add", a: 2, b: 2, wrong: 5, step: null },
    "counted-one-short": { kind: "add", a: 3, b: 2, wrong: 4, step: null },
    "wrong-start": { kind: "add", a: 3, b: 2, wrong: 4, step: null },
    "wrong-operation": { kind: "add", a: 3, b: 2, wrong: 1, step: null },
    "swapped-digits": { kind: "add", a: 7, b: 5, wrong: 21, step: null },
  };
  return {
    model: "fake",
    async json(request) {
      const body = JSON.parse((request.content[0] as { text: string }).text) as { slots: { slot: string; skills: string[]; formats?: string[] | null; mistakes?: { name: string }[]; numbers?: Record<string, { max: number }> }[] };
      return {
        items: body.slots.map((s) => {
          const format = s.formats?.[0] ?? "write-number";
          const base = { slot: s.slot, skill: s.skills[0], difficulty: 2, format, numbers: [], places: null, direction: null, sequence: null, pattern: null, figure: null };
          if (format === "spot-the-error" && s.mistakes?.length) {
            const name = s.mistakes[m++ % s.mistakes.length].name;
            const x = SAM[name];
            const sign = x.kind === "add" ? "+" : "-";
            // The slot's skill with the widest range, so Sam's sum fits it.
            const skill = [...s.skills].sort((p, q) => (s.numbers?.[q]?.max ?? 0) - (s.numbers?.[p]?.max ?? 0))[0];
            return {
              ...base, skill, text: `${x.a} ${sign} ${x.b} = ?`, operation: op(x.kind, x.a, x.b),
              wrongAnswers: [{ value: num(x.wrong), cause: name, description: `Sam's mistake: ${name}`, step: x.step }],
              easier: { text: x.kind === "add" ? "1 + 1 = ?" : "5 - 2 = ?", operation: x.kind === "add" ? op("add", 1, 1) : op("subtract", 5, 2) }, shownWrong: 0,
            };
          }
          // a + b stays within the range of the item's skill: to 10 at U1, so 2 + 2 to 7 + 2; numbers stay below 100
          // so a page of them fits as the real AI's would. The easier example 1 + 1 is smaller.
          const max = Math.min(100, s.numbers?.[s.skills[0]]?.max ?? 100);
          const b = max >= 20 ? Math.floor(max * 0.15) : 2;
          const a = 2 + (n++ % (max - b - 2));
          const reason = format === "written-reason";
          return {
            ...base, text: reason ? "How do you know your answer is right?" : format === "show-work" ? `Ava has ${a} beads. She gets ${b} more. How many beads now?` : `${a} + ${b} =`,
            operation: reason ? null : op("add", a, b),
            wrongAnswers: reason ? [] : [{ value: num(a + b + 1), cause: "careless", description: "Counts 1 too many", step: null }],
            easier: reason ? null : { text: "1 + 1 = ?", operation: op("add", 1, 1) }, shownWrong: null,
          };
        }),
      };
    },
  };
}

// ---------- The test family ----------

interface Family {
  parentId: string;
  children: Map<string, { id: string; child: SampleChild }>;
}

async function testFamily(db: SupabaseClient<Database>): Promise<Family> {
  let { data: parent } = await db.from("parents").select("id").eq("email", FAMILY_EMAIL).maybeSingle();
  if (!parent) {
    const created = await db.auth.admin.createUser({ email: FAMILY_EMAIL, email_confirm: true, password: randomBytes(24).toString("base64url") });
    if (created.error) throw new Error(`test family user: ${created.error.message}`);
    const first = sampleChild(BC, "U1")!;
    const { data, error } = await db.rpc("create_family", {
      p_parent: created.data.user.id, p_name: "Workbook samples", p_email: FAMILY_EMAIL, p_postal: null, p_source: { test: "workbook-samples-363" },
      p_child_name: first.name, p_child_grade: first.grade, p_child_province: "BC",
    });
    if (error || (data as { status?: string }).status !== "created") throw new Error(`test family: ${error?.message ?? JSON.stringify(data)}`);
    const child = (data as { child: string }).child;
    await must(db.from("children").update({ learning_note: NOTE("U1") }).eq("id", child), "first child note");
    parent = { id: created.data.user.id };
  }
  // On every run: only the family this script made (its source says so) is used; any other family is refused, even
  // one already marked as a test.
  const { data: p, error: sourceError } = await db.from("parents").select("source").eq("id", parent.id).single();
  if (sourceError) throw new Error(`test family source: ${sourceError.message}`);
  if ((p?.source as { test?: string } | null)?.test !== "workbook-samples-363") throw new Error("the family with this email is not the sample family: refused");
  const { data: marked } = await db.from("test_accounts").select("parent_id").eq("parent_id", parent.id).maybeSingle();
  if (!marked) {
    const { data: admin } = await db.from("admin_users" as never).select("user_id").limit(1).maybeSingle();
    const by = (admin as { user_id: string } | null)?.user_id;
    if (!by) throw new Error("no admin user to mark the test family");
    await must(db.from("test_accounts").insert({ parent_id: parent.id, marked_by: by }), "mark test family");
  }
  const { data: kids, error } = await db.from("children").select("id, first_name, learning_note").eq("parent_id", parent.id);
  if (error) throw new Error(`children: ${error.message}`);
  const children = new Map<string, { id: string; child: SampleChild }>();
  for (const level of allLevels) {
    const child = sampleChild(BC, level)!;
    const kid = kids.find((k) => k.learning_note === NOTE(level));
    let id = kid?.id;
    // A renamed profile renames the test child (only this family's children are read above).
    if (kid && kid.first_name !== child.name) await must(db.from("children").update({ first_name: child.name }).eq("id", kid.id).eq("parent_id", parent.id), `rename child ${level}`);
    if (!id) {
      const { data, error: e } = await db.from("children").insert({ parent_id: parent.id, first_name: child.name, grade: child.grade, province: "BC", learning_note: NOTE(level) }).select("id").single();
      if (e) throw new Error(`child ${level}: ${e.message}`);
      id = data.id;
    }
    children.set(level, { id, child });
  }
  return { parentId: parent.id, children };
}

async function must(q: PromiseLike<{ error: { message: string } | null }>, what: string) {
  const { error } = await q;
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------- One book ----------

interface BookResult {
  label: string;
  level: string;
  kind: SampleBookKind;
  child: SampleChild;
  draftId: string;
  stored: boolean;
  pdf: string;
  sheet: string;
  draft: GeneratedWorkbook;
  renderProblems: RenderProblem[];
  omissions: number;
  usd: number;
  calls: number;
  minutes: number;
  error?: string;
}

const out = values.out!;
await mkdir(out, { recursive: true });
const template = workbookTemplate(await fixedTemplateFonts());
// Chromium can fail to start when several start at once: each print gets up to 3 tries, so one failed launch does not
// lose a whole book.
const chromium = chromiumPrintEngine();
const engine: PrintEngine = {
  async print(job) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await chromium.print(job);
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  },
};

async function contactSheet(images: Uint8Array[], draft: GeneratedWorkbook, problems: RenderProblem[], file: string) {
  // The first 8 pages, then failing pages (up to 4), then one of each key day page type not yet shown.
  const pick: number[] = [];
  const add = (n: number) => { if (n >= 1 && n <= images.length && !pick.includes(n) && pick.length < 16) pick.push(n); };
  for (let n = 1; n <= 8; n++) add(n);
  [...new Set([...problems.map((p) => p.page), ...draft.pages.filter((p) => p.fit.status === "failed").map((p) => p.number)])].slice(0, 4).forEach(add);
  for (const type of ["new-idea", "practice", "practice-2", "word-problems", "unit-b", "math-in-the-world", "friday-5", "challenge", "level-test", "show-what-you-know"]) {
    const p = draft.pages.find((x) => x.type === type);
    if (p) add(p.number);
  }
  const W = 340;
  const H = Math.round(W * 1056 / 816);
  const cols = 4;
  const rows = Math.ceil(pick.length / cols);
  const tiles = await Promise.all(pick.map(async (n, i) => {
    const bad = problems.some((p) => p.page === n) || draft.pages[n - 1]?.fit.status === "failed";
    const img = await sharp(images[n - 1]).resize(W, H).toBuffer();
    const label = Buffer.from(`<svg width="${W}" height="26"><rect width="${W}" height="26" fill="${bad ? "#B42318" : "#0C0C0E"}"/><text x="8" y="18" font-family="Helvetica" font-size="14" fill="#fff">p${n} · ${draft.pages[n - 1]?.type ?? ""}${bad ? " · FAILED" : ""}</text></svg>`);
    return [
      { input: img, left: (i % cols) * (W + 16) + 16, top: Math.floor(i / cols) * (H + 42) + 42 },
      { input: label, left: (i % cols) * (W + 16) + 16, top: Math.floor(i / cols) * (H + 42) + 16 },
    ];
  }));
  await sharp({ create: { width: cols * (W + 16) + 16, height: rows * (H + 42) + 16, channels: 3, background: "#E9E7E1" } })
    .composite(tiles.flat()).png().toFile(file);
}

async function oneBook(db: SupabaseClient<Database> | null, family: Family | null, level: string, kind: SampleBookKind, ai: AiClient, drafts: WorkbookDraftStore | null): Promise<BookResult> {
  const child = family?.children.get(level)?.child ?? sampleChild(BC, level)!;
  const childId = family?.children.get(level)?.id ?? randomUUID();
  const parentId = family?.parentId ?? randomUUID();
  const label = `${level}${kind === "first" ? "" : kind === "second" ? "-workbook-2" : "-test-workbook"}`;
  const input = samplePlanInput(BC, child, kind);
  const planned = planWorkbook(input);
  if (!planned.ok) throw new Error(`${label}: plan refused: ${planned.reason}`);
  const workbookId = randomUUID();
  costKey = label;
  const t0 = Date.now();
  const result = await generateWorkbook(
    { workbookId, childId, number: input.workbook.number, profileBuild: null, plan: planned.plan, curriculum: BC, book: { child: child.name } },
    {
      ai, fit: renderFitCheck({ template, engine, parentId }), concurrency: Number(values.concurrency),
      store: drafts ?? { save: async () => ({ status: "saved", draftId: workbookId }), draft: async () => null },
      qrToken: () => randomBytes(16).toString("base64url"), timeLimitMs: 240_000,
      progress: (done, total) => { if (done % 10 === 0 || done === total) console.log(`  ${label}: ${done}/${total} day pages`); },
    },
  );
  if (result.status !== "stored") throw new Error(`${label}: ${result.reason}`);
  const draft = result.draft;
  const renderable = renderableDraft(draft);
  const fileKey = randomBytes(6).toString("base64url");
  const strict = await renderWorkbook({ draft: renderable, parentId, template, engine, fileKey });
  // Every failure shows on its page: the render's, each failed question's (one with no package also has a placeholder
  // in its slot) and each page the fit check failed. The strict PDF is used only when there is none.
  const problems: RenderProblem[] = [
    ...(strict.status === "failed" ? strict.problems : []),
    ...draft.pages.flatMap((p) => p.questions.flatMap((q) => (q.check.status === "failed"
      ? [{ page: p.number, question: q.package ? q.number : null, reason: `question ${q.number} failed: ${q.check.reason}` }] : []))),
    ...draft.pages.flatMap((p) => (p.fit.status === "failed" ? p.fit.problems.map((x) => ({ page: p.number, question: x.question, reason: `fit check: ${x.reason}` })) : [])),
  ];
  const printed = strict.status === "rendered" && problems.length === 0
    ? { pdf: strict.files[0].bytes, images: strict.files.slice(1).map((f) => f.bytes) }
    : await reviewPrint({ draft: renderable, template, engine, problems });
  const pdf = `${out}/${label}.pdf`;
  const sheet = `${out}/${label}-contact.png`;
  await writeFile(pdf, printed.pdf);
  await mkdir(`${out}/pages/${label}`, { recursive: true });
  await Promise.all(printed.images.map((png, i) => writeFile(`${out}/pages/${label}/p${String(i + 1).padStart(2, "0")}.png`, png)));
  await contactSheet(printed.images, draft, problems, sheet);
  if (db && drafts) {
    const files = workbookFiles(db);
    const folder = `${parentId}/${workbookId}`;
    await files.put({ path: `${folder}/review-${fileKey}.pdf`, contentType: "application/pdf", bytes: printed.pdf });
    for (const [i, png] of printed.images.entries()) await files.put({ path: `${folder}/review-${fileKey}-page-${i + 1}.png`, contentType: "image/png", bytes: png });
  }
  const c = costs.get(label);
  return {
    label, level, kind, child, draftId: workbookId, stored: !!drafts, pdf, sheet, draft, renderProblems: strict.status === "failed" ? strict.problems : [],
    omissions: draft.pages.reduce((n, p) => n + (p.omissions?.length ?? 0), 0), usd: c?.usd ?? 0, calls: c?.calls ?? 0, minutes: (Date.now() - t0) / 60000,
  };
}

// ---------- Run ----------

if (values["family-only"]) {
  const db0 = createClient<Database>(URL, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const f = await testFamily(db0);
  console.log(`test family ${f.parentId} (marked as a test family)`);
  for (const [level, c] of f.children) console.log(`  ${level} ${c.child.name} ${c.id}: unit A ${c.child.mainUnit}, Unit B gap ${c.child.unitB ?? "none"}, weak ${c.child.weakSkills.join(", ")}`);
  process.exit(0);
}

let ai: AiClient;
if (values.fake) ai = fakeAi();
else {
  const key = await openRouterKey();
  if (!key) throw new Error("no OpenRouter key: set OPENROUTER_API_KEY or OPENROUTER_API_KEY_FILE (or pass --fake for a layout dry run)");
  ai = openRouterClient({ apiKey: key, model: process.env.AI_MODEL || AI_DEFAULT_MODEL, fetch: costingFetch(), timeout: 200_000 });
}
const db = store ? createClient<Database>(URL, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const family = db ? await testFamily(db) : null;
if (family) console.log(`test family ${family.parentId}: ${family.children.size} children`);
const drafts = db ? workbookDraftStore(db) : null;

const jobs: { level: string; kind: SampleBookKind }[] = [
  ...levels.map((level) => ({ level, kind: "first" as const })),
  ...list(values.second!).map((level) => ({ level, kind: "second" as const })),
  ...list(values.test!).map((level) => ({ level, kind: "test" as const })),
];
const results: BookResult[] = [];
// Books run one at a time (their day pages run --concurrency at once), so each AI call's cost counts to its book.
for (const job of jobs) {
  console.log(`${job.level} ${job.kind}: drafting`);
  try {
    const r = await oneBook(db, family, job.level, job.kind, ai, drafts);
    results.push(r);
    console.log(`  ${r.label}: ${r.draft.counts.pages} pages, ${r.draft.counts.questions} questions, ${r.draft.counts.failed} failed, ${r.draft.counts.failedPages} pages do not fit, ${r.renderProblems.length} render problems (strict), USD ${r.usd.toFixed(2)}, ${r.minutes.toFixed(1)} min`);
  } catch (e) {
    console.error(`  ${job.level} ${job.kind}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    results.push({ label: `${job.level}-${job.kind}`, level: job.level, kind: job.kind, error: e instanceof Error ? e.message : String(e) } as BookResult);
  }
  await writeIndex();
}

async function writeIndex() {
  const ok = results.filter((r) => !r.error);
  const total = ok.reduce((n, r) => n + r.usd, 0);
  const rows = results.map((r) => r.error
    ? `| ${r.label} | | | | | | | | ERROR: ${r.error.replace(/\|/g, "/")} |`
    : `| [${r.label}](${r.label}.pdf) | ${r.child.name} | ${r.draft.counts.pages} | ${r.draft.counts.questions} | ${r.draft.counts.failed} | ${new Set([...r.renderProblems.map((p) => p.page), ...r.draft.pages.filter((p) => p.fit.status === "failed").map((p) => p.number)]).size} | ${r.draft.counts.notChecked} | ${values.fake ? "FAKE AI" : `USD ${r.usd.toFixed(2)}`} | [sheet](${r.label}-contact.png) |`);
  const failures = ok.flatMap((r) => [
    ...r.draft.pages.flatMap((p) => p.questions.filter((q) => q.check.status === "failed").map((q) => `- ${r.label} p${p.number} q${q.number} (${q.place ?? q.part}): ${(q.check as { reason: string }).reason}`)),
    ...r.renderProblems.map((p) => `- ${r.label} p${p.page}${p.question ? ` q${p.question}` : ""}${p.slot ? ` [${p.slot}]` : ""}: ${p.reason}`),
  ]);
  const notChecked = ok.flatMap((r) => r.draft.pages.flatMap((p) => p.questions.filter((q) => q.check.status === "not-checked").map((q) => `- ${r.label} p${p.number} q${q.number}: ${(q.check as { reason: string }).reason}`)));
  const profiles = ok.filter((r) => r.kind === "first").map((r) => `- ${r.level} ${r.child.name}: unit A ${r.child.mainUnit}, Unit B gap ${r.child.unitB ?? "none"}, weak skills ${r.child.weakSkills.join(", ")}`);
  const md = [
    `# Sample workbooks (#363)${values.fake ? " - FAKE AI DRY RUN, NOT SAMPLES" : ""}`,
    "",
    `Model: ${ai.model}. Books: ${ok.length}. Total AI cost: USD ${total.toFixed(2)}. Draft rows: public.workbook_drafts${store ? "" : " (not stored)"}.`,
    "Nothing is sent to print or shipped. Failed pages are drawn with a red banner in the PDF and the page images.",
    "",
    "| Book | Child | Pages | Questions | Failed questions | Failed pages | Not checked by code | AI cost | Contact sheet |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Profiles (made up)",
    ...profiles,
    "",
    `## Failures (${failures.length})`,
    ...failures,
    "",
    `## Not checked by code (${notChecked.length})`,
    ...notChecked.slice(0, 400),
    notChecked.length > 400 ? `- ... and ${notChecked.length - 400} more` : "",
    "",
    "## Draft ids",
    ...ok.map((r) => `- ${r.label}: ${r.draftId}${r.stored ? "" : " (not stored)"}`),
  ].join("\n");
  await writeFile(`${out}/index.md`, md);
}
console.log(`done: ${results.filter((r) => !r.error).length} books, USD ${results.reduce((n, r) => n + (r.usd ?? 0), 0).toFixed(2)}; ${out}/index.md`);

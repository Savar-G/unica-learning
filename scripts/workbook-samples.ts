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
//          [--concurrency 6] [--fake] [--api] [--anthropic] [--no-store] [--family-only]
// --family-only makes (or finds) the test family and its children, prints them, and stops: no AI, no books.
// The AI (D-200): by default Savar's Claude subscription through `claude -p` (src/lib/workbook-ai.ts: WORKBOOK_CLAUDE_MODEL,
// WORKBOOK_CLAUDE_SOLVE_MODEL, WORKBOOK_CLAUDE_CONFIG_DIR), with the API (OpenRouter: OPENROUTER_API_KEY or
// OPENROUTER_API_KEY_FILE, AI_MODEL) as the fallback when the subscription cannot take a call; with no OpenRouter key
// there is no fallback. WORKBOOK_AI_PRIMARY=api puts the API first. index.md counts the calls on each. --api uses the
// API (OpenRouter) only, as before D-200. --anthropic uses the Claude API directly
// (src/lib/ai-anthropic.ts) with ANTHROPIC_API_KEY, ANTHROPIC_API_KEY_FILE or the Keychain item "anthropic-unica-tools"
// (the key on Savar's Max plan API credits), and ANTHROPIC_MODEL (default claude-sonnet-5-5). The solve check (round 7) reads
// each printed question the AI wrote and answers it, through the same provider: AI_SOLVE_MODEL on OpenRouter (default
// anthropic/claude-haiku-5.5), ANTHROPIC_SOLVE_MODEL with --anthropic (default claude-haiku-5-5); each check is logged to
// <label>-solve.jsonl and costed apart. With --fake the solve check answers from the key (free). --fake uses a fake AI for a dry run of the
// layout: its books are marked FAKE in index.md and are never stored. The secret key: SUPABASE_SECRET_KEY, else the
// Supabase Management API with SUPABASE_ACCESS_TOKEN or the Keychain item "supabase-pagewise". No key is printed.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, type AiClient } from "@/lib/ai-client";
import type { AiCallRecord } from "@/lib/ai-fallback";
import { workbookAi, workbookAiPrimary, type AiCallKind } from "@/lib/workbook-ai";
import { ANTHROPIC_DEFAULT_MODEL, anthropicClient, type AnthropicUsage } from "@/lib/ai-anthropic";
import { openRouterClient } from "@/lib/ai-openrouter";
import type { Database } from "@/lib/database";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { renderableDraft, renderFitCheck } from "@/lib/workbook-fit";
import { generateWorkbook, type GeneratedWorkbook, type WorkbookDraftStore } from "@/lib/workbook-generator";
import { measuredPageUse, workbookQuality, type PageUse } from "@/lib/workbook-quality";
import { reviewDays } from "@/lib/workbook-review-days";
import { planWorkbook } from "@/lib/workbook-plan";
import { renderWorkbook, reviewPrint, type PrintEngine, type RenderProblem, type MeasuredElement } from "@/lib/workbook-render";
import { sampleChild, samplePlanInput, type SampleBookKind, type SampleChild } from "@/lib/workbook-sample-profiles";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { aiSolver, keySolver, type SolveLog, type Solver } from "@/lib/workbook-solve-check";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { workbookBuilderCoverage } from "@/lib/workbook-builder-coverage";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const URL = `https://${PROJECT}.supabase.co`;
const FAMILY_EMAIL = "workbook-samples@unicalearning.com";
const NOTE = (level: string) => `Sample child for level ${level} (#363): made-up profile, never a real child.`;

const { values } = parseArgs({
  options: {
    levels: { type: "string", default: "all" }, second: { type: "string", default: "" }, test: { type: "string", default: "" },
    days: { type: "string" }, out: { type: "string", default: "/tmp/ui-review/samples" }, concurrency: { type: "string", default: "6" },
    fake: { type: "boolean", default: false }, api: { type: "boolean", default: false }, anthropic: { type: "boolean", default: false }, "family-only": { type: "boolean", default: false }, "no-store": { type: "boolean", default: false }, "subscription-only": { type: "boolean", default: false },
  },
});
if (values.days && (values.second || values.test)) throw new Error("--days is only for first review books.");
const BC = curriculumFor("bc")!;
const allLevels = BC.levels.map((l) => l.id);
const list = (s: string) => (s === "all" ? allLevels : s.split(",").map((x) => x.trim()).filter(Boolean));
const levels = list(values.levels!);
for (const l of [...levels, ...list(values.second!), ...list(values.test!)]) if (!allLevels.includes(l as never)) throw new Error(`no level ${l}`);
const store = !values["no-store"] && !values.fake;
if (values["subscription-only"] && (values.api || values.anthropic)) throw new Error("--subscription-only cannot use an API provider");

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

async function anthropicKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  if (process.env.ANTHROPIC_API_KEY_FILE) return (await readFile(process.env.ANTHROPIC_API_KEY_FILE, "utf8")).trim();
  try {
    return execFileSync("security", ["find-generic-password", "-s", "anthropic-unica-tools", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

// ---------- The AI, with its cost ----------

/** Claude API prices in US dollars per million tokens (platform.claude.com pricing, read 2026-10-31). */
const ANTHROPIC_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Adds one Claude API answer to the book's cost. A model with no price (a fallback model) is counted at Opus prices. */
function countAnthropic(u: AnthropicUsage, into = costs) {
  const p = ANTHROPIC_PRICES[u.model] ?? ANTHROPIC_PRICES["claude-opus-5-5"];
  const c = into.get(costKey) ?? { usd: 0, calls: 0, failed: 0, inTokens: 0, outTokens: 0 };
  c.calls++;
  c.usd += (u.inputTokens * p.input + u.cacheWriteTokens * p.input * 1.25 + u.cacheReadTokens * p.cacheRead + u.outputTokens * p.output) / 1e6;
  c.inTokens += u.inputTokens + u.cacheWriteTokens + u.cacheReadTokens;
  c.outTokens += u.outputTokens;
  into.set(costKey, c);
}

/** The cost of every AI call, in US dollars, by book: OpenRouter's usage.cost on each answer. */
const costs = new Map<string, { usd: number; calls: number; failed: number; inTokens: number; outTokens: number }>();
/** The solve checks' cost (round 7), by book, apart from the generator's. */
const solveCosts: typeof costs = new Map();
let costKey = "";

/** The AI calls by provider (D-200), by book: calls that reached each provider, and calls one could not take. */
const providerCounts = new Map<string, { subscription: number; api: number; unavailable: number; lastUnavailable: string | null }>();

/** Counts one call of the subscription-first client into the book's cost and its provider counts. */
function countCall(kind: AiCallKind, r: AiCallRecord) {
  const p = providerCounts.get(costKey) ?? { subscription: 0, api: 0, unavailable: 0, lastUnavailable: null };
  if (r.outcome === "unavailable") {
    p.unavailable++;
    p.lastUnavailable = `${r.provider}: ${r.note ?? ""}`;
  } else {
    p[r.provider] += r.requests ?? 1;
    const into = kind === "solve" ? solveCosts : costs;
    const c = into.get(costKey) ?? { usd: 0, calls: 0, failed: 0, inTokens: 0, outTokens: 0 };
    c.calls += r.requests ?? 1;
    c.usd += r.usd ?? 0;
    if (r.outcome === "failed") c.failed++;
    into.set(costKey, c);
  }
  providerCounts.set(costKey, p);
}

/** One book's calls by provider, as one line. */
const providerLine = (label: string) => {
  const p = providerCounts.get(label);
  if (!p) return "no subscription-first calls";
  return `${p.subscription} calls on the Claude subscription, ${p.api} on the API${p.unavailable ? `, ${p.unavailable} the subscription or the API could not take (last: ${p.lastUnavailable})` : ""}`;
};

function costingFetch(into = costs): typeof fetch {
  return async (input, init) => {
    const key = costKey;
    const res = await fetch(input, { ...init, body: typeof init?.body === "string" ? JSON.stringify({ ...JSON.parse(init.body), usage: { include: true } }) : init?.body });
    const text = await res.clone().text().catch(() => "");
    const c = into.get(key) ?? { usd: 0, calls: 0, failed: 0, inTokens: 0, outTokens: 0 };
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
    into.set(key, c);
    return res;
  };
}

/**
 * A fake AI for a layout dry run: every slot gets a sum in the format its place takes. A Spot the error slot takes the
 * offered mistakes in turn, with a sum that mistake fits and Sam's answer exactly what it makes. Every number keeps to the
 * slot's range (its numbers.max) and is written in digits, never as words, as the real AI is asked to.
 */
function fakeAi(): AiClient {
  return fakeAiClient({ model: "fake", answer: fakeWorkbookItems });
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
  /** The solve checks (round 7): how many, how many did not agree with the key (or failed), and their cost. */
  solve: { checks: number; disagreed: number; failed: number; usd: number };
  calls: number;
  minutes: number;
  pageUse: PageUse[];
  error?: string;
}

const out = values.out!;
await mkdir(out, { recursive: true });
const template = workbookTemplate(await fixedTemplateFonts());
// Chromium can fail to start when several start at once: each print gets up to 3 tries, so one failed launch does not
// lose a whole book.
const chromium = chromiumPrintEngine();
let lastMeasured: MeasuredElement[] = [];
const engine: PrintEngine = {
  async print(job) {
    for (let attempt = 1; ; attempt++) {
      try {
        const printed = await chromium.print(job);
        lastMeasured = printed.measured;
        return printed;
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
  // WORKBOOK_SAMPLE_ID repeats a reviewed book's seed (its template fills), e.g. the full U16 regression.
  const workbookId = process.env.WORKBOOK_SAMPLE_ID ?? randomUUID();
  costKey = label;
  const t0 = Date.now();
  const solveLogs: SolveLog[] = [];
  let layoutToken=0;
  const result = await generateWorkbook(
    { workbookId, childId, number: input.workbook.number, profileBuild: null, plan: reviewDays(planned.plan, values.days), curriculum: BC, book: { child: child.name }, itemPolicy: "approved-v1" },
    {
      ai, fit: renderFitCheck({ template, engine, parentId, fullness: true }), concurrency: Number(values.concurrency),
      store: drafts ?? { save: async () => ({ status: "saved", draftId: workbookId }), draft: async () => null },
      qrToken: () => values.fake && values["no-store"] ? `token-${String(++layoutToken).padStart(12,"0")}` : randomBytes(16).toString("base64url"), timeLimitMs: values.fake ? 900_000 : 240_000,
      progress: (done, total) => { if (done % 10 === 0 || done === total) console.log(`  ${label}: ${done}/${total} day pages`); },
      solver, solveTimeLimitMs: 60_000, now: () => Date.now(), onSolve: (log) => { solveLogs.push(log); },
    },
  );
  await writeFile(`${out}/${label}-solve.jsonl`, solveLogs.map((l) => `${JSON.stringify(l)}\n`).join(""));
  if (result.status !== "stored") throw new Error(`${label}: ${result.status === "refused" ? result.reason : "paused"}`);
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
  const pageUse = measuredPageUse(renderable.pages, lastMeasured).filter(p => draft.pages[p.page - 1]?.content?.kind === "day");
  await writeFile(`${out}/${label}-draft.json`, JSON.stringify(draft, null, 2));
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
  const sc = solveCosts.get(label);
  return {
    label, level, kind, child, pageUse, draftId: workbookId, stored: !!drafts, pdf, sheet, draft, renderProblems: strict.status === "failed" ? strict.problems : [],
    omissions: draft.pages.reduce((n, p) => n + (p.omissions?.length ?? 0), 0), usd: c?.usd ?? 0, calls: c?.calls ?? 0, minutes: (Date.now() - t0) / 60000,
    solve: {
      checks: solveLogs.length, disagreed: solveLogs.filter((l) => l.verdict.status === "disagreed").length,
      failed: solveLogs.filter((l) => l.verdict.status === "failed").length, usd: sc?.usd ?? 0,
    },
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
// The solve check goes through the same provider as the generator, on its cheapest model; the fake answers from the key.
let solver: Solver;
if (values.fake) {
  ai = fakeAi();
  solver = keySolver();
} else if (values.anthropic) {
  const key = await anthropicKey();
  if (!key) throw new Error("no Anthropic key: set ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_FILE, or add the Keychain item anthropic-unica-tools");
  ai = anthropicClient({ apiKey: key, model: process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL, timeout: 200_000, onUsage: (u) => countAnthropic(u) });
  solver = aiSolver(anthropicClient({
    apiKey: key, model: process.env.ANTHROPIC_SOLVE_MODEL || "claude-haiku-5-5", timeout: 60_000, fallbacks: false, onUsage: (u) => countAnthropic(u, solveCosts),
  }));
} else if (!values.api) {
  // D-200: the subscription first (WORKBOOK_AI_PRIMARY), the API as the fallback when there is a key.
  const key = values["subscription-only"] ? null : await openRouterKey();
  const live = workbookAi({ ...process.env, OPENROUTER_API_KEY: key ?? undefined, ...(values["subscription-only"] ? { WORKBOOK_AI_PRIMARY: "subscription" } : {}) }, { subscription: true, onCall: countCall });
  if (!live.ai || !live.solve) throw new Error("no AI: neither the Claude subscription nor an OpenRouter key");
  ai = live.ai;
  solver = live.solve.solver;
  console.log(`AI: ${workbookAiPrimary() === "api" ? "the API first, then the Claude subscription" : "the Claude subscription (claude -p) first"}${key ? ", with the API as the fallback" : "; no OpenRouter key, so no API fallback"}.`);
} else {
  const key = await openRouterKey();
  if (!key) throw new Error("no OpenRouter key: set OPENROUTER_API_KEY or OPENROUTER_API_KEY_FILE (or pass --fake for a layout dry run)");
  ai = openRouterClient({ apiKey: key, model: process.env.AI_MODEL || AI_DEFAULT_MODEL, fetch: costingFetch(), timeout: 200_000 });
  solver = aiSolver(openRouterClient({ apiKey: key, model: process.env.AI_SOLVE_MODEL || AI_SOLVE_DEFAULT_MODEL, fetch: costingFetch(solveCosts), timeout: 60_000 }));
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
    console.log(`  ${r.label}: ${r.draft.counts.pages} pages, ${r.draft.counts.questions} questions, ${r.draft.counts.failed} failed, ${r.draft.counts.failedPages} pages do not fit, ${r.draft.pages.reduce((n, p) => n + (p.leftOut?.length ?? 0), 0)} left out for room, ${r.renderProblems.length} render problems (strict), USD ${r.usd.toFixed(2)}, ${r.minutes.toFixed(1)} min`);
    console.log(`  ${r.label}: ${r.solve.checks} solve checks (${solver.model}), ${r.solve.disagreed} read another way, ${r.solve.failed} failed or late, USD ${r.solve.usd.toFixed(4)}; log ${out}/${r.label}-solve.jsonl`);
    if (providerCounts.has(r.label)) console.log(`  ${r.label}: ${providerLine(r.label)}`);
  } catch (e) {
    console.error(`  ${job.level} ${job.kind}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    results.push({ label: `${job.level}-${job.kind}`, level: job.level, kind: job.kind, error: e instanceof Error ? e.message : String(e) } as BookResult);
  }
  await writeIndex();
}

async function writeIndex() {
  const ok = results.filter((r) => !r.error);
  const total = ok.reduce((n, r) => n + r.usd + r.solve.usd, 0);
  const rows = results.map((r) => r.error
    ? `| ${r.label} | | | | | | | | | ERROR: ${r.error.replace(/\|/g, "/")} |`
    : `| [${r.label}](${r.label}.pdf) | ${r.child.name} | ${r.draft.counts.pages} | ${r.draft.counts.questions} | ${r.draft.counts.failed} | ${new Set([...r.renderProblems.map((p) => p.page), ...r.draft.pages.filter((p) => p.fit.status === "failed").map((p) => p.number)]).size} | ${r.draft.counts.notChecked} | ${r.draft.pages.reduce((n, p) => n + (p.leftOut?.length ?? 0), 0)} | ${values.fake ? "FAKE AI" : `USD ${r.usd.toFixed(2)}`} | [sheet](${r.label}-contact.png) |`);
  const failures = ok.flatMap((r) => [
    ...r.draft.pages.flatMap((p) => p.questions.filter((q) => q.check.status === "failed").map((q) => `- ${r.label} p${p.number} q${q.number} (${q.place ?? q.part}): ${(q.check as { reason: string }).reason}`)),
    ...r.renderProblems.map((p) => `- ${r.label} p${p.page}${p.question ? ` q${p.question}` : ""}${p.slot ? ` [${p.slot}]` : ""}: ${p.reason}`),
  ]);
  const leftOut = ok.flatMap((r) => r.draft.pages.flatMap((p) => (p.leftOut ?? []).map((x) => `- ${r.label} p${p.number} slot ${x.slot} (${x.part}): "${x.text ?? ""}" (${x.text?.length ?? 0} characters): ${x.reason}`)));
  const notChecked = ok.flatMap((r) => r.draft.pages.flatMap((p) => p.questions.filter((q) => q.check.status === "not-checked").map((q) => `- ${r.label} p${p.number} q${q.number}: ${(q.check as { reason: string }).reason}`)));
  const profiles = ok.filter((r) => r.kind === "first").map((r) => `- ${r.level} ${r.child.name}: unit A ${r.child.mainUnit}, Unit B gap ${r.child.unitB ?? "none"}, weak skills ${r.child.weakSkills.join(", ")}`);
  const md = [
    `# Sample workbooks (#363)${values.days ? `: review days ${values.days} only` : ""}${values.fake ? " - FAKE AI DRY RUN, NOT SAMPLES" : ""}`,
    "",
    `Model: ${ai.model}; solve check: ${solver.model}. Books: ${ok.length}. Total AI cost (solve checks included): USD ${total.toFixed(2)}. Draft rows: public.workbook_drafts${store ? "" : " (not stored)"}.`,
    "Nothing is sent to print or shipped. Failed pages are drawn with a red banner in the PDF and the page images.",
    "",
    "| Book | Child | Pages | Questions | Failed questions | Failed pages | Not checked by code | Left out after fit | AI cost | Contact sheet |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Builder coverage (#480, #489)",
    `Fully covered levels (level and fluency skills): ${workbookBuilderCoverage(BC).filter(c=>c.fullyCovered).map(c=>c.level).join(", ") || "none"}. A skill whose steps all have printable templates takes its questions from them; the warm-up's fluency facts and skills without printable templates use #482's builders or, with neither, the existing writer. Personal review skills are routed individually.`,
    "| Level | Step templates | Hand-built builders | Existing writer | Existing writer IDs |",
    "|---|---|---|---|---|",
    ...workbookBuilderCoverage(BC).map(c=>`| ${c.level} | ${c.templates.length} | ${c.approved.length} | ${c.existing.length} | ${c.existing.join(", ") || "none"} |`),
    "",
    "## Quality score (#480)",
    "The failure limit is below 5%. Time is an estimate from the actual items, reading and work space. Page fullness is the union of occupied vertical intervals, including writing space. Empty gaps are excluded. At the page maximum, bounded even spacing can pass with a lower occupied fraction. A score does not replace Savar's sample and example-bank approval.",
    "Step progression is the average curriculum step rank of each day's step template questions (#489): the last day must be above the first. Template coverage is the share of non-warm-up questions filled from their step's templates, then #482's hand-built builders and the existing writer.",
    "| Level | Failed | Dropped for room | Page fullness min / mean | Minutes per day | Step progression | Template coverage | AI calls | Technical checks | Ship gate |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...ok.map(r => {
      const q = r.draft.quality ?? workbookQuality(r.draft.pages);
      const uses = r.pageUse.flatMap(p => p.fraction === null ? [] : [p.fraction]);
      const fullness = uses.length ? `${(Math.min(...uses) * 100).toFixed(1)}% / ${(uses.reduce((a,b)=>a+b,0) / uses.length * 100).toFixed(1)}%` : "not measured";
      const calls = providerCounts.get(r.label);
      const underfilled = r.pageUse.length === 0 || uses.length !== r.pageUse.length || r.pageUse.some(p => p.problem !== undefined ? p.problem !== null : (p.fraction ?? 0) < .85);
      const passed=q.ready && !underfilled && r.renderProblems.length===0;
      const steps = q.steps?.length ? `${q.steps.map(d => `${d.day}: ${d.average}`).join("; ")} (${q.steps.length >= 2 && q.steps.at(-1)!.average > q.steps[0].average ? "rises" : "flat"})` : "none";
      const src = q.sources;
      const coverage = src && src.total ? `${(src.template / src.total * 100).toFixed(1)}% templates; ${src.handBuilt} hand-built; ${src.existing} existing writer` : "none";
      return `| ${r.label} | ${(q.failedRate * 100).toFixed(2)}% | ${q.dropped} | ${fullness} | ${q.days.map(d=>`${d.day}: ${d.minutes.toFixed(1)}`).join("; ")} | ${steps} | ${coverage} | subscription ${calls?.subscription ?? 0}; API ${calls?.api ?? 0} | ${passed ? "PASS" : "FAIL"} | ${!values.fake && passed ? "technical checks pass; approval pending" : "HOLD"} |`;
    }),
    ...ok.map(r => `- ${r.label}: largest unoccupied gap ${Math.max(...r.pageUse.map(p=>p.largestGap ?? 0)).toFixed(1)} px; extra practice pages ${r.draft.pages.filter(p=>p.content?.kind === "day" && p.content.extraPractice).length}; spacing failures ${r.pageUse.filter(p=>p.problem).length}.`),
    ...ok.map(r => `- ${r.label}: extra practice questions that repeat a book task (U4 to U9, 40 pages on): ${(r.draft.quality ?? workbookQuality(r.draft.pages)).extraRepeats ?? 0}; time trims ${r.draft.pages.reduce((n,p)=>n+(p.omissions ?? []).filter(o=>o.time).reduce((m,o)=>m+o.requested-o.placed,0),0)}.`),
    ...ok.map(r => `- ${r.label}: layout omissions ${(r.draft.quality ?? workbookQuality(r.draft.pages)).dropped - r.draft.pages.reduce((n,p)=>n+(p.leftOut?.length??0),0)}; fit omissions ${r.draft.pages.reduce((n,p)=>n+(p.leftOut?.length??0),0)}; total ${(r.draft.quality ?? workbookQuality(r.draft.pages)).dropped}.`),
    ...ok.map(r => `- ${r.label}: ${providerLine(r.label)}. API calls: ${providerCounts.get(r.label)?.api ?? (values.api || values.anthropic ? r.calls + r.solve.checks : 0)}.`),
    ...ok.flatMap(r => (r.draft.quality?.issues ?? []).map(i => `- ${r.label} p${i.page}: ${i.kind}: ${i.reason}`)),
    "",

    ...(providerCounts.size ? ["## AI calls by provider (D-200)", "The Claude subscription costs nothing per call; the API's cost is in the table above.", ...ok.map((r) => `- ${r.label}: ${providerLine(r.label)}`), ""] : []),
    "## Solve checks (round 7)",
    "Each printed question the AI wrote is read and answered by a separate model; one it answers otherwise fails closed (written again once, then marked failed).",
    ...ok.map((r) => `- ${r.label}: ${r.solve.checks} checks, ${r.solve.disagreed} read another way, ${r.solve.failed} failed or late, USD ${r.solve.usd.toFixed(4)} ([log](${r.label}-solve.jsonl))`),
    "",
    "## Profiles (made up)",
    ...profiles,
    "",
    `## Failures (${failures.length})`,
    ...failures,
    "",
    `## Left out for room (${leftOut.length})`,
    "Questions the page left out after its shorter rewrite still did not fit (the page has fewer questions).",
    ...leftOut,
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
console.log(`done: ${results.filter((r) => !r.error).length} books, USD ${results.reduce((n, r) => n + (r.usd ?? 0) + (r.solve?.usd ?? 0), 0).toFixed(2)}; ${out}/index.md`);
if (results.some(r=>r.error)) process.exitCode=1;

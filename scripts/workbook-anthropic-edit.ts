// Review comments on an authorized child's Book 1 draft, made on this checkout with the direct Anthropic API and the
// child's spending guard (the U19 fallback, Luis 2026-11-19). The same path as the admin page: each comment is saved with
// save_workbook_comment and sent with send_workbook_comments, then this process claims the batch (runner "server") and
// runs runWorkbookEdit, which writes the new revision with its checks, page images and PDF. Production runs main; an edit
// made there would rewrite this draft on other code. --dry-run reads the stored draft and revises each page with the fake
// writer, printing what would change, with no writes and no cost. Never approves, prints or ships.
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { toJson } from "@/lib/database";
import { configureAiUsage, flushAiUsage } from "@/lib/ai-usage";
import { workbookFakeAi, workbookFakeSolver } from "@/lib/workbook-ai-fake";
import { runWorkbookEditWith } from "@/lib/workbook-edit-deps";
import { workbookEditStore } from "@/lib/workbook-edit-store";
import { reviseWorkbookPage } from "@/lib/workbook-generator";
import { renderFitCheck } from "@/lib/workbook-fit";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { workbookAnthropicBudget } from "./workbook-anthropic-budget.mjs";

const PROJECT = "cdjobwsyzndtltzfpyqa";
delete process.env.WORKBOOK_AI_FAKE;
const { values } = parseArgs({ options: { child: { type: "string" }, run: { type: "string" }, comments: { type: "string" },
  "dry-run": { type: "boolean", default: false }, execute: { type: "boolean", default: false }, help: { type: "boolean", default: false } } });
if (values.help) {
  console.log("node scripts/workbook-anthropic-edit.mjs --child LABEL --run RUN_ID --comments FILE [--dry-run | --execute]\nFILE: [{ page, question, note }]. WORKBOOK_LIVE_CONFIG and ANTHROPIC_API_KEY_FILE as for workbook-anthropic-live. Read-only preflight is the default.");
  process.exit(0);
}
const configFile = process.env.WORKBOOK_LIVE_CONFIG;
if (!configFile) throw new Error("WORKBOOK_LIVE_CONFIG is required; it names the private family config");
const config = JSON.parse(await readFile(configFile, "utf8")) as { parentId: string; actor: { id: string; email: string }; children: Record<string, string>; limitUsd?: number };
const name = values.child;
if (!name || !Object.hasOwn(config.children ?? {}, name)) throw new Error("Choose an authorized child");
const childId = config.children[name];
const ACTOR = { id: config.actor.id, email: config.actor.email };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!values.run || !uuid.test(values.run)) throw new Error("--run must be a lowercase UUID");
if (!values.comments) throw new Error("--comments names the private comments file");
const comments = JSON.parse(await readFile(values.comments, "utf8")) as { page: number; question: number | null; note: string }[];
if (!Array.isArray(comments) || !comments.length || comments.some(c => !Number.isInteger(c.page) || (c.question !== null && !Number.isInteger(c.question)) || typeof c.note !== "string" || !c.note.trim()))
  throw new Error("The comments file is invalid");
if (values["dry-run"] && values.execute) throw new Error("Choose --dry-run or --execute");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
if (values.execute && git("status", "--porcelain")) throw new Error("Commit the reviewed code before a live edit; the checkout must be clean");
const build = git("rev-parse", "HEAD");
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!serviceKey) throw new Error("SUPABASE_SECRET_KEY is required");
const url = `https://${PROJECT}.supabase.co`;
const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Preflight (read only): this child's done Book 1 run and its draft, no workbook row (never printed), no open edit or comment.
const run = await admin.from("workbook_runs").select("id,child_id,parent_id,number,status,draft_id").eq("id", values.run).single();
if (run.error) throw new Error(run.error.message);
if (run.data.child_id !== childId || run.data.parent_id !== config.parentId || run.data.number !== 1 || run.data.status !== "done" || !run.data.draft_id)
  throw new Error("Only this child's done Book 1 run can be edited");
const draftId = run.data.draft_id;
const [books, edits, open, revisions] = await Promise.all([
  admin.from("workbooks").select("id,status").eq("id", draftId),
  admin.from("workbook_edits").select("id,status").eq("draft_id", draftId).in("status", ["queued", "running"]),
  admin.from("workbook_comments").select("id,status").eq("draft_id", draftId).in("status", ["pending", "failed", "sent"]),
  admin.from("workbook_draft_revisions").select("revision").eq("draft_id", draftId).order("revision", { ascending: false }).limit(1),
]);
for (const r of [books, edits, open, revisions]) if (r.error) throw new Error(r.error.message);
if (books.data?.length) throw new Error("This draft has a workbook row; it is not edited from here");
if (edits.data?.length || open.data?.length) throw new Error("This draft has an open edit or comment; finish it on the admin page first");
const revision = revisions.data?.[0]?.revision;
if (!revision) throw new Error("The draft has no revision");
const snapshot = await workbookEditStore(admin).load(draftId);
if (!snapshot || snapshot.revision !== revision) throw new Error("The draft changed while loading");
for (const c of comments) {
  const page = snapshot.draft.pages.find(p => p.number === c.page);
  if (!page || (c.question !== null && !page.questions.some(q => q.number === c.question))) throw new Error(`Page ${c.page} question ${c.question} does not exist`);
}
const stateDir = join(homedir(), ".local/state/unica/workbook-anthropic-live");
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const budget = await workbookAnthropicBudget({ file: join(stateDir, `${childId}.json`), childId, limitUsd: config.limitUsd ?? 35 });
console.log(JSON.stringify({ child: name, build, draftId, revision, comments: comments.length, budget: await budget.state(), mode: values.execute ? "execute" : values["dry-run"] ? "dry-run" : "preflight" }));
if (!values.execute && !values["dry-run"]) process.exit(0);

if (values["dry-run"]) {
  // The fake writer and solver, a store that never saves: what each page would print, nothing written.
  const env = { WORKBOOK_AI_FAKE: "on" };
  const ai = workbookFakeAi(env)!, solver = workbookFakeSolver(env)!;
  const template = workbookTemplate(await fixedTemplateFonts()), engine = chromiumPrintEngine();
  const deps = { ai, solver, fit: renderFitCheck({ template, engine, parentId: config.parentId, fullness: true }),
    store: { save: async () => { throw new Error("dry run: no save"); }, draft: async () => null },
    qrToken: () => randomBytes(16).toString("base64url"), timeLimitMs: 60_000 };
  for (const page of [...new Set(comments.map(c => c.page))]) {
    const group = comments.filter(c => c.page === page);
    const current = snapshot.draft.pages.find(p => p.number === page)!;
    try {
      const next = await reviseWorkbookPage(snapshot.input, deps as never, current, {
        question: group.some(c => c.question === null) ? null : group.map(c => c.question!),
        note: group.map(c => `${c.question === null ? "Whole page" : `Question ${c.question}`}: ${c.note}`).join("\n"),
      });
      for (const q of next.questions) if (group.some(c => c.question === null || c.question === q.number))
        console.log(JSON.stringify({ page, question: q.number, place: q.place, template: q.package?.templateId ?? null, check: q.check, text: q.package?.text }));
      console.log(JSON.stringify({ page, fit: next.fit }));
    } catch (e) { console.log(JSON.stringify({ page, error: e instanceof Error ? e.message : String(e) })); }
  }
  process.exit(0);
}

// Execute: save and send through the admin page's functions, then make the edit on this checkout.
const apiKeyFile = process.env.ANTHROPIC_API_KEY_FILE;
if (!apiKeyFile) throw new Error("ANTHROPIC_API_KEY_FILE is required; never put a key in the command line");
const apiKey = (await readFile(apiKeyFile, "utf8")).trim();
if (!apiKey) throw new Error("The saved Anthropic key is empty");
for (const c of comments) {
  const saved = await admin.rpc("save_workbook_comment", { p_draft: draftId, p_revision: revision, p_by: ACTOR.id, p_email: ACTOR.email,
    p_comment: toJson({ page: c.page, question: c.question, note: c.note, x: 0.5, y: 0.5, requestKey: randomUUID() }) });
  const result = saved.data as { status?: string; reason?: string } | null;
  if (saved.error || result?.status !== "saved") throw new Error(`Comment on page ${c.page} not saved: ${saved.error?.message ?? result?.reason}`);
}
const sent = await admin.rpc("send_workbook_comments", { p_draft: draftId, p_revision: revision, p_by: ACTOR.id, p_email: ACTOR.email, p_runner: "server" });
const batch = sent.data as { status?: string; id?: string; runner?: string; reason?: string } | null;
if (sent.error || batch?.status !== "queued" || !batch.id || batch.runner !== "server") throw new Error(`The comments were not sent: ${sent.error?.message ?? batch?.reason ?? batch?.status}`);
console.log(JSON.stringify({ batch: batch.id, status: "queued" }));
const env = { WORKBOOK_API_PROVIDER: "anthropic", WORKBOOK_AI_PRIMARY: "api", WORKBOOK_ANTHROPIC_CHILD_ID: childId,
  ANTHROPIC_API_KEY: apiKey, NODE_ENV: "production", CHROMIUM_PATH: process.env.CHROMIUM_PATH };
configureAiUsage({ url, key: serviceKey });
try {
  const outcome = await runWorkbookEditWith(admin, batch.id, { subscription: false, primary: "api", env, build, timeLimitMs: 10 * 60_000, anthropicFetchWrapper: budget.wrap });
  const after = await admin.from("workbook_edits").select("status,error").eq("id", batch.id).single();
  console.log(JSON.stringify({ batch: batch.id, outcome, edit: after.data, budget: await budget.state() }));
  if (outcome !== "done") process.exitCode = 1;
} finally { await flushAiUsage(); }

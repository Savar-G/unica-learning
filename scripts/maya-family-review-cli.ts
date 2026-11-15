// The daily review of Maya's family calls (docs/maya-tutor.md, "First-week review and kill switches"). It reads
// production with the Supabase secret key and only SELECTs: it writes nothing and prints no secret.
//   npm run maya:family-review -- [--hours 24] [--out <file>] [--json]
// SUPABASE_SECRET_KEY (or SUPABASE_SECRET_KEY_FILE, a file that holds the key) is the key; SUPABASE_URL overrides the
// default project URL. Exit 0 on success, 2 when the read fails.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { renderReport, reviewCalls, type ReviewCall } from "@/lib/maya-family-review";
import { SUPABASE_URL } from "@/lib/supabase-public";

function fail(message: string): never {
  // The message never holds a key: only our own words and the database's error text.
  console.error(`maya:family-review: ${message}`);
  process.exit(2);
}

const { values } = parseArgs({ options: { hours: { type: "string", default: "24" }, out: { type: "string" }, json: { type: "boolean", default: false } } });
const hours = Number(values.hours);
if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) fail("--hours must be a number from 0 to 720.");

const keyFile = process.env.SUPABASE_SECRET_KEY_FILE?.trim();
let key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!key && keyFile) {
  try { key = readFileSync(keyFile, "utf8").trim(); } catch { fail("SUPABASE_SECRET_KEY_FILE cannot be read."); }
}
if (!key) fail("no database key: set SUPABASE_SECRET_KEY or SUPABASE_SECRET_KEY_FILE.");
const url = process.env.SUPABASE_URL?.trim() || SUPABASE_URL;
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

/** Reads in groups so a long id list stays inside the URL limit. */
const chunks = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const to = new Date();
const from = new Date(to.getTime() - hours * 3_600_000);
const since = from.toISOString();

try {
  // 1. The family calls that started in the window (a call with no start time counts by when it was made).
  const calls: Database["public"]["Tables"]["maya_calls"]["Row"][] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await db.from("maya_calls").select("*").in("kind", ["chat", "family"]).or(`started_at.gte.${since},and(started_at.is.null,created_at.gte.${since})`).order("created_at", { ascending: true }).range(offset, offset + 99);
    if (page.error) throw new Error(`maya_calls: ${page.error.message}`);
    calls.push(...page.data);
    if (page.data.length < 100) break;
  }

  const ids = calls.map((c) => c.id);
  const parents = [...new Set(calls.map((c) => c.parent_id))];

  // 2. Which families are test families.
  const testParents = new Set<string>();
  for (const part of chunks(parents, 100)) {
    const r = await db.from("test_accounts").select("parent_id").in("parent_id", part);
    if (r.error) throw new Error(`test_accounts: ${r.error.message}`);
    r.data.forEach((t) => testParents.add(t.parent_id));
  }

  // 3. Notes, alerts and learning events of these calls.
  const notes = new Map<string, { finished: string | null; help: string | null; sentences: string[] }>();
  const alerts = new Map<string, { level: string; status: string }[]>();
  for (const part of chunks(ids, 100)) {
    const n = await db.from("maya_call_notes").select("call_id, facts, sentences").in("call_id", part);
    if (n.error) throw new Error(`maya_call_notes: ${n.error.message}`);
    for (const row of n.data) {
      const facts = obj(row.facts);
      notes.set(row.call_id, { finished: typeof facts.finished === "string" ? facts.finished : null, help: typeof facts.help === "string" ? facts.help : null, sentences: (Array.isArray(row.sentences) ? row.sentences : []).filter((s): s is string => typeof s === "string") });
    }
    const a = await db.from("maya_call_alerts").select("call_id, level, status").in("call_id", part);
    if (a.error) throw new Error(`maya_call_alerts: ${a.error.message}`);
    for (const row of a.data) alerts.set(row.call_id, [...(alerts.get(row.call_id) ?? []), { level: row.level, status: row.status }]);
  }
  const events = new Map<string, { result: string; hints: number }>();
  for (const part of chunks(calls.flatMap((c) => (c.learning_event_id ? [c.learning_event_id] : [])), 100)) {
    const e = await db.from("learning_events").select("id, result, hints").in("id", part);
    if (e.error) throw new Error(`learning_events: ${e.error.message}`);
    e.data.forEach((row) => events.set(row.id, { result: row.result, hints: row.hints }));
  }

  // 4. The stored answer of each workbook question, so the help check knows the value Maya must not say early.
  const answers = new Map<string, number>();
  const workbooks = [...new Set(calls.flatMap((c) => (c.workbook_id ? [c.workbook_id] : [])))];
  for (const part of chunks(workbooks, 20)) {
    const q = await db.from("workbook_questions").select("workbook_id, question_key, package").in("workbook_id", part);
    if (q.error) throw new Error(`workbook_questions: ${q.error.message}`);
    for (const row of q.data) {
      const value = obj(obj(obj(row.package).answer).value);
      if (value.type === "number" && typeof value.value === "number") answers.set(`${row.workbook_id}/${row.question_key}`, value.value);
    }
  }

  const rows: ReviewCall[] = calls.map((c) => ({
    id: c.id,
    startedAt: c.started_at ?? c.created_at,
    kind: c.kind,
    mode: c.mode,
    family: testParents.has(c.parent_id) ? "test" : "real",
    familyShortId: c.parent_id.slice(0, 6),
    questionRef: c.question_source === "workbook" ? `workbook page ${c.workbook_page}, question ${c.workbook_question} (${c.package_id})` : `test question ${c.assessment_question_id ?? "?"} (${c.package_id})`,
    questionText: c.question_text,
    answer: c.workbook_id ? (answers.get(`${c.workbook_id}/${c.package_id}`) ?? null) : null,
    trace: c.trace,
    assistance: c.assistance,
    flag: c.flag,
    safetyFlag: c.safety_flag,
    note: notes.get(c.id) ?? null,
    event: c.learning_event_id ? (events.get(c.learning_event_id) ?? null) : null,
    alerts: alerts.get(c.id) ?? [],
  }));

  const review = reviewCalls(rows, { from: since, to: to.toISOString(), hours });
  const text = values.json ? `${JSON.stringify({ ...review, calls: review.calls.map(({ call, ...r }) => ({ ...r, call: { ...call, trace: undefined } })) }, null, 2)}\n` : renderReport(review);
  if (values.out) writeFileSync(values.out, text);
  else process.stdout.write(text);
  // One line on stderr when the report goes to a file, so a person sees the totals.
  if (values.out) console.error(`maya:family-review: ${review.totals.calls} calls, ${review.totals.flagged} flagged, written to ${values.out}`);
} catch (e) {
  fail(e instanceof Error ? e.message : "the read failed.");
}

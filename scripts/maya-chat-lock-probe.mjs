// Race probes for #590 (migration maya_chat_lock_order), against the live project through the Supabase Management API.
// Run: node scripts/maya-chat-lock-probe.mjs [1] [2] [3]. The token comes from SUPABASE_ACCESS_TOKEN or the Keychain item
// "supabase-pagewise". It commits one throwaway test family (ids f5900000-..., email @example.invalid) and deletes it at
// the end. Every probe session ends with an exception, so nothing it does is kept. Each HTTP request is its own
// database session, so probes 1 and 2 race two sessions; the first session holds its row 2 s to widen the race.
// Before the migration: probes 1 and 2 print DEADLOCK 40P01, probe 3 prints BROKEN. After it: both sessions finish, and
// the parent change is refused.
import { execFileSync } from "node:child_process";
const token = process.env.SUPABASE_ACCESS_TOKEN || execFileSync("security", ["find-generic-password","-s","supabase-pagewise","-w"]).toString().trim();
async function q(sql) {
  const t0 = Date.now();
  const res = await fetch("https://api.supabase.com/v1/projects/cdjobwsyzndtltzfpyqa/database/query", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  return { status: res.status, ms: Date.now() - t0, text: text.replace(/\s+/g, " ").slice(0, 300) };
}
const X = "f5900000-0000-4000-8000-000000000001", K = "f5900000-0000-4000-8000-000000000002",
  CALL = "f5900000-0000-4000-8000-000000000003", Y = "f5900000-0000-4000-8000-000000000004";
const setup = `
insert into auth.users (id, email, aud, role, instance_id) values ('${X}', 'probe-590-x@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.parents (id, name, email) values ('${X}', 'Probe 590', 'probe-590-x@example.invalid');
insert into public.children (id, parent_id, first_name, grade, province) values ('${K}', '${X}', 'Probe', 2, 'BC');
insert into public.maya_calls (id, kind, parent_id, child_id, question_source, workbook_id, workbook_page, workbook_question, package_id,
  package_hash, model, prompt_version, versions, mode, counts_minutes, status, ended_at, outcome_reason, trace)
  values ('${CALL}', 'chat', '${X}', '${K}', 'workbook', gen_random_uuid(), 1, 1, 'probe-590', 'sha256:' || repeat('0', 64), 'probe',
  'probe', '{}'::jsonb, 'text', false, 'ended', now(), 'solved', jsonb_build_object('callId', '${CALL}'));
insert into public.test_accounts (parent_id, marked_by) values ('${X}', '${X}');
insert into public.maya_chat_families (parent_id, added_by, rehearsal) values ('${X}', '${X}', true);
select 'setup ok' as r;`;
const cleanup = `delete from auth.users where id in ('${X}', '${Y}');
select (select count(*) from public.parents where id in ('${X}','${Y}')) parents, (select count(*) from public.maya_chat_families where parent_id in ('${X}','${Y}')) chat,
  (select count(*) from public.test_accounts where parent_id in ('${X}','${Y}')) marks, (select count(*) from public.maya_calls where parent_id='${X}') calls,
  (select count(*) from public.email_log where parent_id='${X}') email_log;`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const doBlock = (body) => `do $p$ begin perform set_config('lock_timeout', '20s', true); ${body} raise exception 'probe_done_no_error'; end $p$;`;
const verdict = (r) => /deadlock detected/.test(r.text) ? "DEADLOCK 40P01" : /probe_done/.test(r.text) ? "finished, rolled back" : r.text;

async function probe1() {
  // Session B: an admin's chat-row update, with its row lock held 2 s before the update's triggers run.
  // Session A: the test-mark removal of the same family, 1 s later.
  const b = q(doBlock(`perform 1 from public.maya_chat_families where parent_id = '${X}' for no key update;
    perform pg_sleep(2); update public.maya_chat_families set rehearsal = true where parent_id = '${X}';`));
  await sleep(1000);
  const a = q(doBlock(`delete from public.test_accounts where parent_id = '${X}';`));
  const [rb, ra] = await Promise.all([b, a]);
  return { "B chat-row update": `${verdict(rb)} (${rb.ms} ms)`, "A test-mark removal": `${verdict(ra)} (${ra.ms} ms)` };
}
async function probe2() {
  // Session D: a family deletion, holding the parent row 2 s before its delete cascades. Session C: the weekly claim, 1 s later.
  const d = q(doBlock(`perform 1 from public.parents where id = '${X}' for update; perform pg_sleep(2);
    delete from public.parents where id = '${X}';`));
  await sleep(1000);
  const c = q(`do $p$ declare v uuid; begin perform set_config('lock_timeout', '20s', true);
    v := public.claim_maya_weekly('${X}', date_trunc('week', now())::date, array['${CALL}'::uuid], md5('a590') || md5('b590'), null, 0);
    raise exception 'probe_done claim=%', v; end $p$;`);
  const [rd, rc] = await Promise.all([d, c]);
  return { "D family deletion": `${verdict(rd)} (${rd.ms} ms)`, "C weekly claim": `${verdict(rc)} ${rc.text.match(/claim=\S*/)?.[0] ?? ""} (${rc.ms} ms)` };
}
async function probe3() {
  const r = await q(`do $p$ declare marked boolean; rehearsal boolean; begin
    insert into auth.users (id, email, aud, role, instance_id) values ('${Y}', 'probe-590-y@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
    insert into public.parents (id, name, email) values ('${Y}', 'Probe 590 B', 'probe-590-y@example.invalid');
    update public.test_accounts set parent_id = '${Y}' where parent_id = '${X}';
    marked := exists (select 1 from public.test_accounts where parent_id = '${X}');
    select f.rehearsal into rehearsal from public.maya_chat_families f where f.parent_id = '${X}';
    raise exception 'probe_result A_marked=% A_rehearsal=%', marked, rehearsal; end $p$;`);
  const m = r.text.match(/probe_result A_marked=(\w+) A_rehearsal=(\w+)/);
  if (m) return { result: m[2] === "t" && m[1] === "f" ? `BROKEN: family A keeps rehearsal=true with no test mark` : `ok: A_marked=${m[1]} A_rehearsal=${m[2]}` };
  return { result: `update refused: ${r.text}` };
}
const which = process.argv.slice(2);
console.log("setup:", (await q(setup)).text);
try {
  if (!which.length || which.includes("1")) console.log("probe 1 (test-mark removal vs chat-row update):", await probe1());
  if (!which.length || which.includes("2")) console.log("probe 2 (family deletion vs weekly claim):", await probe2());
  if (!which.length || which.includes("3")) console.log("probe 3 (test mark moved to another parent):", await probe3());
} finally {
  console.log("cleanup:", (await q(cleanup)).text);
}

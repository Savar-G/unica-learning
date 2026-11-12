// Runs the area rule (D-243, #549) on every stored finished test, read-only, and prints counts and anonymous ids.
//
// Usage: npm run area-levels:check
// The token comes from SUPABASE_ACCESS_TOKEN or the macOS Keychain item "supabase-pagewise" and goes only to the Supabase
// Management API's read-only query endpoint, which refuses any statement that changes data. The queries read no name,
// email, child id or family id, and the output holds only counts, areas, labels and a hash of each test's id. It leaves
// out the child's grade: a bar reads as grades from the school grade.
//
// What would prove the rule wrong, stated before the first run:
//   1. "invented-weakness": a Building up bar beside a Secure report (D-108).
//   2. "overstated": At grade or Ahead beside Needs attention, or Ahead beside Developing.
//   3. A test in "input mismatches": its answers do not add up to the stored placement, so the check itself is unsound.
//   4. A finished test the rule could not read, or fewer tests read than the database counts.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { checkAreaLevels, type CheckGroup, type CheckedTest } from "@/lib/area-level-check";
import {
  REPORTED_STRAND,
  fromRemovedRound,
  leftOutOfScore,
  restoreSession,
  testAreaAnswers,
  type AreaAnswer,
  type Level,
  type Placement,
  type Route,
  type Stage3Route,
  type StoredTest,
  type Strand,
} from "@/lib/assessment";

const PROJECT = "cdjobwsyzndtltzfpyqa";

async function select<T>(token: string, query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`read-only query: HTTP ${res.status}`);
  return (await res.json()) as T[];
}

const anonymous = (id: string) => createHash("sha256").update(`area-level-check:${id}`).digest("hex").slice(0, 8);

interface LiveRow {
  id: string;
  test_family: boolean;
  route: Route | null;
  stage3_route: Stage3Route | null;
  test: StoredTest;
  placement: Placement;
  answers: { question_id: string; response: string; time_ms: number; correct: boolean }[];
}

interface CopyRow {
  id: string;
  test_family: boolean;
  placement: Placement;
  questions: { position: number; level: Level; strand: Strand; correct: boolean | null; timeMs: number | null; questionId: string }[];
}

const LIVE = `
  select a.id, a.route, a.stage3_route, a.test, a.placement,
    exists (select 1 from public.test_accounts t where t.parent_id = a.parent_id)
      or exists (select 1 from public.admin_users u where u.user_id = a.parent_id) as test_family,
    coalesce((select jsonb_agg(jsonb_build_object('question_id', x.question_id, 'response', x.response, 'time_ms', x.time_ms, 'correct', x.correct) order by x.position)
      from public.answers x where x.assessment_id = a.id), '[]'::jsonb) as answers
  from public.assessments a where a.status = 'completed' order by a.id`;

const COPIES = `
  select c.id, c.test_family, c.copy -> 'placement' as placement, c.copy -> 'questions' as questions
  from public.anonymous_tests c where c.copy ->> 'status' = 'completed' order by c.id`;

const COUNTS = `
  select (select count(*) from public.assessments where status = 'completed')::int as live,
    (select count(*) from public.anonymous_tests where copy ->> 'status' = 'completed')::int as copies`;

/** Why a stored placement can count other answers than today's replay. Both are old rows that nothing rewrites. */
function storedDifference(placement: Placement, answered: number): string | null {
  if (!placement.pace) return "stored before the rushing rule (#189), so it counts rushed answers";
  if (placement.pace.answers > answered) return `counts ${placement.pace.answers - answered} answers of the removed extra round (D-145)`;
  return null;
}

const differences = new Map<string, string>();

function liveTest(row: LiveRow, markChanged: string[]): CheckedTest {
  const id = anonymous(row.id);
  const { answers } = row;
  const session = restoreSession(row.test, answers.map((a) => ({ questionId: a.question_id, response: a.response, timeMs: a.time_ms })), row.route, row.stage3_route);
  if (session.answers.some((a, i) => a.correct !== answers[i].correct)) markChanged.push(id);
  const difference = storedDifference(row.placement, answers.length);
  if (difference) differences.set(id, difference);
  return { id, group: row.test_family ? "test-family" : "real", answers: testAreaAnswers(session), placement: row.placement };
}

function copyTest(row: CopyRow): CheckedTest {
  // D-145: a copy saved before the extra round's removal (version 1) can still hold the round's questions.
  const questions = [...row.questions].filter((q) => q.correct !== null && !fromRemovedRound(q.questionId)).sort((a, b) => a.position - b.position);
  // An unknown time does not prove rushing, so it can never count as fast.
  const out = leftOutOfScore(questions.map((q) => ({ questionId: q.questionId, timeMs: q.timeMs ?? Number.MAX_SAFE_INTEGER, correct: q.correct === true })));
  const answers: AreaAnswer[] = questions.flatMap((q, i) => (out[i] ? [] : [{ area: REPORTED_STRAND[q.strand], level: q.level, correct: q.correct === true }]));
  const difference = storedDifference(row.placement, questions.length);
  if (difference) differences.set(anonymous(row.id), difference);
  return { id: anonymous(row.id), group: row.test_family ? "copy-test-family" : "copy-real", answers, placement: row.placement };
}

const token = process.env.SUPABASE_ACCESS_TOKEN
  || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();

const [counts] = await select<{ live: number; copies: number }>(token, COUNTS);
const [live, copies] = await Promise.all([select<LiveRow>(token, LIVE), select<CopyRow>(token, COPIES)]);

const unreadable: string[] = [];
const markChanged: string[] = [];
const tests: CheckedTest[] = [];
for (const row of live) {
  try {
    const test = liveTest(row, markChanged);
    checkAreaLevels([test]); // A placement with missing parts is unreadable here, not a stop for the whole check.
    tests.push(test);
  } catch {
    unreadable.push(anonymous(row.id));
  }
}
for (const row of copies) {
  try {
    const test = copyTest(row);
    checkAreaLevels([test]); // A placement with missing parts is unreadable here, not a stop for the whole check.
    tests.push(test);
  } catch {
    unreadable.push(anonymous(row.id));
  }
}

const result = checkAreaLevels(tests);

console.log(`finished tests in the database: ${counts.live} live, ${counts.copies} copies without names`);
console.log(`read: ${live.length} live, ${copies.length} copies; rule ran on ${tests.length}; unreadable: ${unreadable.length} ${unreadable.join(" ")}`);
console.log(`marks that differ from the stored mark after a replay: ${markChanged.length} ${markChanged.join(" ")}`);
console.log(`input mismatches: ${result.inputMismatches.length}`);
for (const id of result.inputMismatches) console.log(`  ${id}: ${differences.get(id) ?? "NOT EXPLAINED"}`);
for (const group of Object.keys(result.groups) as CheckGroup[]) {
  const c = result.groups[group];
  console.log(`\n[${group}] tests ${c.tests}, bars ${c.bars}`);
  if (!c.bars) continue;
  console.log(`  labels: ahead ${c.labels.ahead}, at grade ${c.labels["at-grade"]}, building up ${c.labels["building-up"]}`);
  console.log(`  certainty: clear ${c.certainty.clear}, early sign ${c.certainty["early-sign"]}`);
  console.log(`  basis: area ${c.basis.area}, estimate ${c.basis.estimate}, overall ${c.basis.overall} (${c.overallOnUnreliable} on tests the report calls unreliable)`);
  console.log(`  label/status: ${Object.entries(c.crossTab).sort().map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
console.log(`\ndisagreements: ${result.disagreements.length}`);
for (const d of result.disagreements) {
  const from = d.gradesFromSchool > 0 ? `+${d.gradesFromSchool}` : `${d.gradesFromSchool}`;
  console.log(`  ${d.id} [${d.group}] ${d.area}: ${d.kind}; bar ${d.label} (${from}, ${d.basis}, ${d.certainty}); report ${d.status} (${d.correct} of ${d.total})${d.unreliable ? "; report says unreliable" : ""}`);
}

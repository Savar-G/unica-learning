// Made-up families for the admin export in local development only (?demo=1, as the dashboard, D-099), so both formats
// can be downloaded and opened without an admin sign-in or a database. Each test is a real session of the assessment
// core, taken by a seeded child; the first two families are test families. Seeded, so every download is the same.
// No real person is in here, and nothing here reads or writes the database.
import {
  createFacts,
  createSession,
  finish,
  learnerProfile,
  nextQuestion,
  storedFacts,
  storedTest,
  submitAnswer,
  submitFact,
  type Grade,
  type ProfileAnswer,
  type Province,
} from "@/lib/assessment";
import type { ExportRow } from "@/lib/admin-export";
import { memoryExportReader, type ExportData } from "@/lib/admin-export-memory";

// mulberry32: a small seeded generator
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const id = (kind: number, n: number) => `00000000-0000-4000-8${kind}00-${n.toString(16).padStart(12, "0")}`;
const START = Date.parse("2026-10-01T16:00:00Z");
const at = (ms: number) => new Date(ms).toISOString();
const NOTES = ['Word problems, and "carrying" tens.', "Zoë's teacher says fractions; she counts on her fingers.", "-", null];

export function demoExportData(families = 24): ExportData {
  const r = rng(200);
  const out: ExportData = { testFamilies: [id(1, 1), id(1, 2)], assessments: [], children: [], answers: [], question_shows: [], assessment_facts: [], fact_answers: [], learner_profiles: [] };
  for (let i = 1; i <= families; i++) {
    const parent = id(1, i);
    const child = id(2, i);
    const grade = (1 + (i % 7)) as Grade;
    const province: Province = r() < 0.8 ? "BC" : "AB";
    const begun = START + i * 7_200_000;
    const answered = r() < 0.6;
    out.children.push({
      id: child, created_at: at(begun - 600_000), parent_id: parent, grade, province,
      learning_styles: answered ? ["pictures", "worked"].slice(0, 1 + (i % 2)) : null, interests: answered ? ["animals"] : null,
      learning_note: answered ? NOTES[i % NOTES.length] : null, math_feeling: answered ? ["enjoys", "okay", "avoids"][i % 3] : null,
      learning_goal: answered ? ["catch_up", "keep_up", "get_ahead"][i % 3] : null, weekly_time: answered ? "1_to_2h" : null,
      learning_updated_at: answered ? at(begun + 3_600_000) : null,
    });

    const test = id(3, i);
    const knows = grade - 1 + Math.floor(r() * 3);
    const stopAt = i % 5 === 0 ? 7 : Infinity;
    let session = createSession({ grade, province }, 1000 + i);
    let clock = begun;
    for (let q = nextQuestion(session); q && session.answers.length < stopAt; q = nextQuestion(session)) {
      const position = session.answers.length;
      const shown = clock;
      const right = q.level <= knows ? r() < 0.85 : r() < 0.3;
      const response = right ? q.answer : (q.wrong[0]?.value ?? String(Math.floor(r() * 100)));
      const timeMs = Math.round(r() < 0.08 ? 900 + r() * 1500 : 5000 + r() * 40_000);
      session = submitAnswer(session, { questionId: q.id, response, timeMs });
      clock += timeMs + 400;
      const a = session.answers[position];
      const drawn = q.showWork === true || (q.whiteboard && r() < 0.3);
      out.question_shows.push({ assessment_id: test, position, question_id: q.id, shown_at: at(shown), created_at: at(shown) });
      out.answers.push({
        id: id(4, i * 100 + position), created_at: at(clock), assessment_id: test, position, question_id: q.id, template_id: q.templateId,
        values: q.values, response, correct: a.correct, misconception: a.misconception, time_ms: timeMs, shown_at: at(shown), answered_at: at(clock),
        answer_changes: r() < 0.2 ? [{ value: String(Number(response) + 1), atMs: Math.round(timeMs / 2) }, { value: response, atMs: timeMs - 300 }] : [],
        read_aloud_count: r() < 0.15 ? 1 : 0, read_aloud_at_ms: [], away_count: 0, away_ms: 0,
        work_required: q.showWork === true, work_path: drawn ? `${parent}/${test}/${q.id}-demo.png` : null,
        work_text: drawn && r() < 0.4 ? "I added the tens, then the ones" : null, strokes_path: drawn ? `${parent}/${test}/${q.id}-demo.strokes.json` : null,
      });
    }
    const done = nextQuestion(session) === null;
    let facts = null;
    if (done && grade >= 3) {
      facts = createFacts({ grade, province }, 2000 + i);
      const factsStart = clock;
      for (const [n, f] of facts.facts.slice(0, 20).entries()) {
        const browserMs = Math.round(900 + r() * 1500);
        clock += browserMs + 150;
        facts = submitFact(facts, { factId: f.id, response: r() < 0.85 ? String(f.answer) : String(f.answer + 1), atMs: clock - factsStart, browserMs });
        const fa = facts.answers[n];
        out.fact_answers.push({ id: id(5, i * 100 + n), created_at: at(clock), assessment_id: test, position: n, fact_id: f.id, response: fa.response, correct: fa.correct, at_ms: fa.atMs, server_ms: fa.serverMs, browser_ms: fa.browserMs });
      }
      out.assessment_facts.push({ assessment_id: test, created_at: at(factsStart), started_at: at(factsStart), test: storedFacts(facts) });
    }
    const placement = done ? finish(session, facts, "no") : null;
    const row: ExportRow = {
      id: test, created_at: at(begun), parent_id: parent, child_id: child, grade, province, status: done ? "completed" : "in_progress",
      seed: 1000 + i, started_at: at(begun), last_answer_at: at(clock), completed_at: done ? at(clock + 1000) : null, resume_until: at(begun + 86_400_000),
      route: session.route, help: done ? "no" : null, placement, test: storedTest(session),
      device: { deviceClass: i % 2 ? "tablet" : "laptop", input: i % 2 ? "touch" : "mouse", screenWidth: i % 2 ? 820 : 1440, screenHeight: i % 2 ? 1180 : 900, browser: "safari" },
      break_started_at: null, break_ended_at: null, break_skipped: null, break_ms: null,
    };
    out.assessments.push(row);
    if (placement && province === "BC") {
      const questions = [...session.stage1, ...session.stage2[session.route!]];
      const answers: ProfileAnswer[] = session.answers.map((a, n) => ({
        question: questions[n], response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
        work: { required: questions[n].showWork === true, drawing: false, typed: false }, readAloud: null, away: null,
      }));
      const profile = learnerProfile({ placement, answers, help: "no", learning: null });
      if (profile) out.learner_profiles.push({ id: id(6, i), created_at: at(clock + 5000), built_at: at(clock + 5000), assessment_id: test, parent_id: parent, child_id: child, schema_version: profile.schemaVersion, profile });
    }
  }
  return out;
}

export const demoExportReader = () => memoryExportReader(demoExportData());

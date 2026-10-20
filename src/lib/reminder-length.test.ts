import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSession, storedTest, type Route } from "@/lib/assessment";
import { reminderMessage, reminderStore } from "@/lib/reminder-store";
import { dueReminders } from "@/lib/reminders";

vi.mock("server-only", () => ({}));

// The reminder rules and the reminder email use the stored test's own length (stage 1 plus the stored route), not the
// grade band's length (#214, a regression of #188: the up route has more questions than the band). These tests read a
// stored test through the reminder store, with an in-memory stand-in for the database.
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 16, 18, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const ORIGIN = "https://unicalearning.com";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** The part of the Supabase query builder the reminder store uses, over rows in memory. Selecting returns only the named columns. */
function fakeAdmin(tables: Tables): SupabaseClient {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    let columns: string[] = [];
    let count = false;
    let single = false;
    const query = {
      select(cols: string, opts?: { count?: string; head?: boolean }) {
        columns = cols.split(",").map((c) => c.trim());
        count = opts?.head === true;
        return query;
      },
      in(column: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[column])); return query; },
      eq(column: string, value: unknown) { rows = rows.filter((r) => r[column] === value); return query; },
      gte(column: string, value: string) { rows = rows.filter((r) => String(r[column]) >= value); return query; },
      lte(column: string, value: string) { rows = rows.filter((r) => String(r[column]) <= value); return query; },
      order() { return query; },
      range(a: number, b: number) { rows = rows.slice(a, b + 1); return query; },
      overrideTypes() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (v: unknown) => unknown) {
        if (count) return resolve({ count: rows.length, data: null, error: null });
        const pick = (r: Row) => Object.fromEntries(columns.map((c) => [c, r[c]]));
        if (single) return resolve({ data: rows[0] ? pick(rows[0]) : null, error: null });
        return resolve({ data: rows.map(pick), error: null });
      },
    };
    return query;
  };
  return { from } as unknown as SupabaseClient;
}

const PROFILE = { grade: 4, province: "BC" } as const;
const lastAnswer = T0;

/** Maya's test, in progress, with `answered` answers stored and the route chosen (or not). */
function mayaTables(route: Route | null, answered: number): Tables {
  return {
    children: [{ id: "c1", parent_id: "p1", first_name: "Maya", grade: 4, created_at: iso(T0 - 3 * 24 * HOUR) }],
    parents: [{ id: "p1", name: "Priya Shah", email: "priya@family.ca", postal: "V3S 1A1" }],
    assessments: [{
      id: "a1", child_id: "c1", grade: 4, status: "in_progress", route,
      started_at: iso(lastAnswer - 30 * MIN), last_answer_at: iso(lastAnswer), resume_until: iso(lastAnswer + 24 * HOUR), completed_at: null,
      test: storedTest(createSession(PROFILE, 7)),
    }],
    answers: Array.from({ length: answered }, (_, i) => ({ id: `n${i}`, assessment_id: "a1" })),
    email_log: [],
  };
}

async function remindersFor(tables: Tables) {
  const now = lastAnswer + 2 * HOUR;
  const state = await reminderStore(fakeAdmin(tables)).load(now);
  return { state, due: dueReminders(state, now) };
}

describe("a stopped test, as the reminder job reads it", () => {
  it("on the up route with 36 of 42 answers is not complete: it gets the continue reminder, with the right total", async () => {
    const { stage1, stage2 } = storedTest(createSession(PROFILE, 7));
    expect(stage1.length + stage2.up.length).toBe(42); // the band says 36; this test's own length is 42
    const { state, due } = await remindersFor(mayaTables("up", 36));
    expect(due).toMatchObject([{ kind: "continue", childId: "c1", assessmentId: "a1" }]);
    const email = reminderMessage(due[0], "tok", state, ORIGIN);
    expect(email?.text).toContain("after 36 of 42 questions");
  });

  it("on the up route with every one of its 42 answers in waits to be scored: no continue reminder", async () => {
    const { due } = await remindersFor(mayaTables("up", 42));
    expect(due).toEqual([]);
  });

  it("falls back to the band length (36 for grade 4) while the route is not chosen", async () => {
    const { state, due } = await remindersFor(mayaTables(null, 10));
    expect(due).toMatchObject([{ kind: "continue" }]);
    expect(reminderMessage(due[0], "tok", state, ORIGIN)?.text).toContain("after 10 of 36 questions");
  });
});

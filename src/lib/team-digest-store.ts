import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { TeamDigestRows } from "@/lib/team-digest";
import type { TeamDigestStore } from "@/lib/team-digest-send";

// The database side of the team's daily digest (docs/team-digest.md), with the secret key. Each read takes the runner's signal.
// Reads select only ids, kinds and times: no name, email or message text leaves the database for the email.

const PAGE = 1_000;
/** Rows per read at most; a read that reaches it is named in `capped`, so the email says its count is a floor. */
const MAX_ROWS = 10_000;

interface Page<T> { data: T[] | null; error: { message: string } | null }
type Ranged<T> = { range(from: number, to: number): { abortSignal(s: AbortSignal): PromiseLike<Page<T>> } };

export function teamDigestStore(db: SupabaseClient<Database>): TeamDigestStore {
  const days = () => db.from("team_digest_days");
  const note = async (what: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const r = await run();
      if (r.error) console.error(`[team digest] ${what} not saved; the claim stays held`, r.error.message);
      return !r.error;
    } catch (e) {
      console.error(`[team digest] ${what} not saved; the claim stays held`, e instanceof Error ? e.message : "failed");
      return false;
    }
  };
  return {
    async read(fromMs, toMs, signal = AbortSignal.timeout(15_000)) {
      const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
      const capped: string[] = [];
      async function all<T>(what: string, query: () => Ranged<T>): Promise<T[]> {
        const out: T[] = [];
        for (let start = 0; start < MAX_ROWS; start += PAGE) {
          const r = await query().range(start, start + PAGE - 1).abortSignal(signal);
          if (r.error) throw new Error(`team digest ${what}: ${r.error.message}`);
          out.push(...(r.data ?? []));
          if ((r.data ?? []).length < PAGE) return out;
        }
        capped.push(what);
        return out;
      }
      const [admins, tests, parents, finished, feedback, events, alerts, plans, starts, runs, book1, visits, steps, ai, scan] = await Promise.all([
        all("admin accounts", () => db.from("admin_users").select("user_id").order("user_id")),
        all("test families", () => db.from("test_accounts").select("parent_id").order("parent_id")),
        all("signups", () => db.from("parents").select("id, created_at").gte("created_at", from).lt("created_at", to).order("id")),
        all("finished tests", () => db.from("assessments").select("id, parent_id, completed_at").gte("completed_at", from).lt("completed_at", to).order("id")),
        all("feedback", () => db.from("feedback").select("id, parent_id, status, created_at").gte("created_at", from).lt("created_at", to).order("id")),
        all("email events", () => db.from("email_events").select("id, type, occurred_at").in("type", ["bounced", "complained", "failed", "suppressed"]).gte("occurred_at", from).lt("occurred_at", to).order("id")),
        all("safety alerts", () => db.from("maya_call_alerts").select("id, call_id, parent_id, level, created_at").gte("created_at", from).lt("created_at", to).order("id")),
        all("plan states", () => db.from("child_plan_states").select("child_id, parent_id, kind, event_at").in("kind", ["payment_failed", "ending", "paying"]).order("child_id")),
        all("plan starts", () => db.from("plan_starts").select("start_key, parent_id, state, started_at, finished_at").or(`state.eq.open,and(state.eq.started,finished_at.gte.${from},finished_at.lt.${to})`).order("start_key")),
        all("workbook runs", () => db.from("workbook_runs").select("id, child_id, parent_id, status, finished_at, created_at").in("status", ["failed", "stale"]).gte("created_at", new Date(fromMs - 7 * 86_400_000).toISOString()).order("id")),
        all("Book 1 records", () => db.from("workbook_book1_baseline_pending").select("draft_id, revision, child_id, parent_id, reason, created_at").gte("created_at", from).lt("created_at", to).order("draft_id").order("revision")),
        all("ad visits", () => db.from("ad_visits").select("id, visit_id, utm_campaign, utm_source, visited_at").gte("visited_at", from).lt("visited_at", to).order("id")),
        all("ad steps", () => db.from("ad_visit_steps").select("visit_id, step, stepped_at").gte("stepped_at", from).lt("stepped_at", to).order("visit_id").order("step")),
        all("AI usage", () => db.from("ai_usage_events").select("id, feature, cost_usd, calls, created_at").gte("created_at", from).lt("created_at", to).order("id")),
        db.rpc("scan_team_waiting_count").abortSignal(signal),
      ]);
      if (scan.error) throw new Error(`team digest scan count: ${scan.error.message}`);
      const waiting = Number(scan.data);
      const rows: TeamDigestRows = {
        testFamilies: [...admins.map((a) => a.user_id), ...tests.map((t) => t.parent_id)],
        signups: parents.map((p) => ({ parentId: p.id, at: p.created_at })),
        finishedTests: finished.flatMap((a) => (a.completed_at ? [{ id: a.id, parentId: a.parent_id, at: a.completed_at }] : [])),
        feedback: feedback.map((f) => ({ parentId: f.parent_id, status: f.status, at: f.created_at })),
        emailProblems: events.map((e) => ({ type: e.type, at: e.occurred_at })),
        safetyAlerts: alerts.map((a) => ({ callId: a.call_id, parentId: a.parent_id, level: a.level, at: a.created_at })),
        planStates: plans.map((p) => ({ childId: p.child_id, parentId: p.parent_id, kind: p.kind, eventAt: p.event_at })),
        planStarts: starts.map((s) => ({ parentId: s.parent_id, state: s.state, startedAt: s.started_at, finishedAt: s.finished_at })),
        // A run's time is its end (or its creation when it has none); the builder keeps only those inside each period.
        workbookRuns: runs.map((r) => ({ id: r.id, childId: r.child_id, parentId: r.parent_id, status: r.status, at: r.finished_at ?? r.created_at }))
          .filter((r) => Date.parse(r.at) >= fromMs && Date.parse(r.at) < toMs),
        book1Pending: book1.map((b) => ({ draftId: b.draft_id, childId: b.child_id, parentId: b.parent_id, reason: b.reason, at: b.created_at })),
        adVisits: visits.map((v) => ({ visitId: v.visit_id, campaign: v.utm_campaign, source: v.utm_source, at: v.visited_at })),
        adSteps: steps.map((s) => ({ visitId: s.visit_id, step: s.step, at: s.stepped_at })),
        aiUsage: ai.map((u) => ({ feature: u.feature, costUsd: u.cost_usd === null ? null : Number(u.cost_usd), calls: u.calls, at: u.created_at })),
        scanWaiting: Number.isSafeInteger(waiting) && waiting > 0 ? waiting : 0,
        capped,
      };
      return rows;
    },
    async dayTaken(day, signal) {
      const r = await days().select("day").eq("day", day).abortSignal(signal ?? AbortSignal.timeout(2_000)).maybeSingle();
      if (r.error) throw new Error(`team digest day check: ${r.error.message}`);
      return r.data !== null;
    },
    async claimDay(day, weekly, signal) {
      const r = await days().insert({ day, weekly }).abortSignal(signal ?? AbortSignal.timeout(2_000));
      if (!r.error) return true;
      if (r.error.code === "23505") return false;
      throw new Error(`team digest claim: ${r.error.message}`);
    },
    sent: async (day, emailId, signal) => { await note("sent", () => days().update({ state: "sent", email_id: emailId.slice(0, 100), error: null, updated_at: new Date().toISOString() }).eq("day", day).abortSignal(signal ?? AbortSignal.timeout(2_000))); },
    released: (day, _error, signal) => note("release", () => days().delete().eq("day", day).eq("state", "claimed").abortSignal(signal ?? AbortSignal.timeout(2_000))),
    unknown: async (day, error, signal) => { await note("unknown", () => days().update({ error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("day", day).abortSignal(signal ?? AbortSignal.timeout(2_000))); },
  };
}

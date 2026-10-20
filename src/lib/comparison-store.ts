import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ComparisonInput } from "@/lib/assessment";

/**
 * Server-only completed-test source for #101. Read across grades: a child's later test in another grade must replace
 * the earlier one. The core selects latest per child, then grade and exclusions, from this same source.
 * Keyset pages continue until empty, even when the API caps a response below our requested 500 rows.
 * The cutoff excludes new completions during the scan. A changed/missing count or a failed page stops the report
 * rather than publishing a partial cohort. This is not a database transaction; deletion during a scan can require a retry.
 */
export async function loadComparisonInput(admin: SupabaseClient<Database>, assessmentId: string): Promise<ComparisonInput> {
  const cutoff = new Date().toISOString();
  const signal = AbortSignal.timeout(20_000);
  const tests: ComparisonInput["tests"][number][] = [];
  let cursor: string | null = null;
  let expected: number | null = null;
  while (true) {
    let query = admin.from("assessments")
      .select("id, child_id, status, completed_at, placement, parent:parents(email)", cursor === null ? { count: "exact" } : {})
      .eq("status", "completed").lte("completed_at", cutoff).order("id", { ascending: true }).limit(500).abortSignal(signal);
    if (cursor !== null) query = query.gt("id", cursor);
    const { data, error, count } = await query;
    if (error || !data) throw new Error(`comparison source: ${error?.message ?? "missing rows"}`);
    if (cursor === null) {
      if (count === null) throw new Error("comparison source: missing exact count");
      expected = count;
    }
    if (data.length === 0) break;
    for (const row of data) {
      // Typed here, so the cursor's type does not depend on the read that the cursor itself shapes.
      const id: string = row.id;
      if (cursor !== null && id <= cursor) throw new Error("comparison source: page did not advance");
      if (!row.parent || !row.placement || !row.completed_at || !Number.isFinite(Date.parse(row.completed_at))) throw new Error("comparison source: incomplete test");
      tests.push({ id, childId: row.child_id, status: row.status, completedAt: row.completed_at, email: row.parent.email, placement: row.placement });
      cursor = id;
    }
  }
  if (tests.length !== expected) throw new Error("comparison source: completed set changed during read");
  return {
    assessmentId,
    tests,
    // No authoritative named exclusions exist yet. This empty-default list never reaches the report/browser.
    excludedEmails: (process.env.ASSESSMENT_COMPARISON_EXCLUDED_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
  };
}

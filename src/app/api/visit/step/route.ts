import { after } from "next/server";
import { adStepRow, STEP_RATE_MAX } from "@/lib/ad-visit-steps";
import { isLikelyBot } from "@/lib/flyers";
import { adminClient } from "@/lib/supabase-auth";

// The ad test step counter (docs/ad-tracking.md). A browser tab with an ad visit ID posts each step once (markStep in
// src/lib/ad-visit-steps.ts): /start opened, the form started, Google chosen, the email code sent. The same rules as
// /api/visit: the answer is always 204 and comes first; the row is written after the response; a failure only logs;
// only a browser's own post from this site counts; bots and bodies over 1 KB are not counted. The row holds the visit
// ID, the step and the time, nothing else. A step already stored for the visit is not counted twice. A step for a visit
// ID that ad_visits does not hold is not stored (the foreign key); because the visit row is written after its own
// response, a step that arrives first waits RETRY_MS and tries once more. A flood stops at STEP_RATE_MAX in 10 minutes.

const BODY_MAX = 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RETRY_MS = 2000;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (isLikelyBot(request.headers.get("user-agent")) || request.headers.get("sec-fetch-site") !== "same-origin") return done();
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > BODY_MAX) return done();
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) return done();
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const row = adStepRow(body);
  if (!row) return done();
  after(async () => {
    const db = adminClient();
    if (!db) return console.error("[visit-step] not counted: no service client");
    try {
      const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
      const recent = await db.from("ad_visit_steps").select("visit_id", { count: "exact", head: true }).gte("stepped_at", since);
      if (recent.error) return console.error("[visit-step] not counted", recent.error.code ?? "", recent.error.message);
      if ((recent.count ?? 0) >= STEP_RATE_MAX) return console.error("[visit-step] not counted: more than", STEP_RATE_MAX, "steps in 10 minutes");
      let { error } = await db.from("ad_visit_steps").insert(row);
      // 23503: the visit row is not there yet (or never was). Wait for it once.
      if (error?.code === "23503") {
        await new Promise((r) => setTimeout(r, RETRY_MS));
        ({ error } = await db.from("ad_visit_steps").insert(row));
      }
      // 23505: this step is stored already for the visit. Not a failure: the step is counted once.
      if (error && error.code !== "23505") console.error("[visit-step] not counted", error.code ?? "", error.message);
    } catch (e) {
      console.error("[visit-step] not counted", e instanceof Error ? e.message : "unknown error");
    }
  });
  return done();
}

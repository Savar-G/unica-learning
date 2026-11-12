import { timingSafeEqual } from "node:crypto";
import { createNextBookStepServer } from "@/lib/next-book-step-server";

// The next-book step (#476, src/lib/next-book-step.ts): prepares book 2 from the frozen snapshot of a delivered book 1.
// Supabase pg_cron posts here every 15 minutes (migration next_book_prepare_cron) with "Authorization: Bearer
// <CRON_SECRET>", read from the reminders' Vault secrets. It is its own route, not a step of /api/reminders, because the
// step reads the plan gate (childPlanAccess) and no email sender may reach it (src/lib/plan-access-emails.test.ts). It
// sends no email. It runs only when NEXT_BOOK_PREPARE_ENABLED turns it on, and with no planner it reads and writes nothing.
// ?dry=1 answers at once and writes nothing. The answer holds counts only, never a family's details.

export const maxDuration = 60;
/** The step's budget: it answers by this long after the request began, inside the 60-second limit. */
const STEP_MS = 55_000;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  // Never open: without a secret the step does not run at all.
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  if (new URL(request.url).searchParams.get("dry") === "1") return Response.json({ ok: true, dry: true });
  const startedAt = Date.now();
  const step = createNextBookStepServer({
    NEXT_BOOK_PREPARE_ENABLED: process.env.NEXT_BOOK_PREPARE_ENABLED,
    WORKBOOK_SCAN_TEST_PARENT_IDS: process.env.WORKBOOK_SCAN_TEST_PARENT_IDS,
  });
  if (!step) return Response.json({ ok: true, status: "off" });
  try {
    const result = await step.run({ now: () => Date.now(), endAt: startedAt + STEP_MS });
    if (result.status === "ran" && result.due > 0) console.info("[next book] run", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch {
    console.error("[next book] step stopped");
    return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}

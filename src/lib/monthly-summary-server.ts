import "server-only";
import { renderMonthlySummary, summaryFileName, type SummaryLimiter } from "@/lib/monthly-summary";
import { readMonthlySummary, type ParentViewReader } from "@/lib/parent-view";
import type { PrintEngine } from "@/lib/workbook-render";
import type { TemplateFonts } from "@/lib/workbook-template-fixed";

// The monthly summary route's answer (#562): one child's month as a one-page PDF, made now and never stored. The route
// (src/app/api/account/children/[id]/monthly-summary/route.ts) gives the session, the desk lock, the print engine and the
// limiter; this module decides. In order:
//   - the child's desk is open on this device: 423, as the proxy answers every account API then;
//   - no one signed in: to sign-in, since the parent opened the link in the browser;
//   - a family the dashboard switch does not open to, another family's child, a month the Overview does not offer: 404;
//   - too many tries by this parent, or too many renders in this function now: 429 with Retry-After;
//   - a read, the engine or the one-page check fails: 503.
// Every answer is private and never stored by a shared cache. A failure answers in plain words.

export interface SummaryRequest {
  deskOpen: boolean;
  parent: string | null;
  childId: string;
  month: string | null;
  now: number;
  access(parent: string): Promise<boolean>;
  reader(parent: string): ParentViewReader;
  engine(): PrintEngine;
  fonts(): Promise<TemplateFonts>;
  limiter: SummaryLimiter;
  signInUrl: string;
}

export const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

const say = (text: string, status: number, extra: Record<string, string> = {}) =>
  new Response(text, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", ...extra } });
const NOT_FOUND = "We cannot find a summary for this month.";
const FAILED = "We cannot make this summary right now. Try again in a moment.";

export async function monthlySummaryResponse(r: SummaryRequest): Promise<Response> {
  if (r.deskOpen) return Response.json({ ok: false, error: "desk_open" }, { status: 423, headers: NO_STORE });
  if (!r.parent) return new Response(null, { status: 303, headers: { ...NO_STORE, Location: r.signInUrl } });
  if (!(await r.access(r.parent))) return say(NOT_FOUND, 404);
  if (!r.month) return say(NOT_FOUND, 404);

  const take = r.limiter.take(r.parent, r.now);
  if (take === "too_many") return say("You have made several summaries in a few minutes. Try again in 10 minutes.", 429, { "Retry-After": "600" });
  if (take === "busy") return say("We are busy making other summaries. Try again in a moment.", 429, { "Retry-After": "15" });
  try {
    const view = await readMonthlySummary(r.reader(r.parent), r.childId, r.month, r.now);
    if (!view) return say(NOT_FOUND, 404);
    const out = await renderMonthlySummary({ view, engine: r.engine(), fonts: await r.fonts() });
    if (out.status === "failed") {
      console.error("[monthly-summary] render failed", out.reason);
      return say(FAILED, 503);
    }
    return new Response(out.pdf as BodyInit, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${summaryFileName(view)}"`,
        "Content-Length": String(out.pdf.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[monthly-summary] failed", error instanceof Error ? error.message : "failed");
    return say(FAILED, 503);
  } finally {
    r.limiter.release();
  }
}

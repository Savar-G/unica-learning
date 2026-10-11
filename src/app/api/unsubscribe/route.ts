import { unsubscribe } from "@/lib/reminder-store";
import { adminClient } from "@/lib/supabase-auth";

// Unsubscribe from reminder emails (#73, CASL). Not behind the pilot setting: CASL wants the link in a sent email to
// keep working for 60 days, whatever happens to the pilot. A token that is not a reminder's does nothing.
// POST /api/unsubscribe?t=<token>:
//   - mail apps' own Unsubscribe button (RFC 8058 one-click, body "List-Unsubscribe=One-Click"): 200, nothing else;
//   - the unsubscribe page, which posts on load (JSON answer), or its button when JavaScript is off (back to the page).
// GET (a mail app that opens the List-Unsubscribe link in a browser): the unsubscribe page.

const pageUrl = (request: Request, token: string) => new URL(`/unsubscribe?t=${encodeURIComponent(token)}`, request.url);

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = request.headers.get("content-type")?.includes("form") ? await request.formData().catch(() => null) : null;
  const token = url.searchParams.get("t") ?? (typeof form?.get("t") === "string" ? String(form.get("t")) : "");
  const admin = adminClient();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  let state: Awaited<ReturnType<typeof unsubscribe>>;
  try {
    state = await unsubscribe(admin, token);
  } catch (e) {
    console.error("[unsubscribe] failed", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "failed" }, { status: 502 });
  }
  // The page's button, without JavaScript: show the page again, which now says reminders are off.
  if (form?.get("page") === "1") return Response.redirect(pageUrl(request, token), 303);
  return Response.json({ ok: state === "unsubscribed", state }, { status: state === "unsubscribed" ? 200 : 404 });
}

export function GET(request: Request) {
  return Response.redirect(pageUrl(request, new URL(request.url).searchParams.get("t") ?? ""), 303);
}

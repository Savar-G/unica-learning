import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { DESK_COOKIE, DESK_HOME, deskGate } from "@/lib/desk";
import { FAMILY_DELETED_PATH, FAMILY_DELETED_STATUS, familyPath } from "@/lib/family-delete";
import { scanPagesAccess } from "@/lib/scan-pages-access";
import { adminClient } from "@/lib/supabase-auth";

// Refreshes an expired Supabase session before account pages render, because Server Components cannot set cookies.
// Runs only on the account paths, so the public site is untouched. While the child's desk is open on this device
// (#301, src/lib/desk.ts), it sends every account page back to the desk and refuses the account APIs.
//
// A family whose deletion request is queued (#556) gets no account page, account API or desk, even with an access token
// that a global sign-out cannot take back before it expires. This costs one read per signed-in request on those paths, and
// it is the only check that covers the reads (workbook PDFs among them): the database's write fence covers only writes. So
// a failed read never lets the request pass. The parent's own read is checked once more with the secret key, and only when
// that also fails does the request get a temporary refusal (503) instead of the account.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const family = familyPath(request.nextUrl.pathname);
  if (family && data?.claims.sub) {
    const state = await deletionState(supabase, data.claims.sub);
    if (state !== "none") {
      const gone = state === "unknown" ? tryAgain(family)
        : family === "page" ? NextResponse.redirect(new URL(FAMILY_DELETED_PATH, request.url))
        : NextResponse.json({ ok: false, error: "family_deleted" }, { status: FAMILY_DELETED_STATUS });
      for (const cookie of response.cookies.getAll()) gone.cookies.set(cookie);
      return gone;
    }
  }
  // An Auth error (not a signed-out visitor) keeps an open desk closed to the account.
  const known = !error || error.name === "AuthSessionMissingError";
  const gate = deskGate(request.nextUrl.pathname, request.cookies.get(DESK_COOKIE)?.value, data?.claims.sub ?? null, known);
  // A disabled scan route must reach its server not-found check even when the desk is open.
  // Permitted scanners still use the desk lock. The scan handler independently verifies the live session and release.
  const scanRoute = /^\/(?:account\/scan|api\/account\/scans)(?:\/|$)/.test(request.nextUrl.pathname);
  const hiddenScan = gate !== "pass" && scanRoute && (!data?.claims.sub || !await scanPagesAccess(data.claims.sub));
  if (gate === "pass" || hiddenScan) {
    // Parent pages are never kept for the back button (#301): the desk guard checks any page the browser restores.
    if (/^\/(?:account|admin)(?:\/|$)/.test(request.nextUrl.pathname)) response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
  // Keep a refreshed session on the answer that replaces the page.
  const answer = gate === "to-desk"
    ? NextResponse.redirect(new URL(DESK_HOME, request.url))
    : NextResponse.json({ ok: false, error: "desk_open" }, { status: 423 });
  for (const cookie of response.cookies.getAll()) answer.cookies.set(cookie);
  return answer;
}

/**
 * Whether this parent's family has a queued deletion request. The parent's own read comes first, so a working read costs one
 * call. Only when it fails does the secret key read the request row, and "unknown" means neither read answered.
 */
async function deletionState(session: SupabaseClient<Database>, parent: string): Promise<"none" | "queued" | "unknown"> {
  try {
    const own = await session.rpc("my_family_deletion_state");
    if (!own.error) return own.data ? "queued" : "none";
    console.error("[family-delete] state read failed", own.error.code);
  } catch (e) {
    console.error("[family-delete] state read failed", e instanceof Error ? e.name : "failed");
  }
  try {
    const service = adminClient();
    if (!service) return "unknown";
    const { data, error } = await service.from("family_deletions").select("reason").eq("parent_id", parent).eq("reason", "request").maybeSingle();
    if (error) {
      console.error("[family-delete] state check failed", error.code);
      return "unknown";
    }
    return data ? "queued" : "none";
  } catch (e) {
    console.error("[family-delete] state check failed", e instanceof Error ? e.name : "failed");
    return "unknown";
  }
}

/** The answer when no read could say whether the family is being deleted: nothing of the family, and a retry soon. */
function tryAgain(family: "page" | "api"): NextResponse {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Retry-After": "5" };
  if (family === "api") return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers });
  return new NextResponse(TRY_AGAIN_PAGE, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

const TRY_AGAIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Try again in a moment | Unica Learning</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 16px; line-height: 1.5; color: #1f2933; background: #fff">
<h1 style="font-size: 1.5rem">Please try again in a moment.</h1>
<p>We could not open your account just now. Reload this page in a few seconds.</p>
</body></html>`;

export const config = {
  matcher: [
    "/start", "/sign-in", "/sign-in/:path*", "/auth/:path*", "/account/:path*", "/api/account/:path*", "/admin/:path*", "/api/admin/:path*",
    "/tutor", "/tutor/:path*", "/api/desk/:path*",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { DESK_COOKIE, DESK_HOME, deskGate } from "@/lib/desk";
import { FAMILY_DELETED_PATH, FAMILY_DELETED_STATUS, familyPath } from "@/lib/family-delete";
import { scanPagesAccess } from "@/lib/scan-pages-access";

// Refreshes an expired Supabase session before account pages render, because Server Components cannot set cookies.
// Runs only on the account paths, so the public site is untouched. While the child's desk is open on this device
// (#301, src/lib/desk.ts), it sends every account page back to the desk and refuses the account APIs.
//
// A family whose deletion request is queued (#556) gets no account page, account API or desk, even with an access token
// that a global sign-out cannot take back before it expires. This costs one read per signed-in request on those paths, and
// it is the only check that covers the reads: the database's write fence covers only writes. A failed read lets the request
// pass, because a family's account must keep working when this read does not; the write fence still holds.
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
    const state = await supabase.rpc("my_family_deletion_state");
    if (state.error) console.error("[family-delete] state read failed", state.error.code);
    else if (state.data) {
      const gone = family === "page"
        ? NextResponse.redirect(new URL(FAMILY_DELETED_PATH, request.url))
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

export const config = {
  matcher: [
    "/start", "/sign-in", "/sign-in/:path*", "/auth/:path*", "/account/:path*", "/api/account/:path*", "/admin/:path*", "/api/admin/:path*",
    "/tutor", "/tutor/:path*", "/api/desk/:path*",
  ],
};

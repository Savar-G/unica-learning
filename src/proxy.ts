import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { DESK_COOKIE, DESK_HOME, deskGate } from "@/lib/desk";

// Refreshes an expired Supabase session before account pages render, because Server Components cannot set cookies.
// Runs only on the account paths, so the public site is untouched. While the child's desk is open on this device
// (#301, src/lib/desk.ts), it sends every account page back to the desk and refuses the account APIs.
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
  // An Auth error (not a signed-out visitor) keeps an open desk closed to the account.
  const known = !error || error.name === "AuthSessionMissingError";
  const gate = deskGate(request.nextUrl.pathname, request.cookies.get(DESK_COOKIE)?.value, data?.claims.sub ?? null, known);
  if (gate === "pass") {
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

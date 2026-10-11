import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { pilotOn } from "@/lib/pilot";

// Refreshes an expired Supabase session before account pages render, because Server Components cannot set cookies.
// Runs only on the account paths, so the public site is untouched.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!pilotOn()) return response;
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/start", "/sign-in", "/sign-in/:path*", "/auth/:path*", "/account/:path*", "/api/account/:path*", "/admin/:path*", "/api/admin/:path*"],
};

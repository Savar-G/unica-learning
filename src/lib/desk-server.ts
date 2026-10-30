import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import type { Database } from "@/lib/database";
import { DESK_COOKIE, lockCookie } from "@/lib/desk";
import type { ProvePassword } from "@/lib/parent-pin";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

// Server parts of the child's desk (#301, src/lib/desk.ts): the desk cookie, the origin check of its form POST, and the
// account-password check of Forgot PIN.

/** Puts this device in desk mode for the child, for 30 days or until the parent's PIN ends it. */
export function openDesk(response: NextResponse, parentId: string, childId: string) {
  response.cookies.set(DESK_COOKIE, lockCookie(parentId, childId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60,
  });
}

export function closeDesk(response: NextResponse) {
  response.cookies.delete({ name: DESK_COOKIE, path: "/" });
}

/** A form POST from this site only: a page on another site cannot open the desk on the parent's device. */
export const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
};

/**
 * Checks the signed-in parent's account password with Supabase Auth, on a client of its own so the parent's session is
 * not touched, then ends the session that sign-in made. `wrong` also covers an account with no password (Google only).
 * Supabase's own limit on sign-ins (429) answers `unavailable`; the reset's own limit per parent comes first.
 */
export function passwordProver(parentId: string, email: string): ProvePassword {
  return async (password) => {
    const auth = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).auth;
    const { data, error } = await auth.signInWithPassword({ email, password }).catch((e: unknown) => ({ data: null, error: e as { code?: string; status?: number } }));
    if (error) {
      if (error.code === "invalid_credentials") return "wrong";
      console.error("[desk] password check failed", error.status, error.code);
      return "unavailable";
    }
    await auth.signOut({ scope: "local" }).catch(() => {});
    return data?.user?.id === parentId ? "ok" : "wrong";
  };
}

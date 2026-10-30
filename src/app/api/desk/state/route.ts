import { cookies } from "next/headers";
import { DESK_COOKIE, deskGate } from "@/lib/desk";
import { sessionClient } from "@/lib/supabase-auth";

// Whether the child's desk is open on this device for the signed-in parent (#301, review R349-2): the desk guard on
// parent pages asks before it shows a page restored from history, when a tab comes back into view, and before a parent
// action that goes straight to Supabase. The same rule as the proxy: a parent page would be sent to the desk.
export async function GET() {
  const { data, error } = await (await sessionClient()).auth.getClaims();
  const known = !error || error.name === "AuthSessionMissingError";
  const open = deskGate("/account", (await cookies()).get(DESK_COOKIE)?.value, data?.claims.sub ?? null, known) !== "pass";
  return Response.json({ open }, { headers: { "Cache-Control": "no-store" } });
}

import "server-only";
import { adminSession, type AdminSession } from "@/lib/admin-store";
import type { WriteResult } from "@/lib/budget-store";

// The checks every budget route shares, like the other admin routes: a live admin (404 for everyone else), the site's
// own origin, and for a body, JSON. Returns the admin, or the answer to send.
export async function budgetCaller(request: Request, o: { json: boolean }): Promise<{ admin: AdminSession; body: unknown } | Response> {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!o.json) return { admin, body: null };
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  try {
    return { admin, body: await request.json() };
  } catch {
    return Response.json({ ok: false, error: "The request was not valid JSON." }, { status: 400 });
  }
}

export const bad = (error: string) => Response.json({ ok: false, error }, { status: 400 });

/** The answer for a write: { ok: true, ...value } or { ok: false, error } with the write's status. */
export function answer<T extends object | null>(r: WriteResult<T>): Response {
  return r.ok ? Response.json({ ok: true, ...(r.value ?? {}) }) : Response.json({ ok: false, error: r.error }, { status: r.status });
}

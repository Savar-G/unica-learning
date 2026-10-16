import { adminSession } from "@/lib/admin-store";
import { setDelivered } from "@/lib/flyer-store";
import { isFlyerCode } from "@/lib/flyers";

// Sets how many of a flyer were handed out, from the admin flyers page. Same checks as the other admin routes: a live
// admin, the site's own origin, and JSON.
export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  let body: { code?: unknown; delivered?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ ok: false }, { status: 400 }); }
  const { code, delivered } = body;
  if (typeof code !== "string" || !isFlyerCode(code)) return Response.json({ ok: false }, { status: 400 });
  if (typeof delivered !== "number" || !Number.isInteger(delivered) || delivered < 0 || delivered > 100_000) return Response.json({ ok: false }, { status: 400 });
  return (await setDelivered(code, delivered)) ? Response.json({ ok: true, delivered }) : Response.json({ ok: false }, { status: 503 });
}

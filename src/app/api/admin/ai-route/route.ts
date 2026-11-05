import { adminSession } from "@/lib/admin-store";
import { checkAiRoute, routeChecks } from "@/lib/ai-route-check";

// The live check of the AI route (D-282): fixed requests with no child data, a small one per model this deployment uses
// and the real-size ones (the largest schema, Maya's schema, an image). Answers
// { ok, checks: [{ ok, shape, requested, schemaBytes, status, model, provider, error? }] }. Admins only; POST, from this site.
export const maxDuration = 120;

export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return Response.json({ ok: false, error: "ai_off" }, { status: 503 });
  const signal = AbortSignal.timeout(100_000);
  const checks = await Promise.all(routeChecks().map(({ model, shape }) => checkAiRoute({ apiKey, model, shape, signal })));
  return Response.json({ ok: checks.every((check) => check.ok), checks });
}

import { requireAdmin } from "@/lib/admin-store";
import { runSocialRefresh } from "@/lib/social-store";

export const maxDuration = 240;

export async function POST(request: Request) {
  await requireAdmin();
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  let outcome: string;
  try {
    const result = await runSocialRefresh(new Date());
    outcome = result.kind === "cooldown" ? "cooldown" : "refreshed";
  } catch {
    outcome = "refresh-failed";
  }
  return new Response(null, { status: 303, headers: { Location: `/admin/social?notice=${outcome}` } });
}

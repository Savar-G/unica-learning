import { requireAdmin } from "@/lib/admin-store";
import { isConnectedPlatform, socialTracking } from "@/lib/social-metrics";
import { saveSocialTracking } from "@/lib/social-store";

export async function POST(request: Request) {
  await requireAdmin();
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported form", { status: 415 });
  }
  const form = await request.formData().catch(() => null);
  const platform = form?.get("platform");
  const post = form?.get("post");
  const tracking = socialTracking({ content: form?.get("content"), campaign: form?.get("campaign") });
  const result = isConnectedPlatform(platform) && typeof post === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(post) && tracking
    ? await saveSocialTracking(platform, post, tracking)
    : "invalid";
  return new Response(null, { status: 303, headers: { Location: `/admin/social?notice=${result}#social-posts` } });
}

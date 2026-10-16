import { after, NextResponse } from "next/server";
import { flyerDestination, isFlyerCode, isLikelyBot } from "@/lib/flyers";
import { adminClient } from "@/lib/supabase-auth";

// The address on a printed flyer's QR code (the door-to-door A/B test). It counts the scan, then sends the visitor to
// the free assessment signup, tagged with the flyer so the signup keeps it (parents.source). Counting never delays or
// breaks the redirect: it runs after the response, and a failure only logs. Link previews and crawlers are not counted.
// An unknown code goes to the home page, so a mistyped address still lands somewhere useful.
export async function GET(request: Request, ctx: RouteContext<"/f/[code]">) {
  const { code: raw } = await ctx.params;
  const code = raw.toLowerCase();
  const to = new URL(isFlyerCode(code) ? flyerDestination(code) : "/", request.url);
  if (isFlyerCode(code) && !isLikelyBot(request.headers.get("user-agent"))) {
    after(async () => {
      const db = adminClient();
      if (!db) return console.error("[flyer] scan not counted: no service client");
      const { error } = await db.from("flyer_scans").insert({ code });
      if (error) console.error("[flyer] scan not counted", code, error.message);
    });
  }
  // A temporary redirect that is never cached, so each scan reaches this route and the destination can change.
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

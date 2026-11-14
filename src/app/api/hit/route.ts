import { after } from "next/server";
import { isLikelyBot } from "@/lib/flyers";
import { HIT_RATE_MAX, siteHitRow } from "@/lib/site-hits";
import { adminClient } from "@/lib/supabase-auth";

// The site traffic counter (docs/web-analytics.md, src/lib/site-hits.ts). The browser posts once per page view of a
// public page. The answer is always 204 and comes first; the row is written after the response, and a failure (no
// secret key, the table not there yet, the store down) only logs, so the site never waits for it or breaks. Only a
// browser's own post from this site counts (Sec-Fetch-Site: same-origin). Link previews, crawlers and requests with no
// user agent are not counted, and a body over 2 KB is not read. Stored: the path, the visit id, the referrer's host, the
// UTM tags of the first page, a device class, a browser family and the country and region from Vercel's geo headers.
// Never the IP, the user agent, a cookie or a query string. A flood stops at HIT_RATE_MAX views in 10 minutes.

const BODY_MAX = 2048;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const userAgent = request.headers.get("user-agent");
  if (isLikelyBot(userAgent) || request.headers.get("sec-fetch-site") !== "same-origin") return done();
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > BODY_MAX) return done();
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) return done();
    body = JSON.parse(text);
  } catch {
    return done();
  }
  let region = request.headers.get("x-vercel-ip-country-region");
  try { region = region ? decodeURIComponent(region) : null; } catch { region = null; }
  const row = siteHitRow(body, { userAgent, country: request.headers.get("x-vercel-ip-country"), region: region?.toUpperCase() ?? null });
  if (!row) return done();
  after(async () => {
    const db = adminClient();
    if (!db) return console.error("[hit] not counted: no service client");
    try {
      const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
      const recent = await db.from("site_hits").select("id", { count: "exact", head: true }).gte("hit_at", since);
      if (recent.error) return console.error("[hit] not counted", recent.error.code ?? "", recent.error.message);
      if ((recent.count ?? 0) >= HIT_RATE_MAX) return console.error("[hit] not counted: more than", HIT_RATE_MAX, "views in 10 minutes");
      const { error } = await db.from("site_hits").insert(row);
      if (error) console.error("[hit] not counted", error.code ?? "", error.message);
    } catch (e) {
      console.error("[hit] not counted", e instanceof Error ? e.message : "unknown error");
    }
  });
  return done();
}

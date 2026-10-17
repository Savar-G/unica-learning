import { after } from "next/server";
import { adVisitRow, RATE_MAX } from "@/lib/ad-visits";
import { isLikelyBot } from "@/lib/flyers";
import { adminClient } from "@/lib/supabase-auth";

// The ad visit counter (docs/ad-tracking.md). The browser posts once per tab when a visit lands from an ad or a tagged
// link (keepVisit in src/lib/visit-source.ts). The answer is always 204 and comes first; the row is written after the
// response, and a failure (no secret key, the table not there yet, the store down) only logs, so the site never waits
// for it or breaks. Only a browser's own post from this site counts (Sec-Fetch-Site: same-origin; a script or another
// site's page does not send it). Link previews, crawlers and requests with no user agent are not counted, and a body
// over 2 KB is not read. No IP, user agent, cookie or click ID is stored: the row holds the visit ID, the UTM tags,
// the time and whether a click ID was there. A visit ID already stored (the same tab posting again) is not counted
// twice. A flood stops at RATE_MAX visits in 10 minutes: past that, new visits are not counted.

const BODY_MAX = 2048;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (isLikelyBot(request.headers.get("user-agent")) || request.headers.get("sec-fetch-site") !== "same-origin") return done();
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
  const row = adVisitRow(body);
  if (!row) return done();
  after(async () => {
    const db = adminClient();
    if (!db) return console.error("[visit] not counted: no service client");
    try {
      const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
      const recent = await db.from("ad_visits").select("id", { count: "exact", head: true }).gte("visited_at", since);
      if (recent.error) return console.error("[visit] not counted", recent.error.code ?? "", recent.error.message);
      if ((recent.count ?? 0) >= RATE_MAX) return console.error("[visit] not counted: more than", RATE_MAX, "visits in 10 minutes");
      const { error } = await db.from("ad_visits").insert(row);
      // 23505: this visit ID is stored already. Not a failure: the visit is counted once.
      if (error && error.code !== "23505") console.error("[visit] not counted", error.code ?? "", error.message);
    } catch (e) {
      console.error("[visit] not counted", e instanceof Error ? e.message : "unknown error");
    }
  });
  return done();
}

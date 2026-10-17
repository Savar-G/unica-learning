import { after } from "next/server";
import { adVisitRow } from "@/lib/ad-visits";
import { isLikelyBot } from "@/lib/flyers";
import { adminClient } from "@/lib/supabase-auth";

// The ad visit counter (docs/ad-tracking.md). The browser posts once per tab when a visit lands from an ad or a tagged
// link (keepVisit in src/lib/visit-source.ts). The answer is always 204 and comes first; the row is written after the
// response, and a failure (no secret key, the table not there yet, the store down) only logs, so the site never waits
// for it or breaks. Link previews, crawlers, requests with no user agent and posts from another site are not counted.
// No IP, user agent, cookie or click ID is stored: the row holds the visit ID, the UTM tags, the time and whether a
// click ID was there. A visit ID already stored (the same tab posting again) is not counted twice.

const BODY_MAX = 2048;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (isLikelyBot(request.headers.get("user-agent")) || request.headers.get("sec-fetch-site") === "cross-site") return done();
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
      const { error } = await db.from("ad_visits").insert(row);
      // 23505: this visit ID is stored already. Not a failure: the visit is counted once.
      if (error && error.code !== "23505") console.error("[visit] not counted", error.code ?? "", error.message);
    } catch (e) {
      console.error("[visit] not counted", e instanceof Error ? e.message : "unknown error");
    }
  });
  return done();
}

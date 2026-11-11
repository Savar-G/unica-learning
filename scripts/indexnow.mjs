#!/usr/bin/env node
// IndexNow (D-319): tells Bing (and the other IndexNow engines) which pages changed, so they do not wait for a crawl.
// Bing feeds Copilot and ChatGPT search. Run daily by .github/workflows/indexnow.yml.
// It sends only the sitemap URLs whose <lastmod> is recent (IndexNow asks for changed URLs only), so the dates in
// src/app/sitemap.ts must be the dates the page text changed.
//
// Usage: node scripts/indexnow.mjs [--days N] [--all] [--dry-run]
//   --days N   send URLs whose lastmod is within the last N days (default 2, so a daily run never misses a day)
//   --all      send every sitemap URL (once, for the first submission)
//   --dry-run  print the URLs and send nothing

const SITE = "https://unicalearning.com";
// The key is public by design: IndexNow checks that this file on the site holds the same key (public/<key>.txt).
const KEY = "19ba434442febeb87674fc53ac06b2d0";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const all = args.includes("--all");
const dryRun = args.includes("--dry-run");
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 2;
if (!Number.isFinite(days) || days < 0) throw new Error("--days needs a number of days");

const keyRes = await fetch(`${SITE}/${KEY}.txt`, { signal: AbortSignal.timeout(20_000) });
const keyText = keyRes.ok ? (await keyRes.text()).trim() : "";
if (keyText !== KEY) {
  console.error(`The key file ${SITE}/${KEY}.txt returned ${keyRes.status} and does not hold the key. Nothing sent.`);
  process.exit(1);
}

const sitemapRes = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) });
if (!sitemapRes.ok) {
  console.error(`sitemap.xml returned ${sitemapRes.status}. Nothing sent.`);
  process.exit(1);
}
const entries = [...(await sitemapRes.text()).matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1].trim(),
  lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1].trim().slice(0, 10),
})).filter((e) => e.loc);

const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const urls = entries.filter((e) => all || (e.lastmod && e.lastmod >= since)).map((e) => e.loc);
console.log(`${entries.length} sitemap URLs; ${all ? "sending all" : `lastmod on or after ${since}`}: ${urls.length} to send.`);
for (const u of urls) console.log(`  ${u}`);
if (!urls.length || dryRun) process.exit(0);

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
  signal: AbortSignal.timeout(30_000),
});
const body = await res.text();
console.log(`IndexNow answered ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
// 200 = received, 202 = received and the key is still being checked. Anything else is a failure.
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);

#!/usr/bin/env node
// SEO guard (D-319): checks the live site for the four changes that quietly remove a site from search and AI answers:
// robots.txt blocks a search bot, a page turns noindex, a canonical points elsewhere, a 200 becomes an error.
// It also checks that www redirects to the main address and that each search bot gets a 200 for the home page.
// Run by .github/workflows/seo-guard.yml every day and after each production deploy. Exits 1 on any failure.
//
// Usage: node scripts/seo-guard.mjs [base-url]
//   base-url defaults to https://unicalearning.com. For another base (a local `next start`), the sitemap's
//   production addresses are fetched from that base, the canonical must still name the production address,
//   and the www check is skipped.

const PRODUCTION = "https://unicalearning.com";
const WWW = "https://www.unicalearning.com";
const base = (process.argv[2] ?? PRODUCTION).replace(/\/$/, "");
const isProduction = base === PRODUCTION;

// Bots that power live search and AI answers (blocking these removes the site from them), then the training bots.
const SEARCH_BOTS = {
  "OAI-SearchBot": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
  "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
  PerplexityBot: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  Bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

const failures = [];
const pass = (msg) => console.log(`PASS ${msg}`);
const fail = (msg) => { failures.push(msg); console.log(`FAIL ${msg}`); };

async function get(url, init = {}) {
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });
}

// robots.txt groups: each "User-agent" run, then its rules. Returns the Disallow paths that apply to an agent.
function disallowsFor(robots, agent) {
  const groups = [];
  let current = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key.toLowerCase() === "user-agent") {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if (current && /^(dis)?allow$/i.test(key)) current.rules.push({ key: key.toLowerCase(), value });
  }
  const own = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules.filter((r) => r.key === "disallow").map((r) => r.value));
}

async function checkRobots() {
  const res = await get(`${base}/robots.txt`);
  if (res.status !== 200) return fail(`robots.txt returned ${res.status}`);
  const robots = await res.text();
  for (const bot of Object.keys(SEARCH_BOTS)) {
    const blocked = disallowsFor(robots, bot).filter((p) => p === "/" || p === "/*");
    if (blocked.length) fail(`robots.txt blocks ${bot} from the whole site ("Disallow: ${blocked[0]}")`);
    else pass(`robots.txt lets ${bot} crawl the site`);
  }
  if (/^sitemap:\s*\S+/im.test(robots)) pass("robots.txt names the sitemap");
  else fail("robots.txt has no Sitemap line");
}

async function sitemapUrls() {
  const res = await get(`${base}/sitemap.xml`);
  if (res.status !== 200) { fail(`sitemap.xml returned ${res.status}`); return []; }
  const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length) pass(`sitemap.xml lists ${urls.length} URLs`);
  else fail("sitemap.xml lists no URLs");
  return urls;
}

const same = (a, b) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

async function checkPage(loc) {
  const url = isProduction ? loc : loc.replace(PRODUCTION, base);
  const res = await get(url);
  if (res.status !== 200) return fail(`${loc} returned ${res.status}${res.headers.get("location") ? ` -> ${res.headers.get("location")}` : ""}`);
  const html = await res.text();
  const problems = [];
  const xRobots = res.headers.get("x-robots-tag") ?? "";
  if (/noindex/i.test(xRobots)) problems.push(`X-Robots-Tag "${xRobots}"`);
  const metaRobots = [...html.matchAll(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/gi)].map((m) => m[1]);
  if (metaRobots.some((c) => /noindex/i.test(c))) problems.push(`meta robots "${metaRobots.join(", ")}"`);
  const canonicals = [...html.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/gi)].map((m) => m[1]);
  if (canonicals.length !== 1) problems.push(`${canonicals.length} canonical tags`);
  else if (!same(canonicals[0], loc)) problems.push(`canonical points to ${canonicals[0]}`);
  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) problems.push(`${h1} H1 tags in the raw HTML`);
  if (problems.length) fail(`${loc}: ${problems.join("; ")}`);
  else pass(`${loc}: 200, indexable, self-canonical, 1 H1`);
}

async function checkBots() {
  for (const [bot, ua] of Object.entries(SEARCH_BOTS)) {
    const res = await get(`${base}/`, { headers: { "user-agent": ua } });
    if (res.status === 200) pass(`${bot} gets 200 for the home page`);
    else fail(`${bot} gets ${res.status} for the home page`);
  }
}

async function checkWww() {
  for (const path of ["/", "/pricing?utm_source=guard"]) {
    const res = await get(`${WWW}${path}`);
    const location = res.headers.get("location") ?? "";
    const target = new URL(location, WWW).href;
    if ([301, 308].includes(res.status) && same(target, `${PRODUCTION}${path}`)) pass(`www${path} redirects ${res.status} to ${target}`);
    else fail(`www${path} returned ${res.status}${location ? ` -> ${location}` : ""}, expected 301 or 308 to ${PRODUCTION}${path}`);
  }
}

console.log(`SEO guard for ${base}`);
try {
  await checkRobots();
  for (const loc of await sitemapUrls()) await checkPage(loc);
  await checkBots();
  if (isProduction) await checkWww();
  else console.log("SKIP www redirect (not the production address)");
} catch (error) {
  fail(`could not finish: ${error instanceof Error ? error.message : String(error)}`);
}
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);

import "server-only";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin-store";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import { loadPosthogTraffic, posthogConfig, type PosthogTraffic } from "@/lib/posthog-traffic";
import { parseSiteTraffic, trafficCall, trafficRange, type SiteTraffic, type TrafficRange } from "@/lib/site-traffic";

// What the admin Traffic page (/admin/traffic) reads: the cookieless counter through the admin's own session
// (the admin_site_traffic function), and PostHog's consenting visitors through a read-only API key. Admins only
// (requireAdmin). PostHog failing or not being set up never stops the page: the cookieless numbers still show.

export interface TrafficPage {
  who: string;
  range: TrafficRange;
  withTests: boolean;
  /** Null when the counter's table or function is not there yet (the migration is not applied). */
  site: SiteTraffic | null;
  siteError: string | null;
  /** Null when no PostHog key is set. */
  posthog: PosthogTraffic | null;
  posthogConfigured: boolean;
  /** Whole days since the first counted visit, or null when none is counted yet. */
  counterDays: number | null;
}

export async function loadTraffic(raw: Record<string, string | string[] | undefined>): Promise<TrafficPage> {
  await connection();
  const range = trafficRange(typeof raw.range === "string" ? raw.range : undefined);
  const admin = await requireAdmin();
  const withTests = await showTestFamilies();
  const config = posthogConfig();
  const [site, posthog] = await Promise.all([
    admin.db.rpc("admin_site_traffic", trafficCall(range, withTests)),
    config ? loadPosthogTraffic(config, Date.now(), range.days) : Promise.resolve(null),
  ]);
  const parsed = site.error ? null : parseSiteTraffic(site.data);
  if (site.error) console.error("[admin] traffic failed", site.error.code ?? "", site.error.message);
  return {
    who: admin.email,
    range,
    withTests,
    site: parsed,
    siteError: site.error ? "The visit counter could not be read. Try again in a minute." : null,
    posthog,
    posthogConfigured: config !== null,
    counterDays: parsed?.firstHit ? Math.floor((Date.now() - Date.parse(parsed.firstHit)) / 86_400_000) : null,
  };
}

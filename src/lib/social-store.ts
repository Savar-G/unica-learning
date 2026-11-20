import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { addDays } from "@/lib/family-time";
import { adminClient } from "@/lib/supabase-auth";
import { type SocialDashboardInput } from "@/lib/social-dashboard";
import { metaAdapter } from "@/lib/social-meta";
import { refreshSocial, socialDay, type SocialWriteStore } from "@/lib/social-metrics";
import { youtubeAdapter } from "@/lib/social-youtube";

const FETCH_LIMIT = 500;
const MAX_POSTS = 500;

function configuredAdapters() {
  const meta = {
    token: process.env.META_PAGE_ACCESS_TOKEN,
    pageId: process.env.META_PAGE_ID,
    instagramId: process.env.META_IG_USER_ID,
  };
  return [
    youtubeAdapter({
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
    }),
    metaAdapter("instagram", meta),
    metaAdapter("facebook", meta),
  ];
}

function must<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error || result.data == null) throw new Error(`Could not read ${what}.`);
  return result.data;
}

async function all<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, what: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += FETCH_LIMIT) {
    const batch = must(await read(from, from + FETCH_LIMIT - 1), what);
    rows.push(...batch);
    if (batch.length < FETCH_LIMIT) return rows;
  }
}

export async function readSocial(db: SupabaseClient<Database>, now: Date): Promise<SocialDashboardInput> {
  const today = socialDay(now);
  const first = addDays(today, -14);
  const latest = await db.from("social_refreshes").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error("Could not read the latest social refresh.");
  const [accounts, status, daily, followers, posts, attribution, email, audience] = await Promise.all([
    db.from("social_accounts").select("*"),
    latest.data ? db.from("social_refresh_results").select("*").eq("started_at", latest.data.started_at) : { data: [], error: null },
    db.from("social_latest_days").select("platform,day,read_at,views,reach,interactions,profile_visits,link_clicks,followers,followers_gained").gte("day", first).lte("day", today),
    all((from, to) => db.from("social_daily_snapshots").select("platform,day,followers").gte("day", first).lte("day", today)
      .not("followers", "is", null).order("read_at", { ascending: false }).order("platform").order("day").range(from, to), "followers"),
    db.from("social_posts").select("*").order("published_at", { ascending: false }).order("platform").order("post_id").limit(MAX_POSTS),
    all((from, to) => db.rpc("admin_social_attribution", { p_day: today }).order("platform").order("post_id").range(from, to), "post attribution"),
    db.rpc("admin_social_email", { p_day: today }).single(),
    db.from("social_latest_audience").select("platform,dimension,label,unit,value"),
  ]);

  const savedPosts = must(posts, "social posts");
  const reads = await all((from, to) => db.from("social_post_milestone_reads")
    .select("platform,post_id,read_at,views,reach,likes,comments,saves,shares,follows,watch_seconds,watch_percent")
    .gte("read_at", savedPosts.at(-1)?.published_at ?? now.toISOString())
    .order("read_at").order("platform").order("post_id").range(from, to), "post snapshots");
  const followerCounts = new Map<string, number>();
  for (const row of followers) {
    const key = `${row.platform}/${row.day}`;
    if (row.followers != null && !followerCounts.has(key)) followerCounts.set(key, row.followers);
  }
  // View columns are typed nullable by Postgres. Identity columns come from primary keys.
  const days = must(daily, "account snapshots").flatMap((row) => row.platform && row.day && row.read_at
    ? [{ ...row, platform: row.platform, day: row.day, read_at: row.read_at, followers: followerCounts.get(`${row.platform}/${row.day}`) ?? null }]
    : []);
  return {
    today, accounts: must(accounts, "social accounts"), status: must(status, "refresh outcomes"),
    latestRefresh: latest.data?.started_at ?? null, days, posts: savedPosts,
    configured: new Set(configuredAdapters().flatMap((adapter) => adapter.kind === "connected" ? [adapter.platform] : [])),
    reads: reads.flatMap((row) => row.platform && row.post_id && row.read_at
      ? [{ ...row, platform: row.platform, post_id: row.post_id, read_at: row.read_at }] : []),
    attribution, email: email.error ? null : email.data,
    audience: must(audience, "audience reports").flatMap((row) => row.platform && row.dimension && row.label && row.unit && row.value != null
      ? [{ platform: row.platform, dimension: row.dimension, label: row.label, unit: row.unit, value: row.value }] : []),
  };
}

export async function runSocialRefresh(now: Date) {
  const db = adminClient();
  if (!db) throw new Error("Social storage unavailable.");
  const signal = () => AbortSignal.timeout(12_000);
  const store: SocialWriteStore = {
    async claim(readAt) {
      return must(await db.rpc("claim_social_refresh", { p_started_at: readAt }).abortSignal(signal()), "refresh lock");
    },
    async save(platform, readAt, pull) {
      const { error } = await db.rpc("save_social_pull", {
        p_platform: platform, p_account_id: pull.account.id, p_name: pull.account.name, p_read_at: readAt,
        p_posts: pull.posts, p_post_reads: pull.postReads, p_days: pull.days, p_audience: pull.audience,
      }).abortSignal(signal());
      if (error) throw new Error("Social snapshot write failed.");
    },
    async record(readAt, result) {
      const { error } = await db.from("social_refresh_results").insert({ ...result, started_at: readAt }).abortSignal(signal());
      if (error) throw new Error("Social refresh outcome write failed.");
    },
  };
  return refreshSocial(store, configuredAdapters(), now);
}

export async function saveSocialTracking(platform: string, postId: string, tracking: { utm_content: string | null; utm_campaign: string | null }) {
  const db = adminClient();
  if (!db) return "unavailable";
  const { data, error } = await db.from("social_posts").update(tracking).eq("platform", platform).eq("post_id", postId)
    .select("post_id").abortSignal(AbortSignal.timeout(12_000)).maybeSingle();
  if (error?.code === "23505") return "duplicate";
  if (error) return "unavailable";
  return data ? "saved" : "missing";
}

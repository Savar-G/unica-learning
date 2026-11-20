import type { Database, Tables } from "@/lib/database.types";
import {
  compareSocialWeeks, EMPTY_ATTRIBUTION, pickSocialMilestones, SOCIAL_LABELS, socialPostKey, sumReported,
  type DailyMetric, type SocialAttribution, type SocialPlatform,
} from "@/lib/social-metrics";

export type AttributionRow = Database["public"]["Functions"]["admin_social_attribution"]["Returns"][number];
export type EmailCounts = Database["public"]["Functions"]["admin_social_email"]["Returns"][number];
type DailyRead = Omit<Tables<"social_daily_snapshots">, "raw">;
type MilestoneRead = Omit<Tables<"social_post_snapshots">, "raw">;

export interface SocialDashboardInput {
  today: string;
  configured: ReadonlySet<SocialPlatform>;
  accounts: Tables<"social_accounts">[];
  status: Tables<"social_refresh_results">[];
  latestRefresh: string | null;
  days: DailyRead[];
  posts: Tables<"social_posts">[];
  reads: MilestoneRead[];
  attribution: AttributionRow[];
  email: EmailCounts | null;
  audience: Omit<Tables<"social_audience_snapshots">, "read_at">[];
}

export const POST_SORTS = {
  recent: "Newest", views: "Views", watch: "Avg. watch time", saves: "Saves + shares", signups: "Signups",
};
export type SocialSort = keyof typeof POST_SORTS;
export const isSocialSort = (input: unknown): input is SocialSort =>
  typeof input === "string" && Object.hasOwn(POST_SORTS, input);

export function socialDashboard(input: SocialDashboardInput, sort: SocialSort) {
  const channels = (Object.keys(SOCIAL_LABELS) as SocialPlatform[]).map((platform) => {
    const history = input.days.filter((row) => row.platform === platform);
    return {
      platform,
      label: SOCIAL_LABELS[platform],
      account: input.accounts.find((row) => row.platform === platform),
      status: input.status.find((row) => row.platform === platform),
      configured: input.configured.has(platform),
      ...compareSocialWeeks(history, input.today),
    };
  });

  function combined(window: "current" | "previous", metric: DailyMetric) {
    const reported = channels.flatMap((channel) => channel[window][metric] ?? []);
    const value = sumReported(reported.map((row) => row.value));
    return value == null ? null : {
      value,
      channels: reported.length,
      days: reported.reduce((sum, row) => sum + row.days, 0),
      net: reported.some((row) => row.net),
    };
  }

  const reads = new Map<string, MilestoneRead[]>();
  for (const read of input.reads) {
    const key = socialPostKey(read);
    const bucket = reads.get(key) ?? [];
    bucket.push(read);
    reads.set(key, bucket);
  }
  const attribution = new Map(input.attribution.map((row) => [socialPostKey(row), row]));
  const posts = input.posts.map((post) => {
    const key = socialPostKey(post);
    const result = attribution.get(key);
    return {
      ...post,
      key,
      ...pickSocialMilestones(post.published_at, reads.get(key) ?? []),
      attribution: post.utm_content ? result ?? EMPTY_ATTRIBUTION : null,
    };
  });

  function rank(post: typeof posts[number]) {
    const read = post.at7d ?? post.at48h;
    switch (sort) {
      case "views": return read?.views;
      case "watch": return read?.watch_seconds;
      case "saves": return sumReported([read?.saves, read?.shares]);
      case "signups": return post.attribution?.signups;
      case "recent": return null;
    }
  }
  posts.sort((a, b) => {
    const left = rank(a);
    const right = rank(b);
    if (left != null && right != null && left !== right) return right - left;
    if (left != null && right == null) return -1;
    if (right != null && left == null) return 1;
    return Date.parse(b.published_at) - Date.parse(a.published_at) || a.key.localeCompare(b.key);
  });

  return {
    channels, combined, posts, sort,
    latestRefresh: input.latestRefresh,
    funnel: input.attribution.reduce<SocialAttribution>((total, row) => ({
      visits: total.visits + row.week_visits, signups: total.signups + row.week_signups,
      checks: total.checks + row.week_checks, cards: total.cards + row.week_cards,
    }), EMPTY_ATTRIBUTION),
    email: input.email,
    audience: input.audience,
  };
}

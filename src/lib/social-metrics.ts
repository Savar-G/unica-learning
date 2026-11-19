import { adVisitTag } from "@/lib/ad-visits";
import type { Tables } from "@/lib/database.types";
import { addDays, localDay, PACIFIC_ZONE } from "@/lib/family-time";

export const SOCIAL_LABELS = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export type SocialPlatform = keyof typeof SOCIAL_LABELS;
export type ConnectedPlatform = "youtube" | "instagram" | "facebook";
export const isConnectedPlatform = (value: unknown): value is ConnectedPlatform =>
  value === "youtube" || value === "instagram" || value === "facebook";

export type SocialPost = Tables<"social_posts">;
export type SocialPostRead = Omit<Tables<"social_post_snapshots">, "platform" | "read_at">;
export type SocialDay = Omit<Tables<"social_daily_snapshots">, "platform" | "read_at">;
export type SocialAudience = Omit<Tables<"social_audience_snapshots">, "platform" | "read_at">;

export interface SocialPull {
  account: { id: string; name: string };
  posts: Omit<SocialPost, "platform" | "utm_content" | "utm_campaign">[];
  postReads: SocialPostRead[];
  days: SocialDay[];
  audience: SocialAudience[];
  warnings: string[];
}

export type SocialAdapter =
  | { platform: ConnectedPlatform; kind: "not-connected" }
  | { platform: ConnectedPlatform; kind: "connected"; pull(now: Date): Promise<SocialPull> };

export type RefreshResult = {
  platform: ConnectedPlatform;
  status: "ok" | "partial" | "failed" | "not-connected";
  message: string | null;
};

export interface SocialWriteStore {
  claim(readAt: string): Promise<boolean>;
  save(platform: ConnectedPlatform, readAt: string, pull: SocialPull): Promise<void>;
  record(readAt: string, result: RefreshResult): Promise<void>;
}

/** Only these fixed labels and HTTP status codes may enter the run log. */
export class SocialReadError extends Error {
  constructor(area: string, status: number, readonly code?: number) {
    super(`${area} returned HTTP ${status}.`);
  }
}

export async function refreshSocial(store: SocialWriteStore, adapters: SocialAdapter[], now: Date) {
  const readAt = now.toISOString();
  if (!await store.claim(readAt)) return { kind: "cooldown" } as const;
  const results = await Promise.allSettled(adapters.map(async (adapter) => {
    let result: RefreshResult = { platform: adapter.platform, status: "not-connected", message: null };
    if (adapter.kind === "connected") {
      try {
        const pull = await adapter.pull(now);
        await store.save(adapter.platform, readAt, pull);
        result = pull.warnings.length
          ? { ...result, status: "partial", message: [...new Set(pull.warnings)].slice(0, 8).join(" ") }
          : { ...result, status: "ok" };
      } catch (error) {
        const message = error instanceof SocialReadError ? error.message : "Could not read or save insights. Try again.";
        result = { ...result, status: "failed", message };
      }
    }
    await store.record(readAt, result);
    return result;
  }));
  if (results.some((result) => result.status === "rejected")) throw new Error("Could not record all social refresh results.");
  return { kind: "done", results: results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []) } as const;
}

export const socialDay = (now: Date) => localDay(now, PACIFIC_ZONE);
export const DAILY_METRICS = ["views", "reach", "interactions", "profile_visits", "link_clicks", "followers_gained"] as const;
export type DailyMetric = typeof DAILY_METRICS[number];
type DayRead = Omit<SocialDay, "raw"> & { read_at: string };
export type WeeklyValue = { value: number; days: number; net?: true } | null;
export type SocialWeek = Record<DailyMetric, WeeklyValue>;
const DURATION_MS = 86_400_000;

export function sumReported(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function compareSocialWeeks(rows: readonly DayRead[], today: string) {
  const days = new Map<string, DayRead>();
  for (const row of rows) {
    const previous = days.get(row.day);
    if (!previous || Date.parse(previous.read_at) < Date.parse(row.read_at)) days.set(row.day, row);
  }
  function week(offset: number): SocialWeek {
    const end = addDays(today, offset);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(end, i - 7));
    function total(metric: DailyMetric): WeeklyValue {
      const values = dates.flatMap((day) => {
        const value = days.get(day)?.[metric];
        return value == null ? [] : [value];
      });
      return values.length ? { value: values.reduce((sum, value) => sum + value, 0), days: values.length } : null;
    }
    const startFollowers = days.get(dates[0])?.followers;
    const endFollowers = days.get(end)?.followers;
    const reported = total("followers_gained");
    const net = startFollowers != null && endFollowers != null ? { value: endFollowers - startFollowers, days: 7, net: true as const } : null;
    return {
      views: total("views"),
      reach: total("reach"),
      interactions: total("interactions"),
      profile_visits: total("profile_visits"),
      link_clicks: total("link_clicks"),
      followers_gained: reported ?? net,
    };
  }
  return { current: week(0), previous: week(-7) };
}

export function pickSocialMilestones<T extends { read_at: string }>(publishedAt: string, reads: readonly T[]) {
  const published = Date.parse(publishedAt);
  const pick = (days: number) => {
    const target = published + days * DURATION_MS;
    const distance = (row: T) => Math.abs(Date.parse(row.read_at) - target);
    return reads.filter((row) => distance(row) <= DURATION_MS)
      .sort((a, b) => distance(a) - distance(b) || Date.parse(a.read_at) - Date.parse(b.read_at))[0] ?? null;
  };
  return { at48h: pick(2), at7d: pick(7) };
}

export type SocialAttribution = { visits: number; signups: number; checks: number; cards: number };
export const EMPTY_ATTRIBUTION: SocialAttribution = { visits: 0, signups: 0, checks: 0, cards: 0 };
export const socialPostKey = ({ platform, post_id }: Pick<SocialPost, "platform" | "post_id">) => `${platform}/${post_id}`;

export function socialTracking(input: { content: unknown; campaign: unknown }) {
  if (typeof input.content !== "string" || typeof input.campaign !== "string") return null;
  const content = input.content.trim();
  const campaign = input.campaign.trim();
  const utm_content = adVisitTag(content);
  const utm_campaign = adVisitTag(campaign);
  if ((utm_content ?? "") !== content || (utm_campaign ?? "") !== campaign || (!utm_content && utm_campaign)) return null;
  return { utm_content, utm_campaign };
}

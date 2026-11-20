import { describe, expect, it, vi } from "vitest";
import { dayRead } from "@/lib/social-api";
import { socialDashboard, type SocialDashboardInput } from "@/lib/social-dashboard";
import {
  compareSocialWeeks, pickSocialMilestones, refreshSocial, socialTracking,
  type RefreshResult, type SocialPull, type SocialWriteStore,
} from "@/lib/social-metrics";

const NOW = new Date("2026-11-19T16:00:00Z");
const read_at = NOW.toISOString();

describe("social snapshots", () => {
  it("uses two full disjoint weeks, the latest read of a day, and keeps unknown separate from zero", () => {
    const row = (day: string, views: number, read = read_at) => ({ ...dayRead(day, { views }), read_at: read });
    const weeks = compareSocialWeeks([
      row("2026-11-04", 1000), row("2026-11-05", 3), row("2026-11-11", 7),
      row("2026-11-12", 10), row("2026-11-12", 90, "2026-11-18T16:00:00Z"),
      row("2026-11-18", 0), row("2026-11-19", 900),
    ], "2026-11-19");
    expect(weeks.current.views).toEqual({ value: 10, days: 2 });
    expect(weeks.previous.views).toEqual({ value: 10, days: 2 });
    expect(weeks.current.reach).toBeNull();
  });

  it("can report net follower growth using counts at the two boundaries", () => {
    const rows = [
      { ...dayRead("2026-11-12", { followers: 18 }), read_at },
      { ...dayRead("2026-11-19", { followers: 17 }), read_at },
    ];
    expect(compareSocialWeeks(rows, "2026-11-19").current.followers_gained).toEqual({ value: -1, days: 7, net: true });
  });

  it("picks the nearest actual 48-hour and 7-day reads and leaves misses empty", () => {
    const rows = ["2026-11-02T00:00:00Z", "2026-11-03T02:00:00Z", "2026-11-07T23:00:00Z", "2026-11-10T00:00:00Z"]
      .map((read_at) => ({ read_at }));
    expect(pickSocialMilestones("2026-11-01T00:00:00Z", rows)).toEqual({ at48h: rows[1], at7d: rows[2] });
    expect(pickSocialMilestones("2026-10-01T00:00:00Z", rows)).toEqual({ at48h: null, at7d: null });
  });
});

class MemorySocialStore implements SocialWriteStore {
  private started: string[] = [];
  readonly snapshots: { platform: string; readAt: string; pull: SocialPull }[] = [];
  readonly results: RefreshResult[] = [];
  async claim(readAt: string) {
    if (this.started.some((at) => Date.parse(readAt) - Date.parse(at) < 600_000)) return false;
    this.started.push(readAt);
    return true;
  }
  async save(platform: string, readAt: string, pull: SocialPull) { this.snapshots.push({ platform, readAt, pull }); }
  async record(_readAt: string, result: RefreshResult) { this.results.push(result); }
}

describe("social refresh", () => {
  it("preserves reads after an independent provider fails, skips missing credentials, and admits one refresh", async () => {
    const store = new MemorySocialStore();
    const good = vi.fn(async (): Promise<SocialPull> => ({
      account: { id: "channel", name: "YouTube" },
      days: [dayRead("2026-11-18", { views: 20 })],
      posts: [], postReads: [], audience: [], warnings: [],
    }));
    const failed = vi.fn(async () => { throw new Error("sensitive provider response"); });
    const run = (now: Date) => refreshSocial(store, [
      { platform: "youtube", kind: "connected", pull: good },
      { platform: "instagram", kind: "connected", pull: failed },
      { platform: "facebook", kind: "not-connected" },
    ], now);
    const results = await Promise.all([run(NOW), run(NOW)]);
    expect(results.map((result) => result.kind)).toEqual(["done", "cooldown"]);
    expect(good).toHaveBeenCalledWith(NOW);
    expect(store.results).toEqual(expect.arrayContaining([
      { platform: "youtube", status: "ok", message: null },
      { platform: "instagram", status: "failed", message: "Could not read or save insights. Try again." },
      { platform: "facebook", status: "not-connected", message: null },
    ]));
    await run(new Date(NOW.getTime() + 600_000));
    expect(store.snapshots.map((row) => row.readAt)).toEqual([read_at, "2026-11-19T16:10:00.000Z"]);
  });
});

describe("social attribution and dashboard", () => {
  it("uses the platform and post ID to attach aggregate UTM results and sorts by signups", () => {
    const shared = { post_id: "same-id", permalink: "https://example.com/p", format: "Video", caption: "", published_at: "2026-11-12T00:00:00Z", utm_content: "post", utm_campaign: null };
    const input: SocialDashboardInput = {
      today: "2026-11-19", configured: new Set(["youtube"]), accounts: [], status: [], latestRefresh: null,
      posts: [{ ...shared, platform: "youtube" }, { ...shared, platform: "instagram", utm_campaign: "holiday" }, { ...shared, platform: "facebook", utm_content: null }],
      days: [], reads: [], audience: [], email: null,
      attribution: [
        { platform: "youtube", post_id: "same-id", visits: 4, signups: 1, checks: 1, cards: 1, week_visits: 1, week_signups: 1, week_checks: 1, week_cards: 1 },
        { platform: "instagram", post_id: "same-id", visits: 10, signups: 6, checks: 2, cards: 1, week_visits: 7, week_signups: 2, week_checks: 1, week_cards: 0 },
      ],
    };
    const result = socialDashboard(input, "signups");
    expect(result.posts.map((post) => [post.platform, post.attribution?.signups])).toEqual([
      ["instagram", 6], ["youtube", 1], ["facebook", undefined],
    ]);
    expect(result.funnel).toEqual({ visits: 8, signups: 3, checks: 2, cards: 1 });
    expect(result.channels.find((channel) => channel.platform === "tiktok")?.configured).toBe(false);
  });

  it("validates exact tags and permits clearing both fields", () => {
    expect(socialTracking({ content: " post-2 ", campaign: "organic" })).toEqual({ utm_content: "post-2", utm_campaign: "organic" });
    expect(socialTracking({ content: "", campaign: "" })).toEqual({ utm_content: null, utm_campaign: null });
    expect(socialTracking({ content: "", campaign: "organic" })).toBeNull();
    expect(socialTracking({ content: "post", campaign: "Fall launch" })).toMatchObject({ utm_campaign: "Fall launch" });
    expect(socialTracking({ content: "x\u0000y", campaign: "" })).toBeNull();
  });
});

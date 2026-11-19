import { describe, expect, it, vi } from "vitest";
import { metaAdapter } from "@/lib/social-meta";

const now = new Date("2026-11-19T16:00:00Z");
const credentials = { token: "fixture", pageId: "100", instagramId: "200" };
const lifetime = (name: string, value: number) => ({ name, values: [{ value }] });
const daily = (name: string, value: number) => ({ name, values: [{ value, end_time: "2026-11-19T08:00:00+0000" }] });
const total = (name: string, value: number) => ({ name, total_value: { value } });

describe("Meta adapters", () => {
  it("does not call Graph without a token", () => {
    const get = vi.fn<typeof fetch>();
    expect(metaAdapter("instagram", { instagramId: "200" }, get)).toEqual({ platform: "instagram", kind: "not-connected" });
    expect(get).not.toHaveBeenCalled();
  });

  it("reads Instagram native views, per-day totals and eligible follower demographics", async () => {
    const get = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(init?.headers).toEqual({ Authorization: "Bearer fixture" });
      if (url.pathname.endsWith("/200")) return Response.json({ id: "200", username: "fixture", followers_count: 130 });
      if (url.pathname.endsWith("/media")) return Response.json({ data: [{
        id: "ig1", timestamp: "2026-11-18T12:34:12+0000", permalink: "https://www.instagram.com/reel/ig1/",
        caption: "First line\nRemainder", media_type: "VIDEO", media_product_type: "REELS", like_count: 4, comments_count: 1,
      }] });
      const metric = url.searchParams.get("metric") ?? "";
      if (url.pathname.endsWith("/ig1/insights")) {
        expect(metric).toBe("views,reach,shares,saved,follows,ig_reels_avg_watch_time");
        return Response.json({ data: [
          lifetime("views", 88), lifetime("reach", 63), lifetime("shares", 8), lifetime("saved", 3),
          lifetime("follows", 2), lifetime("ig_reels_avg_watch_time", 10300),
        ] });
      }
      if (metric === "follower_demographics") {
        return Response.json({ data: [{ name: metric, total_value: { breakdowns: [{
          results: [{ dimension_values: [url.searchParams.get("breakdown") === "age" ? "25-34" : "CA"], value: 25 }],
        }] } }] });
      }
      if (metric === "follows_and_unfollows") {
        return Response.json({ data: [{ name: metric, total_value: { breakdowns: [{
          results: [{ dimension_values: ["FOLLOWER"], value: 7 }, { dimension_values: ["NON_FOLLOWER"], value: 3 }],
        }] } }] });
      }
      expect(url.searchParams.get("metric_type")).toBe("total_value");
      expect(metric).toBe("views,reach,total_interactions,profile_views,profile_links_taps");
      return Response.json({ data: [total("views", 120), total("reach", 80), total("profile_links_taps", 4)] });
    });
    const adapter = metaAdapter("instagram", credentials, get);
    if (adapter.kind !== "connected") throw new Error("Missing fixture credentials");
    const output = await adapter.pull(now);
    expect(output.warnings).toEqual([]);
    expect(output.posts).toMatchObject([{ post_id: "ig1", caption: "First line", format: "Reel" }]);
    expect(output.postReads).toMatchObject([{ views: 88, reach: 63, saves: 3, shares: 8, follows: 2, watch_seconds: 10.3 }]);
    expect(output.days).toHaveLength(15);
    expect(output.days[0]).toMatchObject({ views: 120, reach: 80, link_clicks: 4, followers_gained: 7 });
    expect(output.audience).toMatchObject([{ dimension: "age", label: "25-34" }, { dimension: "country", label: "CA" }]);
  });

  it("keeps Facebook view and unique viewer metrics when a Page metric is rejected", async () => {
    const get = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toContain("/v26.0/");
      const metrics = url.searchParams.get("metric") ?? "";
      if (url.pathname.endsWith("/100")) return Response.json({ id: "100", name: "Facebook fixture", followers_count: 95 });
      if (url.pathname.endsWith("/published_posts")) return Response.json({ data: [{
        id: "100_1", created_time: "2026-11-18T15:10:00+0000", permalink_url: "https://www.facebook.com/reel/1/",
        reactions: { summary: { total_count: 4 } }, comments: { summary: { total_count: 1 } }, shares: { count: 2 },
        attachments: { data: [{ media_type: "video", target: { id: "1" } }] },
      }] });
      if (url.pathname.endsWith("/1/video_insights")) {
        return Response.json({ data: [lifetime("post_video_avg_time_watched", 5250), lifetime("post_video_followers", 2)] });
      }
      if (url.pathname.endsWith("/100_1/insights")) {
        expect(metrics).toBe("post_media_view,post_total_media_view_unique");
        return Response.json({ data: [lifetime("post_media_view", 12), lifetime("post_total_media_view_unique", 10)] });
      }
      if (metrics.includes("page_views_total")) return Response.json({ error: { code: 100 } }, { status: 400 });
      return Response.json({ data: [
        ...(metrics === "page_media_view" ? [daily(metrics, 80)] : []),
        ...(metrics === "page_total_media_view_unique" ? [daily(metrics, 70)] : []),
      ] });
    });
    const adapter = metaAdapter("facebook", credentials, get);
    if (adapter.kind !== "connected") throw new Error("Missing fixture credentials");
    const output = await adapter.pull(now);
    expect(output.days).toMatchObject([{ day: "2026-11-18", views: 80, reach: 70, profile_visits: null }, { followers: 95 }]);
    expect(output.postReads).toMatchObject([{ views: 12, reach: 10, likes: 4, shares: 2, watch_seconds: 5.25, follows: 2 }]);
    expect(output.warnings).toEqual(["Facebook daily insights returned HTTP 400."]);
    expect(output.audience).toEqual([]);
  });
});

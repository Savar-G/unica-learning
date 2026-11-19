import { expect, it, vi } from "vitest";
import { youtubeAdapter } from "@/lib/social-youtube";

it("reads analytics for public uploads and keeps Data API counts when Analytics lags", async () => {
  const report = (fields: string[], rows: (string | number)[][]) =>
    Response.json({ columnHeaders: fields.map((name) => ({ name })), rows });
  const get = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const { pathname, searchParams } = url;
    if (pathname === "/token") {
      expect(init?.method).toBe("POST");
      expect(init?.body instanceof URLSearchParams && init.body.get("grant_type")).toBe("refresh_token");
      return Response.json({ access_token: "authenticated-fixture" });
    }
    expect(init?.headers).toEqual({ Authorization: "Bearer authenticated-fixture" });
    if (pathname.endsWith("/channels")) return Response.json({
      items: [{ id: "c", snippet: { title: "Fixture" }, contentDetails: { relatedPlaylists: { uploads: "p" } }, statistics: { subscriberCount: "80" } }],
    });
    if (pathname.endsWith("/playlistItems")) return Response.json({
      items: ["public", "private"].map((videoId) => ({ contentDetails: { videoId, videoPublishedAt: "2026-11-18T11:00:00Z" } })),
    });
    if (pathname.endsWith("/videos")) return Response.json({
      items: ["public", "private"].map((privacyStatus) => ({
        id: privacyStatus, status: { privacyStatus }, snippet: { title: "Example", publishedAt: "2026-11-18T11:00:00Z" },
        statistics: { viewCount: "66", likeCount: "2" },
      })),
    });
    switch (searchParams.get("dimensions")) {
      case "day": return report(["day", "views", "likes", "comments", "shares", "subscribersGained"], [["2026-11-18", 21, 3, 1, 2, 1]]);
      case "video":
        expect(searchParams.get("filters")).toBe("video==public");
        return report(["video", "views", "averageViewDuration", "averageViewPercentage", "shares"], [["public", 40, 17.3, 82, 3]]);
      case "ageGroup,gender": return report(["ageGroup", "gender", "viewerPercentage"], [["age25-34", "female", 45]]);
      case "country": return report(["country", "views"], [["CA", 33]]);
      default: return report(["insightTrafficSourceType", "views"], [["SHORTS", 52]]);
    }
  });
  const adapter = youtubeAdapter({ clientId: "fixture", clientSecret: "fixture", refreshToken: "fixture" }, get);
  if (adapter.kind !== "connected") throw new Error("Missing fixture credentials");
  const output = await adapter.pull(new Date("2026-11-19T16:00:00Z"));
  expect(output.posts.map((post) => post.post_id)).toEqual(["public"]);
  expect(output.postReads).toMatchObject([{ views: 66, likes: 2, watch_seconds: 17.3, watch_percent: 82, shares: 3 }]);
  expect(output.days).toMatchObject([{ day: "2026-11-18", views: 21, interactions: 6, followers_gained: 1 }, { followers: 80 }]);
  expect(output.audience.map((row) => row.dimension)).toEqual(["age", "country", "traffic source"]);
  expect(output.warnings).toEqual([]);
});

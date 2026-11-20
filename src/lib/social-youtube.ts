import { addDays } from "@/lib/family-time";
import { dayRead, line, list, number, object, postRead, readInBatches, requestSocialJson, words } from "@/lib/social-api";
import { socialDay, sumReported, type SocialAdapter, type SocialAudience, type SocialPull } from "@/lib/social-metrics";
import type { Json } from "@/lib/database.types";

type YouTubeCredentials = { clientId?: string; clientSecret?: string; refreshToken?: string };
const DATA = "https://www.googleapis.com/youtube/v3/";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const RECENT_DAYS = 30;
const VIDEO_METRICS = ["views", "averageViewDuration", "averageViewPercentage", "likes", "comments", "shares", "subscribersGained"];
const DAY_METRICS = ["views", "likes", "comments", "shares", "subscribersGained", "subscribersLost"];

export function youtubeAdapter(config: YouTubeCredentials, doFetch: typeof fetch = fetch): SocialAdapter {
  const { clientId, clientSecret, refreshToken } = config;
  if (!clientId || !clientSecret || !refreshToken) return { platform: "youtube", kind: "not-connected" };

  return {
    platform: "youtube", kind: "connected",
    async pull(now) {
      const lifetime = AbortSignal.timeout(180_000);
      const oauth = await requestSocialJson(doFetch, "YouTube authorization", new URL("https://oauth2.googleapis.com/token"), {
        method: "POST", body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token",
        }),
        signal: lifetime,
      });
      const token = words(oauth.access_token);
      if (!token) throw new Error("Missing access token");
      const get = (area: string, base: string, params: Record<string, string>) => {
        const url = new URL(base);
        url.search = new URLSearchParams(params).toString();
        return requestSocialJson(doFetch, `YouTube ${area}`, url, { headers: { Authorization: `Bearer ${token}` }, signal: lifetime });
      };
      const channels = await get("channel", DATA + "channels", { mine: "true", part: "snippet,contentDetails,statistics" });
      const channel = object(list(channels.items)[0]);
      const id = words(channel.id);
      const playlist = words(object(object(channel.contentDetails).relatedPlaylists).uploads);
      if (!id || !playlist) throw new Error("YouTube channel missing");
      const today = socialDay(now);
      const endDate = addDays(today, -1);
      const fromDay = addDays(today, -RECENT_DAYS);
      const warnings: string[] = [];
      const report = async (area: string, dimensions: string, metrics: string[], options: Record<string, string> = {}) => {
        try {
          const result = await get(area, ANALYTICS, { ids: "channel==MINE", startDate: fromDay, endDate, dimensions, metrics: metrics.join(","), ...options });
          const fields = list(result.columnHeaders).map((field) => words(object(field).name));
          return list(result.rows).map((row) => Object.fromEntries(list(row).map((value, i): [string, Json] => [fields[i], value])));
        } catch {
          warnings.push(`YouTube ${area} is unavailable.`);
          return [];
        }
      };

      const uploads = async () => {
        const ids: string[] = [];
        let pageToken = "";
        do {
          const result = await get("uploads", DATA + "playlistItems", {
            playlistId: playlist, part: "contentDetails", maxResults: "50", ...(pageToken ? { pageToken } : {}),
          });
          const rows = list(result.items).map((row) => object(object(row).contentDetails));
          for (const row of rows) {
            const video = words(row.videoId);
            if (video && words(row.videoPublishedAt) >= fromDay) ids.push(video);
          }
          // Uploads playlist is in newest-first order.
          if (rows.some((row) => words(row.videoPublishedAt) && words(row.videoPublishedAt) < fromDay)) break;
          pageToken = words(result.nextPageToken);
        } while (pageToken);
        return ids;
      };
      const [ids, days, ages, countries, sources] = await Promise.all([
        uploads(),
        report("daily activity", "day", DAY_METRICS, { startDate: addDays(today, -14) }),
        report("demographics", "ageGroup,gender", ["viewerPercentage"]),
        report("countries", "country", ["views"], { sort: "-views", maxResults: "20" }),
        report("traffic sources", "insightTrafficSourceType", ["views"]),
      ]);
      const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50));

      const videos = await readInBatches(chunks, 3, async (batch) => {
        const result = await get("video statistics", DATA + "videos", { id: batch.join(","), part: "snippet,statistics,status" });
        const publicVideos = list(result.items).map(object).filter((video) => object(video.status).privacyStatus === "public");
        if (!publicVideos.length) return [];
        const analytics = await report("video analytics", "video", VIDEO_METRICS, {
          filters: `video==${publicVideos.map((video) => words(video.id)).join(",")}`, sort: "-views", maxResults: "50",
        });
        const byId = new Map(analytics.map((row) => [words(row.video), row]));
        return publicVideos.map((video) => ({ video, analytics: byId.get(words(video.id)) ?? {} }));
      });

      const stats = object(channel.statistics);
      const pull: SocialPull = {
        account: { id, name: words(object(channel.snippet).title) || "YouTube" },
        posts: [],
        postReads: [],
        days: days.flatMap((row) => typeof row.day === "string" ? [dayRead(row.day, {
          views: number(row.views),
          interactions: sumReported([number(row.likes), number(row.comments), number(row.shares)]),
          followers_gained: number(row.subscribersGained),
          raw: row,
        })] : []),
        audience: [
          ...audienceRows(ages, "age", "viewerPercentage", (row) => `${words(row.ageGroup).replace(/^age/, "")} · ${words(row.gender)}`, "percent"),
          ...audienceRows(countries, "country", "views", (row) => words(row.country), "views"),
          ...audienceRows(sources, "traffic source", "views", (row) => words(row.insightTrafficSourceType), "views"),
        ],
        warnings,
      };
      pull.days.push(dayRead(today, { followers: stats.hiddenSubscriberCount === true ? null : number(stats.subscriberCount), raw: stats }));
      for (const { video, analytics } of videos.flat()) {
        const post_id = words(video.id);
        const snippet = object(video.snippet);
        const published_at = words(snippet.publishedAt);
        if (!post_id || !Number.isFinite(Date.parse(published_at))) continue;
        const statistics = object(video.statistics);
        pull.posts.push({
          post_id, published_at, permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(post_id)}`,
          format: "Video", caption: line(snippet.description) || line(snippet.title),
        });
        pull.postReads.push(postRead(post_id, {
          views: number(statistics.viewCount) ?? number(analytics.views),
          likes: number(statistics.likeCount) ?? number(analytics.likes),
          comments: number(statistics.commentCount) ?? number(analytics.comments),
          shares: number(analytics.shares),
          follows: number(analytics.subscribersGained),
          watch_seconds: number(analytics.averageViewDuration),
          watch_percent: number(analytics.averageViewPercentage),
          raw: { statistics, analytics },
        }));
      }
      return pull;
    },
  };
}

function audienceRows(
  rows: Record<string, Json>[], dimension: string, metric: string,
  labelFor: (row: Record<string, Json>) => string, unit: string,
): SocialAudience[] {
  return rows.flatMap((row) => {
    const label = labelFor(row);
    const value = number(row[metric]);
    return label && value != null ? [{ dimension, label, value, unit }] : [];
  });
}

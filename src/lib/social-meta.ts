import type { Json } from "@/lib/database.types";
import { addDays, localDateTime, PACIFIC_ZONE } from "@/lib/family-time";
import { dayRead, line, list, number, object, postRead, readInBatches, requestSocialJson, words } from "@/lib/social-api";
import { socialDay, SocialReadError, type SocialAdapter, type SocialAudience, type SocialPull } from "@/lib/social-metrics";

type MetaCredentials = { token?: string; pageId?: string; instagramId?: string };
type MetaPlatform = "instagram" | "facebook";
const GRAPH = "https://graph.facebook.com/v26.0/";
const IG_DAILY = ["views", "reach", "total_interactions", "profile_views", "profile_links_taps"];
const FB_DAILY = ["page_media_view", "page_total_media_view_unique", "page_post_engagements", "page_views_total", "page_total_actions", "page_follows", "page_daily_follows"];
const IG_POST = ["views", "reach", "shares", "saved", "follows"];
const FB_POST = ["post_media_view", "post_total_media_view_unique"];

const value = (metric: Json | undefined) =>
  object(object(metric).total_value).value ?? object(list(object(metric).values)[0]).value;

function totals(rows: Json[]): Record<string, Json | undefined> {
  return Object.fromEntries(rows.flatMap((row) => {
    const metric = object(row);
    return typeof metric.name === "string" ? [[metric.name, metric]] : [];
  }));
}

function timestamp(day: string) {
  return String(Math.floor(localDateTime(day, PACIFIC_ZONE) / 1000));
}

function safePermalink(input: Json | undefined, platform: MetaPlatform) {
  try {
    const url = new URL(words(input));
    const allowed = platform === "instagram" ? ["instagram.com", "www.instagram.com"] : ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"];
    if (url.protocol !== "https:" || !allowed.includes(url.hostname) || url.username || url.password) return "";
    url.searchParams.delete("access_token");
    return url.href;
  } catch {
    return "";
  }
}

export function metaAdapter(platform: MetaPlatform, config: MetaCredentials, doFetch: typeof fetch = fetch): SocialAdapter {
  const { token } = config;
  const accountId = platform === "instagram" ? config.instagramId : config.pageId;
  if (!token || !accountId) return { platform, kind: "not-connected" };
  const instagram = platform === "instagram";
  const label = instagram ? "Instagram" : "Facebook";

  return {
    platform, kind: "connected",
    async pull(now) {
      const signal = AbortSignal.timeout(180_000);
      const today = socialDay(now);
      const start = addDays(today, -14);
      const postedSince = addDays(today, -30);
      const warnings = new Set<string>();
      const get = (area: string, path: string, params: Record<string, string>) => {
        const url = new URL(GRAPH + path);
        url.search = new URLSearchParams(params).toString();
        return requestSocialJson(doFetch, `${label} ${area}`, url, { headers: { Authorization: `Bearer ${token}` }, signal });
      };
      const account = await get("account", encodeURIComponent(accountId), {
        fields: instagram ? "id,username,followers_count" : "id,name,followers_count",
      });
      if (account.id !== accountId) throw new Error("Meta returned a different account");

      async function insights(area: string, id: string, metrics: string[], params: Record<string, string>, edge = "insights"): Promise<Record<string, Json | undefined>> {
        const read = async (names: string[]) => list((await get(area, `${encodeURIComponent(id)}/${edge}`, { metric: names.join(","), ...params })).data);
        try {
          return totals(await read(metrics));
        } catch (error) {
          // A metric can be retired or ineligible for this format. Graph rejects the entire set.
          if (error instanceof SocialReadError && error.code === 100 && metrics.length > 1) {
            const reads = await readInBatches(metrics, 3, (metric) => insights(area, id, [metric], params, edge));
            return Object.fromEntries(reads.flatMap((read) => Object.entries(read)));
          }
          if (!(error instanceof SocialReadError && error.code === 3006)) {
            warnings.add(error instanceof SocialReadError ? error.message : `${label} ${area} is unavailable.`);
          }
          return {};
        }
      }

      const readPosts = async () => {
        const fields = instagram
          ? "id,permalink,caption,timestamp,media_type,media_product_type,like_count,comments_count"
          : "id,permalink_url,message,created_time,shares,reactions.type(LIKE).limit(0).summary(true),comments.limit(0).summary(true),attachments{media_type,type,target}";
        const posts = new Map<string, ReturnType<typeof object>>();
        let after = "";
        do {
          const response = await get("posts", `${encodeURIComponent(accountId)}/${instagram ? "media" : "published_posts"}`, {
            fields, limit: "50", ...(after ? { after } : {}),
            ...(!instagram ? { since: timestamp(postedSince) } : {}),
          });
          const rows = list(response.data).map(object);
          for (const post of rows) {
            const id = words(post.id);
            const published = words(instagram ? post.timestamp : post.created_time);
            if (id && Number.isFinite(Date.parse(published)) && published >= postedSince) posts.set(id, post);
          }
          if (rows.some((row) => words(instagram ? row.timestamp : row.created_time) && words(instagram ? row.timestamp : row.created_time) < postedSince)) break;
          const paging = object(response.paging);
          const next = words(paging.next) ? words(object(paging.cursors).after) : "";
          if (next === after) break;
          after = next;
        } while (after);
        return [...posts.values()];
      };

      const readDays = async () => {
        if (instagram) {
          const dates = Array.from({ length: 14 }, (_, i) => addDays(start, i));
          const days = await readInBatches(dates, 5, async (day) => {
            const range = { period: "day", since: timestamp(day), until: timestamp(addDays(day, 1)) };
            const [row, follows] = await Promise.all([
              insights("daily insights", accountId, IG_DAILY, { ...range, metric_type: "total_value" }),
              insights("daily follows", accountId, ["follows_and_unfollows"], { ...range, metric_type: "total_value", breakdown: "follow_type" }),
            ]);
            const breakdown = list(object(object(follows.follows_and_unfollows).total_value).breakdowns).map(object);
            const follow = breakdown.flatMap((slice) => list(slice.results)).map(object)
              .find((row) => ["follow", "follower"].includes(words(list(row.dimension_values)[0]).toLowerCase()));
            return dayRead(day, {
              views: number(value(row.views)), reach: number(value(row.reach)),
              interactions: number(value(row.total_interactions)), profile_visits: number(value(row.profile_views)),
              link_clicks: number(value(row.profile_links_taps)), followers_gained: number(follow?.value),
              raw: { ...row, ...follows },
            });
          });
          return days.filter((day) => Object.keys(object(day.raw)).length > 0);
        }
        const rows = await insights("daily insights", accountId, FB_DAILY, { period: "day", since: timestamp(start), until: timestamp(today) });
        const byDay = new Map<string, Record<string, Json | undefined>>();
        for (const [name, metric] of Object.entries(rows)) {
          for (const entry of list(object(metric).values).map(object)) {
            const end = words(entry.end_time).slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
            const day = addDays(end, -1);
            if (day < start || day >= today) continue;
            const counts = byDay.get(day) ?? {};
            counts[name] = entry.value;
            byDay.set(day, counts);
          }
        }
        return [...byDay].map(([day, row]) => dayRead(day, {
          views: number(row.page_media_view), reach: number(row.page_total_media_view_unique),
          interactions: number(row.page_post_engagements), profile_visits: number(row.page_views_total),
          link_clicks: number(row.page_total_actions), followers: number(row.page_follows),
          followers_gained: number(row.page_daily_follows), raw: row,
        }));
      };

      const followers = number(account.followers_count);
      const readAudience = async (): Promise<SocialAudience[]> => {
        if (followers == null || followers < 100) return [];
        if (!instagram) {
          const result = await insights("audience countries", accountId, ["page_fans_country"], { period: "day", since: timestamp(addDays(today, -7)), until: timestamp(today) });
          const values = list(object(result.page_fans_country).values);
          return Object.entries(object(object(values.at(-1)).value)).flatMap(([label, entry]) => {
            const value = number(entry);
            return value == null ? [] : [{ dimension: "country", label, value, unit: "page likes" }];
          });
        }
        const dimensions = ["age", "country"];
        const reads = await Promise.all(dimensions.map(async (dimension) => {
          const row = await insights("audience demographics", accountId, ["follower_demographics"], {
            period: "lifetime", metric_type: "total_value", timeframe: "last_30_days", breakdown: dimension,
          });
          const slices = list(object(object(row.follower_demographics).total_value).breakdowns);
          return slices.flatMap((slice) => list(object(slice).results)).flatMap((entry) => {
            const row = object(entry);
            const label = words(list(row.dimension_values)[0]);
            const value = number(row.value);
            return label && value != null ? [{ dimension, label, value, unit: "followers" }] : [];
          });
        }));
        return reads.flat();
      };

      const [posts, days, audience] = await Promise.all([readPosts(), readDays(), readAudience()]);
      const pull: SocialPull = {
        account: { id: accountId, name: words(instagram ? account.username : account.name) || label },
        posts: [], postReads: [], days, audience, warnings: [],
      };
      days.push(dayRead(today, { followers, raw: { followers_count: followers } }));
      await readInBatches(posts, 4, async (post) => {
        const post_id = words(post.id);
        const attachment = object(list(object(post.attachments).data)[0]);
        const type = words(instagram ? post.media_type : attachment.media_type || attachment.type);
        const reel = post.media_product_type === "REELS" || type.toLowerCase().includes("reel") || words(post.permalink_url).includes("/reel/");
        const isVideo = reel || type.toLowerCase().includes("video");
        const format = reel ? "Reel" : isVideo ? "Video" : type === "CAROUSEL_ALBUM" || type === "album" ? "Carousel"
          : ["IMAGE", "photo"].includes(type) ? "Photo" : "Post";
        const metrics = instagram && reel ? [...IG_POST, "ig_reels_avg_watch_time"] : instagram ? IG_POST : FB_POST;
        const videoId = words(object(attachment.target).id);
        const [row, video] = await Promise.all([
          insights("post insights", post_id, metrics, {}),
          !instagram && isVideo && videoId
            ? insights("video insights", videoId, reel ? ["post_video_avg_time_watched", "post_video_followers"] : ["post_video_avg_time_watched"], {}, "video_insights")
            : Promise.resolve<Record<string, Json | undefined>>({}),
        ]);
        const permalink = safePermalink(instagram ? post.permalink : post.permalink_url, platform)
          || (!instagram ? `https://www.facebook.com/${encodeURIComponent(post_id)}` : "");
        if (!permalink) return;
        pull.posts.push({
          post_id, permalink, format, published_at: words(instagram ? post.timestamp : post.created_time),
          caption: line(instagram ? post.caption : post.message),
        });
        const watchMs = number(value(instagram ? row.ig_reels_avg_watch_time : video.post_video_avg_time_watched));
        const likes = number(instagram ? post.like_count : object(object(post.reactions).summary).total_count);
        const comments = number(instagram ? post.comments_count : object(object(post.comments).summary).total_count);
        const shares = number(instagram ? value(row.shares) : object(post.shares).count);
        pull.postReads.push(postRead(post_id, {
          views: number(value(instagram ? row.views : row.post_media_view)),
          reach: number(value(instagram ? row.reach : row.post_total_media_view_unique)),
          likes, comments, shares,
          saves: number(value(row.saved)), follows: number(value(instagram ? row.follows : video.post_video_followers)),
          watch_seconds: watchMs == null ? null : watchMs / 1000,
          raw: { ...row, ...video, likes, comments, shares },
        }));
      });
      pull.warnings = [...warnings].sort();
      return pull;
    },
  };
}

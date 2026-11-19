import type { Json } from "@/lib/database.types";
import { SocialReadError, type SocialDay, type SocialPostRead } from "@/lib/social-metrics";

type JsonObject = { [key: string]: Json | undefined };

export const object = (value: Json | undefined): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const list = (value: Json | undefined): Json[] => Array.isArray(value) ? value : [];
export const words = (value: Json | undefined): string => typeof value === "string" ? value : "";
export const number = (value: Json | undefined): number | null => {
  const n = typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
export const line = (value: Json | undefined) => words(value).trim().split(/\r?\n/, 1)[0].slice(0, 300);
export const dayRead = (day: string, values: Partial<SocialDay>): SocialDay => ({
  day, followers: null, followers_gained: null, views: null, reach: null, interactions: null,
  profile_visits: null, link_clicks: null, raw: {}, ...values,
});
export const postRead = (post_id: string, values: Partial<SocialPostRead>): SocialPostRead => ({
  post_id, views: null, reach: null, likes: null, comments: null, saves: null, shares: null, follows: null,
  watch_seconds: null, watch_percent: null, raw: {}, ...values,
});

/** Fetch owns the JSON boundary. Only fixed request labels make it into persisted errors. */
export async function requestSocialJson(doFetch: typeof fetch, area: string, url: URL, init: RequestInit) {
  const signal = AbortSignal.timeout(12_000);
  try {
    const response = await doFetch(url, {
      ...init,
      signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal,
      cache: "no-store",
      redirect: "error",
    });
    const body: Json = await response.json().catch(() => null);
    if (!response.ok) throw new SocialReadError(area, response.status, number(object(object(body).error).code) ?? undefined);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new SocialReadError(area, 502);
    return body;
  } catch (error) {
    if (error instanceof SocialReadError) throw error;
    throw new SocialReadError(area, 503);
  }
}

/** Bound concurrent provider calls while keeping response order. */
export async function readInBatches<I, O>(items: readonly I[], size: number, read: (item: I) => Promise<O>) {
  const out: O[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(read)));
  return out;
}

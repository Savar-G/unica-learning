import { afterEach, describe, expect, it, vi } from "vitest";
import { bareRequest, scrubEnvelope } from "@/lib/sentry-tunnel";

const DSN = "https://10064fe995f8eb573cd252a4327265d0@o4512437890842624.ingest.us.sentry.io/4512438134308864";
const enc = new TextEncoder();
const dec = new TextDecoder();

function envelope(items: { header: Record<string, unknown>; payload: Uint8Array | string }[]): Uint8Array {
  const parts: Uint8Array[] = [enc.encode(JSON.stringify({ dsn: DSN, sent_at: "2026-11-15T00:00:00Z" }) + "\n")];
  for (const item of items) {
    const payload = typeof item.payload === "string" ? enc.encode(item.payload) : item.payload;
    parts.push(enc.encode(JSON.stringify({ ...item.header, length: payload.length }) + "\n"), payload, enc.encode("\n"));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const replayEvent = JSON.stringify({ type: "replay_event", urls: ["https://unicalearning.com/account?token=SECRET", "https://unicalearning.com/tutor/p/QRSECRET123"], replay_start_timestamp: 1 });
const recording = `{"segment_id":0}\n${JSON.stringify([
  { type: 4, data: { href: "https://unicalearning.com/sign-in/link?t=SECRET", width: 390 } },
  { type: 2, data: { node: { attributes: { href: "/unsubscribe?token=SECRET" }, textContent: "*** ****" } } },
  { type: 5, data: { tag: "breadcrumb", payload: { category: "navigation", data: { to: "/account?reminder=SECRET" } } } },
])}`;

/** Items of a cleaned envelope as [header, payload text]. */
function items(bytes: Uint8Array): [Record<string, unknown>, string][] {
  const lines: [Record<string, unknown>, string][] = [];
  let at = bytes.indexOf(10) + 1;
  while (at < bytes.length) {
    const end = bytes.indexOf(10, at);
    const header = JSON.parse(dec.decode(bytes.subarray(at, end))) as Record<string, unknown>;
    const start = end + 1;
    const payload = bytes.subarray(start, start + (header.length as number));
    lines.push([header, dec.decode(payload)]);
    at = start + payload.length + 1;
  }
  return lines;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("scrubEnvelope", () => {
  it("cleans every address in a replay's details and recording, and fixes the item lengths", () => {
    const out = scrubEnvelope(envelope([
      { header: { type: "replay_event" }, payload: replayEvent },
      { header: { type: "replay_recording" }, payload: recording },
    ]))!;
    const text = dec.decode(out);
    expect(text).not.toContain("SECRET");
    expect(text).toContain("https://unicalearning.com/sign-in/link\"");
    expect(text).toContain("/tutor/p/token");
    for (const [header, payload] of items(out)) expect(header.length).toBe(enc.encode(payload).length);
  });

  it("drops a recording it cannot read (compressed) and keeps the other items", () => {
    const compressed = new Uint8Array([...enc.encode('{"segment_id":0}\n'), 0x78, 0x9c, 0x01, 0x02, 0xff]);
    const error = JSON.stringify({ type: "error", message: "x" });
    const out = scrubEnvelope(envelope([{ header: { type: "replay_recording" }, payload: compressed }, { header: { type: "event" }, payload: error }]))!;
    expect(items(out).map(([h]) => h.type)).toEqual(["event"]);
  });

  it("refuses a negative, fractional or unsafe item length at once (no endless loop)", () => {
    expect(scrubEnvelope(enc.encode('{}\n{"type":"event","length":-31}\nx'))).toBeNull();
    expect(scrubEnvelope(enc.encode('{}\n{"type":"event","length":1.5}\nxx'))).toBeNull();
    expect(scrubEnvelope(enc.encode('{}\n{"type":"event","length":"2"}\nxx'))).toBeNull();
    expect(scrubEnvelope(enc.encode(`{}\n{"type":"event","length":${Number.MAX_SAFE_INTEGER + 2}}\nx`))).toBeNull();
  });

  it("refuses a body with too many items", () => {
    expect(scrubEnvelope(enc.encode("{}\n" + '{"type":"event","length":0}\n\n'.repeat(101)))).toBeNull();
  });

  it("refuses an envelope it cannot read", () => {
    expect(scrubEnvelope(enc.encode("no newline"))).toBeNull();
    expect(scrubEnvelope(enc.encode(`{"dsn":"x"}\n{"type":"event","length":999}\nshort`))).toBeNull();
  });
});

describe("bareRequest", () => {
  it("keeps the cleaned body, its length, and only the content type and browser headers", async () => {
    const body = envelope([{ header: { type: "replay_event" }, payload: replayEvent }]);
    const request = new Request("https://unicalearning.com/monitoring?o=1", {
      method: "POST",
      body: body as BodyInit,
      headers: {
        "content-type": "text/plain;charset=UTF-8", "user-agent": "UA",
        "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "1.2.3.4", "cf-connecting-ip": "1.2.3.4",
        referer: "https://unicalearning.com/tutor/p/secret", origin: "https://unicalearning.com", cookie: "sb=x",
      },
    });
    const bare = (await bareRequest(request))!;
    expect([...bare.headers.keys()].sort()).toEqual(["content-length", "content-type", "user-agent"]);
    const text = await bare.text();
    expect(Number(bare.headers.get("content-length"))).toBe(enc.encode(text).length);
    expect(text).not.toContain("SECRET");
  });

  it("forwards through Sentry's tunnel handler with no IP or referrer", async () => {
    const sent: { url: string; headers: Headers; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const chunks: Uint8Array[] = [];
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      for (;;) { const r = await reader.read(); if (r.done) break; chunks.push(r.value); }
      sent.push({ url, headers: new Headers(init.headers as Record<string, string>), body: chunks.map((c) => dec.decode(c)).join("") });
      return new Response("{}", { status: 200 });
    }));
    const { createSentryTunnelRoute } = await import("@sentry/nextjs/tunnel");
    const tunnel = createSentryTunnelRoute({ allowedDsns: [DSN] });
    const request = new Request("https://unicalearning.com/monitoring", {
      method: "POST",
      body: envelope([{ header: { type: "replay_event" }, payload: replayEvent }]) as BodyInit,
      headers: { "content-type": "text/plain", "x-forwarded-for": "1.2.3.4", referer: "https://unicalearning.com/tutor/p/secret" },
    });
    const response = await tunnel.POST((await bareRequest(request))!);
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers.get("x-sentry-forwarded-for")).toBeNull();
    expect(sent[0].headers.get("referer")).toBeNull();
    expect(sent[0].body).not.toContain("SECRET");
  });
});

describe("tunnel routing", () => {
  it("routes /monitoring to /sentry-tunnel via Next rewrites without enabling Sentry server interception", async () => {
    const { default: config } = await import("../../next.config");
    const resolved = typeof config === "function"
      ? await (config as (phase: string, ctx: unknown) => Promise<Record<string, unknown>>)("phase-production-build", { defaultConfig: {} })
      : (config as Record<string, unknown>);
    const env = (resolved.env ?? {}) as Record<string, string | undefined>;
    // @sentry/nextjs 11.14+ hooks node:http Server.emit when _sentryTunnelRoute is injected, swallowing /monitoring
    // before Next.js/Vercel sees it (bypassing bareRequest and causing 300 s Fluid Compute timeouts after HTTP 200).
    expect(env._sentryTunnelRoute).toBeUndefined();
    const rewritesFn = resolved.rewrites as (() => Promise<unknown>) | undefined;
    const raw = rewritesFn ? await rewritesFn() : [];
    const list = Array.isArray(raw) ? raw : [...((raw as { beforeFiles?: unknown[]; afterFiles?: unknown[] }).beforeFiles ?? []), ...((raw as { afterFiles?: unknown[] }).afterFiles ?? [])];
    expect(list).toContainEqual({ source: "/monitoring", destination: "/sentry-tunnel" });
  });

  it("caps the tunnel route handler duration and scrubs incoming requests", async () => {
    const route = await import("@/app/sentry-tunnel/route");
    expect(route.maxDuration).toBeGreaterThan(0);
    expect(route.maxDuration).toBeLessThanOrEqual(60);
    const bad = await route.POST(new Request("https://unicalearning.com/monitoring", { method: "POST", body: "not an envelope" }));
    expect(bad.status).toBe(400);
  });
});

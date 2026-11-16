import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createHarness, type Action, type Mode } from "./core";
import { CHAT_STREAM_TYPE, chatStream } from "@/lib/maya-chat-stream";

export function admitted(host: string | undefined, origin: string | undefined, expected: string, method: string) {
  return host === new URL(expected).host && (origin === expected || (!origin && method === "GET"));
}

export async function startServer(assets: Map<string, { type: string; data: Uint8Array }>, port = 43125) {
  let harness = createHarness();
  let expected = "";
  let active: ServerResponse | null = null;
  const json = (res: ServerResponse, data: unknown, status = 200) => {
    if (!res.destroyed) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); }
  };
  const server = createServer(async (req, res) => {
    if (!admitted(req.headers.host, req.headers.origin, expected, req.method ?? "")) { json(res, { error: "forbidden" }, 403); return; }
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    try {
      const url = new URL(req.url!, expected);
      if (req.method === "GET" && assets.has(url.pathname)) {
        const asset = assets.get(url.pathname)!;
        res.writeHead(200, { "Content-Type": asset.type }); res.end(asset.data); return;
      }
      if (req.method === "GET" && url.pathname === "/local/state") { json(res, harness.state()); return; }
      if (req.method === "GET" && url.pathname === "/api/desk/chat/board") {
        const result = await harness.calls.readInk(url.searchParams.get("id") ?? "", { parentId: "11111111-1111-4111-8111-111111111111", childId: "22222222-2222-4222-8222-222222222222" });
        json(res, result, result.ok ? 200 : 404); return;
      }
      if (req.method !== "POST") { json(res, { error: "not_found" }, 404); return; }
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 300_000) { json(res, { error: "too_large" }, 413); return; }
      }
      const data = JSON.parse(body || "{}");
      if (url.pathname === "/local/reset") {
        // Drain the prior synthetic request before replacing its private store.
        await harness.close(); harness = createHarness(); json(res, harness.state()); return;
      }
      if (url.pathname === "/local/arm" && ["normal", "pending", "confirmed"].includes(data.mode)) {
        harness.arm(data.mode as Mode); json(res, harness.state()); return;
      }
      if (url.pathname === "/local/drop") {
        active?.destroy(); json(res, { dropped: !!active }); return;
      }
      if (url.pathname === "/local/recover" && ["retry", "end", "sweep"].includes(data.how)) {
        json(res, await harness.recover(data.id, data.how)); return;
      }
      if (url.pathname === "/api/desk/chat/board") {
        const result = await harness.calls.appendInk(data.id, { parentId: "11111111-1111-4111-8111-111111111111", childId: "22222222-2222-4222-8222-222222222222" }, data.from, data.events);
        json(res, result, result.ok ? 200 : result.error === "busy" ? 429 : result.error === "closed" ? 410 : result.error === "gap" ? 409 : 404); return;
      }
      if (url.pathname !== "/api/desk/chat") { json(res, { error: "not_found" }, 404); return; }
      const action = data as Action;
      active = action.type === "child" ? res : active;
      // JSON clients use the same adapter without a sentence callback.
      const ran = action.type === "child" && req.headers.accept?.includes(CHAT_STREAM_TYPE)
        ? await chatStream(say => harness.run(action, say)) : { reply: await harness.run(action) };
      if ("failed" in ran) throw ran.failed;
      if ("reply" in ran) { json(res, ran.reply); return; }
      if (!res.destroyed) res.writeHead(200, { "Content-Type": CHAT_STREAM_TYPE, "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" });
      const reader = ran.stream.getReader();
      res.once("close", () => { void reader.cancel(); });
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!res.destroyed) res.write(value);
        }
        if (!res.destroyed) res.end();
      } finally { if (active === res) active = null; }
    } catch (e) { json(res, { error: e instanceof Error ? e.message : "unavailable" }, 400); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No loopback address");
  expected = `http://127.0.0.1:${address.port}`;
  return { server, url: expected, async close() { await harness.close(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); } };
}

// The launcher passes only paths to its own generated assets. No request can select a filesystem path.
export async function launch(directory: string, port: number) {
  const assets = new Map<string, { type: string; data: Uint8Array }>();
  for (const [url, name, type] of [["/", "index.html", "text/html"], ["/client.js", "client.js", "text/javascript"], ["/client.css", "client.css", "text/css"], ["/desk/maya.webp", "maya.webp", "image/webp"]]) {
    assets.set(url, { type, data: await readFile(`${directory}/${name}`) });
  }
  const running = await startServer(assets, port);
  console.log(`Fake responses only. Memory records only. ${running.url}`);
  console.log(`Process ${process.pid}. Stop this process with Ctrl-C.`);
  const stop = async () => { await running.close(); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}

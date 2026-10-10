import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = await mkdtemp(join(tmpdir(), "unica-consent-test-"));
await build({
  entryPoints: { analytics: `${root}/src/lib/analytics.ts`, consent: `${root}/src/lib/consent.ts` },
  outdir, bundle: true, format: "esm", platform: "node", alias: { "@": `${root}/src` },
  external: ["posthog-js"], logLevel: "silent",
});

// ---- consent.ts with a fake window ----
class FakeStorage {
  constructor() { this.m = new Map(); this.failSet = false; this.failGet = false; }
  getItem(k) { if (this.failGet) throw new Error("blocked"); return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.failSet) throw new Error("quota"); this.m.set(k, v); }
}
const win = new EventTarget();
win.localStorage = new FakeStorage();
globalThis.window = win;
const consentMod = await import(pathToFileURL(join(outdir, "consent.js")));
const { getConsent, setConsent, subscribeConsent, isConsentPersisted, CONSENT_KEY } = consentMod;
const analyticsMod = await import(pathToFileURL(join(outdir, "analytics.js")));
const { createAnalytics, sanitizeProps, scrubEvent } = analyticsMod;

let results = [];
const t = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message]); } };

await t("consent: unset by default", () => assert.equal(getConsent(), "unset"));
await t("consent: corrupt value reads as unset", () => {
  win.localStorage.m.set(CONSENT_KEY, "{not json"); assert.equal(getConsent(), "unset");
  win.localStorage.m.set(CONSENT_KEY, JSON.stringify({ v: 2, analytics: "granted" })); assert.equal(getConsent(), "unset");
  win.localStorage.m.delete(CONSENT_KEY);
});
await t("consent: set persists, fires change event in this tab", () => {
  let n = 0; const off = subscribeConsent(() => n++);
  setConsent("granted"); assert.equal(getConsent(), "granted"); assert.equal(n, 1); assert.ok(isConsentPersisted());
  assert.equal(JSON.parse(win.localStorage.m.get(CONSENT_KEY)).analytics, "granted");
  off(); setConsent("denied"); assert.equal(n, 1); // unsubscribed
});
await t("consent: storage event from another tab notifies (key, null=clear), other keys ignored", () => {
  let n = 0; const off = subscribeConsent(() => n++);
  const ev = (key) => { const e = new Event("storage"); e.key = key; win.dispatchEvent(e); };
  ev(CONSENT_KEY); ev(null); ev("other"); assert.equal(n, 2); off();
});
await t("consent: blocked write falls back to memory, flagged not persisted", () => {
  win.localStorage.m.clear(); win.localStorage.failSet = true;
  setConsent("granted"); assert.equal(getConsent(), "granted"); assert.equal(isConsentPersisted(), false);
  win.localStorage.failSet = false;
});
await t("consent: blocked read falls back to memory", () => {
  win.localStorage.failGet = true; assert.equal(getConsent(), "granted"); win.localStorage.failGet = false;
});
await t("consent: later successful write is authoritative again", () => {
  setConsent("denied"); assert.equal(getConsent(), "denied"); assert.ok(isConsentPersisted());
  win.localStorage.m.clear(); assert.equal(getConsent(), "unset"); // cleared elsewhere, no stale memory
});

await t("consent: failed revoke write overrides an older granted choice", () => {
  setConsent("granted");
  win.localStorage.failSet = true;
  setConsent("denied");
  assert.equal(getConsent(), "denied");
  assert.equal(isConsentPersisted(), false);
  win.localStorage.failSet = false;
  setConsent("denied");
});

// ---- analytics state machine with fakes ----
function rig({ initial = "unset", autoLoad = false } = {}) {
  const log = []; let state = initial; let subs = []; let idleRun = null;
  const client = {
    init: (k, c) => log.push(["init", c]), capture: (e, p) => log.push(["capture", e, p]),
    reset: (d) => log.push(["reset", d]), opt_in_capturing: (o) => log.push(["opt_in", o]), opt_out_capturing: () => log.push(["opt_out"]),
  };
  const loads = []; let loadCount = 0;
  const a = createAnalytics({
    key: "phc_test",
    load: () => { loadCount++; if (autoLoad) return Promise.resolve(client); return new Promise((res, rej) => loads.push({ res: () => res(client), rej })); },
    getConsent: () => state,
    subscribe: (cb) => { subs.push(cb); return () => {}; },
    clearStorage: () => log.push(["clear"]),
    whenIdle: (run) => { idleRun = run; },
  });
  const set = (s) => { state = s; subs.forEach((cb) => cb()); };
  const count = (k) => log.filter((l) => l[0] === k).length;
  return { a, log, set, loads, client, count, loadCount: () => loadCount, runIdle: () => idleRun?.(), setSilently: (s) => { state = s; } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

await t("no consent: track never loads or captures; accept later replays nothing", async () => {
  const r = rig({ autoLoad: true }); r.a.begin();
  r.a.track("cta_click", { src: "nav" }); r.a.track("form_start");
  assert.equal(r.loadCount(), 0);
  r.set("granted"); await tick();
  assert.equal(r.count("init"), 1); assert.equal(r.count("capture"), 0);
});
await t("denied: track never loads, no capture", async () => {
  const r = rig({ initial: "denied", autoLoad: true }); r.a.begin(); r.a.track("cta_click"); await tick();
  assert.equal(r.loadCount(), 0); assert.equal(r.count("capture"), 0);
});
await t("startup denied clears leftover storage on the idle check, loads nothing", async () => {
  const r = rig({ initial: "denied", autoLoad: true }); r.a.begin();
  assert.equal(r.count("clear"), 0); r.runIdle(); // nothing happens before idle
  assert.equal(r.count("clear"), 1); assert.equal(r.loadCount(), 0);
});
await t("startup granted: import waits for idle", async () => {
  const r = rig({ initial: "granted", autoLoad: true }); r.a.begin(); await tick();
  assert.equal(r.loadCount(), 0); r.runIdle(); await tick(); assert.equal(r.count("init"), 1);
});
await t("startup unset: idle check loads and stores nothing", async () => {
  const r = rig({ initial: "unset", autoLoad: true }); r.a.begin(); r.runIdle(); await tick();
  assert.equal(r.loadCount(), 0); assert.equal(r.count("clear"), 0);
});
await t("accept, event while import in flight: one init, one capture, props sanitized", async () => {
  const r = rig(); r.a.begin(); r.set("granted");
  r.a.track("reserve_success", { plan: "both", grade: 4, name: "Ana", email: "a@b.ca", postal: "V6B1A1", curriculum: "bc", price: 229, card: true, src: "a@b" });
  assert.equal(r.count("capture"), 0); r.loads[0].res(); await tick();
  assert.equal(r.count("init"), 1); assert.equal(r.count("capture"), 1);
  assert.deepEqual(r.log.find((l) => l[0] === "capture")[2], { plan: "both", curriculum: "bc", price: 229, card: true });
});
await t("RACE accept then reject while import in flight: never init, never capture, storage cleared", async () => {
  const r = rig(); r.a.begin(); r.set("granted"); r.a.track("cta_click", { src: "hero" });
  r.set("denied"); r.loads[0].res(); await tick();
  assert.equal(r.count("init"), 0); assert.equal(r.count("capture"), 0); assert.ok(r.count("clear") >= 1);
});
await t("RACE accept, reject, accept while import in flight: one init, old event dropped, new event sent", async () => {
  const r = rig(); r.a.begin(); r.set("granted"); r.a.track("old_event");
  r.set("denied"); r.set("granted"); r.a.track("new_event");
  assert.equal(r.loadCount(), 1); r.loads[0].res(); await tick();
  assert.equal(r.count("init"), 1);
  const caps = r.log.filter((l) => l[0] === "capture").map((l) => l[1]); assert.deepEqual(caps, ["new_event"]);
});
await t("RACE reject arrives between queued track and import resolve: event dropped", async () => {
  const r = rig(); r.a.begin(); r.set("granted"); r.a.track("late"); r.set("denied"); r.loads[0].res(); await tick();
  assert.equal(r.count("capture"), 0);
});
await t("revoke after init: reset(true) before opt_out, storage cleared, later tracks dropped", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick(); r.a.track("one"); assert.equal(r.count("capture"), 1);
  r.set("denied");
  const names = r.log.map((l) => l[0]); const i = names.indexOf("reset");
  assert.ok(i > -1 && names[i + 1] === "opt_out" && names[i + 2] === "clear", names.join(","));
  assert.deepEqual(r.log[i], ["reset", true]);
  r.a.track("two"); await tick(); assert.equal(r.count("capture"), 1);
});
await t("re-grant after revoke: opt_in once (no event), init not repeated, capture works", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick(); r.set("denied"); r.set("granted");
  r.a.track("again"); r.a.track("again2"); await tick();
  assert.equal(r.count("init"), 1); assert.equal(r.count("opt_in"), 2); // one at init, one at re-grant
  assert.deepEqual(r.log.filter((l) => l[0] === "opt_in").at(-1)[1], { captureEventName: false });
  assert.equal(r.count("capture"), 2);
});
await t("repeated sync while granted does not re-call opt_in", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick(); r.a.track("a"); r.a.track("b"); r.set("granted");
  assert.equal(r.count("opt_in"), 1);
});
await t("cross-tab revoke (state flips without a track call) revokes via subscription", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick(); r.set("unset");
  assert.equal(r.count("reset"), 1); assert.equal(r.count("opt_out"), 1); assert.ok(r.count("clear") >= 1);
});
await t("track self-heals if consent flipped without the event (missed notification)", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick();
  r.setSilently("denied"); r.a.track("x"); await tick();
  assert.equal(r.count("capture"), 0); assert.equal(r.count("opt_out"), 1);
});
await t("before_send drops events after revoke and scrubs while granted", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick();
  const cfg = r.log.find((l) => l[0] === "init")[1];
  const ev = () => ({ event: "$pageview", properties: { $current_url: "https://x.ca/?email=a@b.ca&utm_source=r#frag", $referrer: "https://www.google.com/search?q=my+kid+name", $initial_referrer: "$direct", email: "a@b.ca", utm_source: "reddit" }, $set_once: { $initial_current_url: "https://x.ca/p?z=1" } });
  const out = cfg.before_send(ev());
  assert.equal(out.properties.$current_url, "https://x.ca/"); assert.equal(out.properties.$referrer, "https://www.google.com/");
  assert.equal(out.properties.$initial_referrer, "$direct"); assert.equal(out.properties.email, undefined); assert.equal(out.properties.utm_source, "reddit");
  assert.equal(out.$set_once.$initial_current_url, "https://x.ca/p");
  r.set("denied"); assert.equal(cfg.before_send(ev()), null);
});
await t("config turns off autocapture, replay, flags, heatmaps, surveys; host-only cookie", async () => {
  const r = rig({ autoLoad: true }); r.a.begin(); r.set("granted"); await tick();
  const c = r.log.find((l) => l[0] === "init")[1];
  for (const k of ["autocapture", "capture_heatmaps", "capture_dead_clicks", "capture_exceptions"]) assert.equal(c[k], false, k);
  for (const k of ["disable_session_recording", "disable_surveys", "advanced_disable_flags", "respect_dnt"]) assert.equal(c[k], true, k);
  assert.equal(c.cross_subdomain_cookie, false); assert.equal(c.person_profiles, "identified_only"); assert.equal(c.ip, false);
});
await t("import failure: no throw, later grant retries", async () => {
  const r = rig(); r.a.begin(); r.set("granted"); r.a.track("e"); r.loads[0].rej(new Error("net")); await tick();
  assert.equal(r.count("init"), 0); r.set("denied"); r.set("granted"); assert.equal(r.loadCount(), 2);
  r.loads[1].res(); await tick(); assert.equal(r.count("init"), 1);
});
await t("scrubEvent/sanitizeProps edge cases", () => {
  assert.deepEqual(sanitizeProps({ grade: 3, name: "x", plan: "one", src: "x".repeat(41), status: "ok", code: NaN, card: null }), { plan: "one", status: "ok", card: null });
  assert.deepEqual(sanitizeProps(undefined), {});
  assert.equal(scrubEvent({ properties: { $referrer: "android-app://com.google.android.gm/?x=1" } }).properties.$referrer, "");
});

for (const r of results) console.log(r.join(" | "));
const fail = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exitCode = fail ? 1 : 0;

await rm(outdir, { recursive: true, force: true });

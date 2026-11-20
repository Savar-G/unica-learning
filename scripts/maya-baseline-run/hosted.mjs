// #1139 hosted samples: one production admin test call through the Aside browser (docs/maya-baseline.md). The call uses a
// test child, the deployed site and the LiveKit Cloud worker. A synthetic microphone plays the run's prompts; the page
// measures received audio energy and board SVG changes on the browser clock. It writes device rows to the capture.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  out: { type: "string" }, site: { type: "string", default: "https://unicalearning.com" }, child: { type: "string", default: "Testkid" },
  network: { type: "string", default: "home-wifi" }, device: { type: "string", default: "macbook-aside" }, provider: { type: "string", default: "production" },
} });
if (!values.out) throw Error("Usage: node scripts/maya-baseline-run/hosted.mjs --out <run dir with prompts/> [--child Testkid]");
const out = resolve(values.out);
const prompts = [["first", "routine"], ["regroup", "complex"]];
const clips = Object.fromEntries(prompts.map(([name]) => [name, readFileSync(join(out, "prompts", `${name}.wav`)).toString("base64")]));
// Aside's REPL stops a script after 120 s; this process stops Aside after OUTER_MS. The measurements stop at MEASURE_MS,
// which leaves time to hang up and close the tab inside the script.
const OUTER_MS = 150_000;
const MEASURE_MS = 85_000;

// Runs inside Aside's REPL. Everything it needs is in this string.
const script = `
const clips = ${JSON.stringify(clips)};
const order = ${JSON.stringify(prompts)};
const end1139 = Date.now() + ${MEASURE_MS};
// A wait never runs past the measurement deadline, so the cleanup below always has its time.
const left1139 = (limit) => Math.max(500, Math.min(limit, end1139 - Date.now()));
const before1139 = new Set((await listBrowserTabs()).map(t => t.targetId));
const h1139 = await openTab(${JSON.stringify(values.site + "/admin/maya")});
// The tab's id goes out at once: if this script is stopped, the runner closes the tab with it.
const tab1139 = (await listBrowserTabs()).find(t => !before1139.has(t.targetId))?.targetId ?? null;
console.log("HOSTED1139_TAB " + JSON.stringify(tab1139));
try {
  await h1139.getByRole("heading", { name: "Start a test call" }).waitFor({ timeout: left1139(15000) });
  await h1139.getByText("Speak", { exact: true }).click();
  const child = h1139.getByRole("combobox", { name: "Test child" });
  await child.selectOption({ label: ${JSON.stringify(values.child)} });
  // In Speak mode the button opens the call page, which checks the microphone first.
  await h1139.getByRole("button", { name: "Talk to Maya" }).first().click();
  await h1139.getByRole("button", { name: "Check the microphone", exact: true }).waitFor({ timeout: left1139(20000) });
  await h1139.evaluate(async (clips) => {
    const ctx = new AudioContext();
    const decoded = {};
    for (const [name, b64] of Object.entries(clips)) {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      decoded[name] = await ctx.decodeAudioData(bytes.buffer);
    }
    const rows = [];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const dst = ctx.createMediaStreamDestination(); rows.push(dst); return dst.stream;
    } });
    document.addEventListener("click", () => { void ctx.resume(); }, { capture: true, once: true });
    window.b1139 = { ctx, rows, decoded, bursts: [], rendered: [], marks: [] };
  }, clips);
  await h1139.getByRole("button", { name: "Check the microphone", exact: true }).click();
  await h1139.getByRole("status").filter({ hasText: "The microphone works" }).waitFor({ timeout: left1139(8000) });
  await h1139.evaluate(() => {
    const s = window.b1139;
    const silent = s.ctx.createGain(); silent.gain.value = 0; silent.connect(s.ctx.destination);
    const meters = new Map();
    s.timer = setInterval(() => {
      for (const el of document.querySelectorAll("audio")) {
        el.muted = true;
        const stream = el.srcObject;
        if (!(stream instanceof MediaStream) || !stream.getAudioTracks().length || meters.has(stream)) continue;
        const source = s.ctx.createMediaStreamSource(stream), analyser = s.ctx.createAnalyser();
        analyser.fftSize = 512; source.connect(analyser); analyser.connect(silent);
        meters.set(stream, { analyser, buffer: new Float32Array(512) });
      }
      for (const { analyser, buffer } of meters.values()) {
        analyser.getFloatTimeDomainData(buffer);
        if (Math.sqrt(buffer.reduce((n, x) => n + x * x, 0) / buffer.length) < 0.008) continue;
        const at = performance.now(), last = s.bursts.at(-1);
        if (last && at - last.end < 250) last.end = at; else s.bursts.push({ start: at, end: at });
      }
    }, 20);
    const region = document.querySelector('section[aria-label="Our board"]') ?? document.body;
    let current = region.querySelector("svg")?.innerHTML ?? "";
    new MutationObserver(() => {
      const now = region.querySelector("svg")?.innerHTML ?? "";
      if (now !== current) { current = now; s.rendered.push(performance.now()); }
    }).observe(region, { subtree: true, childList: true, attributes: true });
  });
  await h1139.getByRole("button", { name: "Connect", exact: true }).click();
  await h1139.getByRole("button", { name: "Hang up", exact: true }).waitFor({ timeout: left1139(15000) });
  const quiet = (after, limit) => h1139.waitForFunction(([after]) => {
    // The runner's rule: 2 s of quiet after a sound of at least 1 s, or 6 s of quiet after any sound.
    const s = window.b1139, last = s.bursts.at(-1);
    const answered = s.bursts.some(b => b.start >= after && b.end - b.start >= 1000);
    return !!last && last.start >= after && performance.now() - last.end > (answered ? 2000 : 6000);
  }, [after], { timeout: left1139(limit) }).then(() => true, () => false);
  await quiet(0, 30000);
  for (const [name] of order) {
    if (Date.now() >= end1139) break;
    const inputEnd = await h1139.evaluate((name) => {
      const s = window.b1139;
      const mic = s.rows.findLast(d => d.stream.getAudioTracks().some(t => t.readyState === "live"));
      const clip = s.decoded[name], data = clip.getChannelData(0), hop = Math.round(clip.sampleRate * 0.02);
      let last = 0;
      for (let i = 0; i < data.length; i += hop) {
        let sum = 0; const end = Math.min(data.length, i + hop);
        for (let k = i; k < end; k++) sum += data[k] ** 2;
        if (Math.sqrt(sum / (end - i)) >= 0.008) last = end;
      }
      const src = s.ctx.createBufferSource(); src.buffer = clip; src.connect(mic); src.start(s.ctx.currentTime + 0.1);
      const inputEnd = performance.now() + 100 + last / clip.sampleRate * 1000;
      s.marks.push({ name, inputEnd });
      return inputEnd;
    }, name);
    await quiet(inputEnd, 25000);
  }
  const result = await h1139.evaluate(() => ({ bursts: window.b1139.bursts, rendered: window.b1139.rendered, marks: window.b1139.marks }));
  console.log("HOSTED1139 " + JSON.stringify(result));
} finally {
  // Hang up first, then close the tab: a call left open keeps the test child's room busy.
  const hang1139 = h1139.getByRole("button", { name: "Hang up", exact: true });
  if (await hang1139.isVisible().catch(() => false)) {
    await hang1139.click({ timeout: 5000 }).catch(() => {});
    await h1139.getByRole("status").filter({ hasText: "The call has ended" }).waitFor({ timeout: 8000 }).catch(() => {});
  }
  await closeTab(h1139);
}
`;

/** After a failed or stopped script: hang up and close the tab this run opened, found by its id, never another tab. */
function cleanUp(targetId) {
  const file = join(out, "hosted-aside-cleanup.js");
  writeFileSync(file, `
const tab = await attachBrowserTab(${JSON.stringify(targetId)});
const hang = tab.getByRole("button", { name: "Hang up", exact: true });
if (await hang.isVisible().catch(() => false)) {
  await hang.click({ timeout: 5000 }).catch(() => {});
  await tab.getByRole("status").filter({ hasText: "The call has ended" }).waitFor({ timeout: 8000 }).catch(() => {});
}
await closeTab(tab);
console.log("HOSTED1139_CLOSED");
`);
  return execFileSync("aside", ["repl", "--account", "u0", "--file", file], { encoding: "utf8", timeout: 60_000 }).includes("HOSTED1139_CLOSED");
}
const file = join(out, "hosted-aside.js");
writeFileSync(file, script);
let output;
try {
  output = execFileSync("aside", ["repl", "--account", "u0", "--file", file], { encoding: "utf8", timeout: OUTER_MS });
} catch (e) {
  const partial = String(e.stdout ?? "");
  const tabLine = partial.split("\n").find(l => l.includes("HOSTED1139_TAB "));
  const targetId = tabLine ? JSON.parse(tabLine.slice(tabLine.indexOf("HOSTED1139_TAB ") + 15)) : null;
  let closed = false;
  if (targetId) { try { closed = cleanUp(targetId); } catch { closed = false; } }
  throw Error(`The hosted script failed (${e.message}). ${targetId ? (closed ? "Its tab was closed." : `Close tab ${targetId} by hand.`) : "No tab id was printed: check Aside for an open admin call tab."}\n${partial.slice(-2000)}`);
}
const line = output.split("\n").find(l => l.includes("HOSTED1139 "));
if (!line) throw Error(`No hosted result:\n${output.slice(-2000)}`);
const { bursts, rendered, marks } = JSON.parse(line.slice(line.indexOf("HOSTED1139 ") + 11));
const rows = marks.map((m, i) => {
  const end = marks[i + 1]?.inputEnd ?? Infinity;
  const mine = bursts.filter(b => b.start >= m.inputEnd && b.start < end);
  // The hosted path gives no worker playout mark on the browser clock, so a filler cannot be told from the answer.
  // Record the first sound only. The full sound list is kept in hosted.jsonl.
  const board = rendered.find(at => at >= m.inputEnd && at < end);
  const ms = {};
  if (mine[0]) ms.deviceFirstSound = Math.round(mine[0].start - m.inputEnd);
  if (board !== undefined) ms.deviceBoard = Math.round(board - m.inputEnd);
  return { v: 1, evidence: "device", mode: "voice", turnType: prompts[i][1], provider: values.provider, teaching: "existing",
    device: values.device, network: values.network, concurrency: 1, outcome: mine.length ? "completed" : "timeout", ms, counts: {} };
});
appendFileSync(join(out, "capture.log"), rows.map(r => "[maya baseline] " + JSON.stringify(r)).join("\n") + "\n");
appendFileSync(join(out, "hosted.jsonl"), JSON.stringify({ at: new Date().toISOString(), bursts, rendered, marks }) + "\n");
console.log(JSON.stringify(rows.map(r => [r.turnType, r.outcome, r.ms])));

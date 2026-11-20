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

// Runs inside Aside's REPL. Everything it needs is in this string.
const script = `
const clips = ${JSON.stringify(clips)};
const order = ${JSON.stringify(prompts)};
const h1139 = await openTab(${JSON.stringify(values.site + "/admin/maya")});
try {
  await h1139.getByText("Speak", { exact: true }).click();
  const child = h1139.getByRole("combobox", { name: "Test child" });
  await child.selectOption({ label: ${JSON.stringify(values.child)} });
  await h1139.getByRole("button", { name: "Call Maya" }).first().click();
  await h1139.getByRole("button", { name: "Check the microphone", exact: true }).waitFor({ timeout: 20000 });
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
  await h1139.getByRole("status").filter({ hasText: "The microphone works" }).waitFor({ timeout: 8000 });
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
  await h1139.getByRole("button", { name: "Hang up", exact: true }).waitFor({ timeout: 15000 });
  const quiet = (after, limit) => h1139.waitForFunction(([after]) => {
    const s = window.b1139, last = s.bursts.at(-1);
    return !!last && last.start >= after && performance.now() - last.end > 2000;
  }, [after], { timeout: limit }).then(() => true, () => false);
  await quiet(0, 30000);
  for (const [name] of order) {
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
  await h1139.getByRole("button", { name: "Hang up", exact: true }).click();
  await h1139.getByRole("status").filter({ hasText: "The call has ended" }).waitFor({ timeout: 15000 }).catch(() => {});
} finally {
  await closeTab(h1139);
}
`;
const file = join(out, "hosted-aside.js");
writeFileSync(file, script);
const output = execFileSync("aside", ["repl", "--account", "u0", "--file", file], { encoding: "utf8", timeout: 150_000 });
const line = output.split("\n").find(l => l.includes("HOSTED1139 "));
if (!line) throw Error(`No hosted result:\n${output.slice(-2000)}`);
const { bursts, rendered, marks } = JSON.parse(line.slice(line.indexOf("HOSTED1139 ") + 11));
const rows = marks.map((m, i) => {
  const end = marks[i + 1]?.inputEnd ?? Infinity;
  const mine = bursts.filter(b => b.start >= m.inputEnd && b.start < end);
  // Without worker playout marks on the hosted path, filler is a sound shorter than 1 s followed by a longer one.
  const answer = mine.find((b, k) => b.end - b.start >= 1000 || k === mine.length - 1);
  const board = rendered.find(at => at >= m.inputEnd && at < end);
  const ms = {};
  if (mine[0]) ms.deviceFirstSound = Math.round(mine[0].start - m.inputEnd);
  if (answer) ms.deviceUseful = Math.round(answer.start - m.inputEnd);
  if (board !== undefined) ms.deviceBoard = Math.round(board - m.inputEnd);
  return { v: 1, evidence: "device", mode: "voice", turnType: prompts[i][1], provider: values.provider, teaching: "existing",
    device: values.device, network: values.network, concurrency: 1, outcome: answer ? "completed" : "timeout", ms, counts: {} };
});
appendFileSync(join(out, "capture.log"), rows.map(r => "[maya baseline] " + JSON.stringify(r)).join("\n") + "\n");
appendFileSync(join(out, "hosted.jsonl"), JSON.stringify({ at: new Date().toISOString(), bursts: bursts.length, rendered: rendered.length, marks }) + "\n");
console.log(JSON.stringify(rows.map(r => [r.turnType, r.outcome, r.ms])));

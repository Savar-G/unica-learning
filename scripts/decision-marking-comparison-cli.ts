// The local comparison of the per-answer second opinion (#851): typesafe/jev-1.14 and google/gemini-decision-1 on the
// fixed 40 synthetic photos. Run through scripts/decision-marking-comparison.mjs; docs/decision-marking-comparison.md.
// Reads the set folder and never writes into it. Writes under .workbook-sample/decision-comparison/ (gitignored).
// The key comes only from DECISIONS_OPENROUTER_API_KEY in the process environment; this script never prints it.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { DECISION_MODELS, decisionClient, decisionModelTerms, requestCostBound, type DecisionClient } from "../src/lib/decision-client";
import { openRouterDecisionClient } from "../src/lib/decision-openrouter";
import {
  COMPARISON_MODELS,
  askAll,
  comparisonItems,
  costCap,
  comparisonReport,
  cropRect,
  estimateTokens,
  imageSize,
  reportMarkdown,
  type AskResult,
  type ComparisonItem,
  type RegionAsk,
  type SetManifest,
} from "../src/lib/decision-marking-comparison";

const HELP = `node scripts/decision-marking-comparison.mjs --set DIR [--estimate | --fake-http] [--max-usd 2] [--models a,b] [--out DIR] [--save-crops]
--set DIR: the fixed 40 folder (manifest.json and photos/). Read only.
--estimate: print the cost estimate and stop. No key is read and nothing is sent.
--fake-http: run the real adapter against a fake fetch. No key; the report is marked fake.
--max-usd: the cost cap of the run (default 2). A run whose estimate is above it does not start. Each request reserves
  the most it can cost (the model's whole context at its pinned price, times its most attempts) and is sent only when
  the money spent plus every reservation in flight plus its own is at most the cap. The cap holds while the provider
  bills at the pinned prices; the OpenRouter key's credit limit is the hard limit.
--out: the output folder (default .workbook-sample/decision-comparison/<time>).
--save-crops: also write each crop as it is sent, to check the crops by eye.`;

/** A fake fetch: a P(yes) from the request's hash, with a usage cost, so a run needs no key and no network. */
function fakeFetch(): typeof globalThis.fetch {
  return async (_input, init) => {
    const body = String(init?.body ?? "");
    const hash = createHash("sha256").update(body).digest();
    const parsed = JSON.parse(body) as { model: string; questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(parsed.questions).map((k, n) => [k, { type: "noul", noul: hash[n % hash.length] / 255 }]));
    const tokens = Math.ceil(body.length / 4);
    return new Response(JSON.stringify({ model: parsed.model, answers, usage: { input_tokens: tokens, output_tokens: 0, cost: (tokens * decisionModelTerms(parsed.model).promptUsdPerM) / 1e6 }, id: "gen-dec-fake", provider: "fake" }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

async function main() {
  const { values: v } = parseArgs({
    options: {
      set: { type: "string" }, out: { type: "string" }, estimate: { type: "boolean" }, "fake-http": { type: "boolean" },
      "max-usd": { type: "string", default: "2" }, models: { type: "string" }, concurrency: { type: "string", default: "4" },
      "save-crops": { type: "boolean" }, help: { type: "boolean" },
    },
  });
  if (v.help || !v.set) {
    console.log(HELP);
    if (!v.help) process.exitCode = 1;
    return;
  }
  const maxUsd = Number(v["max-usd"]);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error("--max-usd must be a positive number");
  const models = v.models ? v.models.split(",").map((m) => m.trim()).filter(Boolean) : [...COMPARISON_MODELS];
  for (const m of models) if (!Object.hasOwn(DECISION_MODELS, m)) throw new Error(`not in the pinned decision model table: ${m}`);
  const set = resolve(v.set);
  const fake = !!v["fake-http"];
  const out = resolve(v.out ?? `.workbook-sample/decision-comparison/${new Date().toISOString().replace(/[:.]/g, "-")}${fake ? "-fake" : ""}`);
  if (out === set || out.startsWith(set + "/")) throw new Error("the output folder must be outside the set folder");

  const manifest = JSON.parse(await readFile(resolve(set, "manifest.json"), "utf8")) as SetManifest;
  const { items, leftOut } = comparisonItems(manifest);
  const photos = new Map(manifest.photos.map((p) => [p.id, p]));

  // The estimate: every request's size from its crop, at each model's input price, with one retry each.
  const sizes = new Map<string, { rect: ReturnType<typeof cropRect>; size: ReturnType<typeof imageSize>; tokens: number }>();
  const keyOf = (item: ComparisonItem, region: RegionAsk) => `${item.photo}/${item.itemId}/${region.regionId}`;
  for (const item of items) for (const region of item.regions) {
    const photo = photos.get(item.photo)!;
    const rect = cropRect(region.box, photo.image);
    const size = imageSize(rect.width, rect.height);
    sizes.set(keyOf(item, region), { rect, size, tokens: estimateTokens(region.question, size.canvas) });
  }
  const tokens = [...sizes.values()].reduce((n, s) => n + s.tokens, 0);
  const estimate = {
    requestsPerModel: sizes.size, inputTokensPerModel: tokens,
    models: Object.fromEntries(models.map((m) => [m, Math.round(((2 * tokens * decisionModelTerms(m).promptUsdPerM) / 1e6) * 1e6) / 1e6])),
    totalUsd: 0, maxUsd,
  };
  estimate.totalUsd = Math.round(Object.values(estimate.models).reduce((a, b) => a + b, 0) * 1e6) / 1e6;
  console.log(JSON.stringify({ estimate }, null, 2));
  if (v.estimate) return;
  if (estimate.totalUsd > maxUsd) throw new Error(`the estimate USD ${estimate.totalUsd} is above --max-usd ${maxUsd}: not started`);

  const clients: DecisionClient[] = models.map((model) => {
    if (fake) return openRouterDecisionClient({ apiKey: "fake", model, provider: "fake", fetch: fakeFetch() });
    const client = decisionClient(process.env, model);
    if (!client) throw new Error("DECISIONS_OPENROUTER_API_KEY is not set");
    return client;
  });

  await mkdir(out, { recursive: true });
  if (v["save-crops"]) await mkdir(resolve(out, "crops"), { recursive: true });
  await writeFile(resolve(out, "estimate.json"), JSON.stringify(estimate, null, 2) + "\n");

  const pages = new Map<string, Buffer>();
  const crops = new Map<string, Uint8Array>();
  const crop = async (item: ComparisonItem, region: RegionAsk) => {
    const key = keyOf(item, region);
    const s = sizes.get(key)!;
    let data = crops.get(key);
    if (!data) {
      const photo = photos.get(item.photo)!;
      let page = pages.get(photo.id);
      if (!page) {
        page = await readFile(resolve(set, photo.image.path));
        const meta = await sharp(page).metadata();
        // The synthetic photos are drawn on the page image itself, so page pixels are photo pixels.
        if (meta.width !== photo.image.width || meta.height !== photo.image.height) throw new Error(`photo-not-page-aligned:${photo.id}`);
        pages.set(photo.id, page);
      }
      const { width, height, canvas } = s.size;
      data = new Uint8Array(await sharp(page).extract(s.rect).resize(width, height)
        .extend({ right: canvas.width - width, bottom: canvas.height - height, background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer());
      crops.set(key, data);
      if (v["save-crops"]) await writeFile(resolve(out, "crops", `${item.photo}--${item.number}-${region.regionId}.jpg`), data);
    }
    return data;
  };

  // One cost cap for the whole run, both models: see costCap.
  const cap = costCap(maxUsd);
  const results: Record<string, AskResult[]> = {};
  for (const client of clients) {
    console.log(`${client.model}: each request reserves USD ${requestCostBound(client).toFixed(6)} (its most cost) under the cap.`);
    let done = 0;
    results[client.model] = await askAll({
      items, client, cap, concurrency: Number(v.concurrency) || 4,
      image: crop,
      onResult: () => {
        if (++done % 50 === 0) console.log(`${client.model}: ${done}/${sizes.size}, spent about USD ${cap.spentUsd.toFixed(5)}`);
      },
    });
    await writeFile(resolve(out, `results-${client.model.replace("/", "_")}.json`), JSON.stringify(results[client.model], null, 2) + "\n");
  }

  if (cap.stopped) console.log("The run stopped at the cost cap: a cost was above its bound, so the pinned prices are out of date.");
  const report = comparisonReport({ items, leftOut, photos: manifest.photos.length, fake, results, cap });
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const md = reportMarkdown(report);
  await writeFile(resolve(out, "report.md"), md);
  console.log(md.split("\n").slice(0, 8 + report.models.length).join("\n"));
  console.log(`Report: ${resolve(out, "report.md")}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

// B1a screens: the boards Maya draws for a "which digit" and a "value of the digit" question, built by the real offers
// (src/lib/maya/place-value-lines.ts, placeBoardOffers) on the real board core and component, with the real lines as
// captions. Synthetic numbers only. Run: node .design/research/maya-place-value-prototype/build.cjs <out dir> render-b1a.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { applyBatch, createScene, type Command } from "@/lib/board";
import { fitView, type PlayStep } from "@/lib/board-svg";
import { MayaBoard } from "@/components/maya-board";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { packageLines, type LineOffer } from "@/lib/maya/lines";
import { placeBoardOffers } from "@/lib/maya/place-value-lines";
import { placeValueTeachingPackage } from "@/lib/maya-teaching/place-value";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import type { OperationPackage } from "@/lib/question-package";

const make = (stored: Parameters<typeof placeValueTeachingPackage>[0]) => {
  const r = placeValueTeachingPackage(stored);
  if ("held" in r) throw new Error(r.held);
  return r.package as OperationPackage;
};
const DIGIT = make(storedPlaceValue({ variant: "1.1", n0: 53172, place: "thousands" }));
const VALUE = make(storedPlaceValue({ variant: "2.2", n0: 785243, place: "ten thousands" }));
const at = { region: "main" } as const;

/** The commands of one offer, as the session would draw it for these lines. */
function offer(pkg: OperationPackage, act: string, id: string, chosen: LineOffer[], roles: Record<string, string>, batch: number): Command[] {
  const o = placeBoardOffers({ pkg: pkg as never, act, roles, batch, chosen, exampleShown: 0 }).find((x) => x.id === id);
  if (!o) throw new Error(`no offer ${id}`);
  return o.commands(at);
}
const byKey = (offers: LineOffer[], key: string) => offers.filter((o) => o.key === key);

function screens() {
  const d = packageLines(DIGIT);
  const v = packageLines(VALUE);
  const q = { question: "target" };
  const dH2 = byKey(d.help("result"), "operation.place");
  const vH1 = byKey(v.help("digit"), "point.place.band");
  const dAnswer = byKey(d.answerRight(), "answer.digit");
  const vAnswer = byKey(v.answerRight(), "answer.value");
  const dChart = offer(DIGIT, "guide", "question.chart", [], {}, 0);
  const vChart = offer(VALUE, "guide", "question.chart", [], {}, 0);
  return [
    { file: "b1a-digit-h1", title: "Which digit, H1: places named from the right, no stripe", maya: byKey(d.help("result"), "point.place")[0].texts[0], batches: [dChart], phone: false },
    { file: "b1a-digit-h2", title: "Which digit, H2: the column striped, no digit on the chart", maya: dH2[0].texts[0], batches: [dChart, offer(DIGIT, "guide", "question.band", dH2, q, 1)], phone: false },
    { file: "b1a-digit-answer", title: "Which digit: after the child said 3", maya: dAnswer[0].texts[0], batches: [dChart, offer(DIGIT, "guide", "question.band", dH2, q, 1), offer(DIGIT, "accept_answer", "question.answer", dAnswer, q, 2)], phone: false },
    { file: "b1a-value-h1", title: "Value, the digit step at H1: the column striped", maya: vH1[0].texts[0], batches: [vChart, offer(VALUE, "guide", "question.band", vH1, q, 1)], phone: false },
    { file: "b1a-value-answer", title: "Value: after the child said 80000", maya: vAnswer[0].texts[0], batches: [vChart, offer(VALUE, "guide", "question.band", vH1, q, 1), offer(VALUE, "accept_answer", "question.answer", vAnswer, q, 2)], phone: false },
    { file: "b1a-phone-digit-h2", title: "Phone width (390 px): which digit, H2", maya: dH2[0].texts[0], batches: [dChart, offer(DIGIT, "guide", "question.band", dH2, q, 1)], phone: true },
    { file: "b1a-phone-value-answer", title: "Phone width (390 px): value answer", maya: vAnswer[0].texts[0], batches: [vChart, offer(VALUE, "guide", "question.band", vH1, q, 1), offer(VALUE, "accept_answer", "question.answer", vAnswer, q, 2)], phone: true },
  ];
}

const css = readFileSync("src/components/maya-board.css", "utf8");
const out = process.argv[2];
mkdirSync(out, { recursive: true });
for (const s of screens()) {
  let scene = createScene();
  const steps: PlayStep[] = [];
  s.batches.forEach((commands, i) => {
    const r = applyBatch(scene, { transactionId: `t${i}`, commands });
    if (!r.ok) throw new Error(`${s.file} batch ${i}: ${JSON.stringify(r.refusal)}`);
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased });
  });
  const svg = renderToStaticMarkup(<MayaBoard steps={steps} viewBox={fitView(steps.flatMap((x) => x.drawn), 0.04)} label={s.title} instant />);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
:root{--ink:#14151a;--line:#e4e4e7}
body{margin:0;background:#f4f1ea;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#14151a}
.wrap{width:${s.phone ? 390 : 920}px;padding:${s.phone ? 16 : 24}px;box-sizing:border-box}
.cap{display:flex;gap:10px;align-items:flex-start;margin-top:14px}
.av{flex:none;width:30px;height:30px;border-radius:50%;background:#16a06a;color:#fff;font-weight:700;display:grid;place-items:center;font-size:15px}
.bubble{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:9px 13px;font-size:${s.phone ? 15 : 17}px;line-height:1.35}
.tag{font-size:12px;color:#6b6e78;margin:0 0 8px;letter-spacing:.02em}
</style></head><body><div class="wrap"><p class="tag">${s.title} · synthetic numbers; the bubble is Maya's line</p>${svg}<div class="cap"><div class="av">M</div><div class="bubble">${s.maya}</div></div></div></body></html>`;
  writeFileSync(`${out}/${s.file}.html`, html);
}
console.log("wrote B1a pages to", out);

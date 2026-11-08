// Prototype for .design/research/maya-place-value-design.md: draws the place chart with the real board core
// (src/lib/board) and the real board component (src/components/maya-board.tsx), on synthetic numbers only, as static
// HTML. Run: node .design/research/maya-place-value-prototype/build.cjs <out dir>
import { renderToStaticMarkup } from "react-dom/server";
import { applyBatch, createScene, type Scene } from "@/lib/board";
import { fitView, type PlayStep } from "@/lib/board-svg";
import { MayaBoard } from "@/components/maya-board";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

type Cmd = Record<string, unknown>;
const board = (batches: Cmd[][]): { steps: PlayStep[]; scene: Scene } => {
  let scene = createScene();
  const steps: PlayStep[] = [];
  batches.forEach((commands, i) => {
    const r = applyBatch(scene, { transactionId: `t${i}`, commands });
    if (!r.ok) throw new Error(`batch ${i}: ${JSON.stringify(r.refusal)}`);
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased });
  });
  return { steps, scene };
};
const chart = (id: string, number: string): Cmd => ({ op: "place_chart", id, number, place: { region: "main" } });
const parts = (id: string): Cmd => ({ op: "place_chart", id, parts: [{ place: "ones", digit: "5" }, { place: "tenths", digit: "8" }], place: { region: "main" } });
const band = (objectId: string, column: string) => ({ objectId, part: "piece", piece: `band-${column}` });
const cell = (objectId: string, rowId: string, column: string) => ({ objectId, part: "cell", rowId, column });
const row = (objectId: string, rowId: string) => ({ objectId, part: "row", rowId });

const SCREENS: { file: string; title: string; maya: string; batches: Cmd[][] }[] = [
  {
    file: "a-chart-highlight",
    title: "Find the column",
    maya: "I colored the ten thousands place. Count the places from the right: ones, tens, hundreds, thousands, ten thousands.",
    batches: [[chart("c", "53172")], [{ op: "mark", id: "m1", target: band("c", "ten_thousands"), style: "highlight" }]],
  },
  {
    file: "b-value-step",
    title: "Digit times place",
    maya: "Yes! 5 ten thousands is 50,000.",
    batches: [
      [chart("c", "53172")],
      [{ op: "mark", id: "m1", target: band("c", "ten_thousands"), style: "highlight" }],
      [{ op: "put", target: cell("c", "value", "ten_thousands"), value: "50000" }, { op: "put", target: row("c", "equation"), value: "5 × 10,000 = 50,000" }],
    ],
  },
  {
    file: "c-compare",
    title: "Compare two digits",
    maya: "Yes, it's true. 8 is bigger than 2.",
    batches: [
      [chart("c", "785243")],
      [{ op: "mark", id: "m1", target: band("c", "ten_thousands"), style: "highlight" }, { op: "mark", id: "m2", target: band("c", "hundreds"), style: "highlight" }],
      [{ op: "put", target: row("c", "equation"), value: "8 > 2" }],
    ],
  },
  {
    file: "d-tenths",
    title: "Wholes and tenths",
    maya: "I wrote 5 in the ones place. The decimal point comes next. What goes in the tenths place?",
    batches: [
      [parts("c")],
      [{ op: "mark", id: "m1", target: band("c", "tenths"), style: "highlight" }],
      [{ op: "put", target: cell("c", "digits", "ones"), value: "5" }],
    ],
  },
  {
    file: "e-phone",
    title: "Phone width",
    maya: "I colored the ten thousands place. Count the places from the right: ones, tens, hundreds, thousands, ten thousands.",
    batches: [[chart("c", "785243")], [{ op: "mark", id: "m1", target: band("c", "ten_thousands"), style: "highlight" }]],
  },
];

const css = readFileSync("src/components/maya-board.css", "utf8");
const out = process.argv[2];
mkdirSync(out, { recursive: true });
for (const s of SCREENS) {
  const { steps } = board(s.batches);
  const paths = steps.flatMap((x) => x.drawn);
  const svg = renderToStaticMarkup(<MayaBoard steps={steps} viewBox={fitView(paths, 0.04)} label={s.title} instant />);
  const phone = s.file.startsWith("e-");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
:root{--ink:#14151a;--line:#e4e4e7}
body{margin:0;background:#f4f1ea;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#14151a}
.wrap{width:${phone ? 390 : 920}px;padding:${phone ? 12 : 24}px;box-sizing:border-box}
.cap{display:flex;gap:10px;align-items:flex-start;margin-top:14px}
.av{flex:none;width:30px;height:30px;border-radius:50%;background:#16a06a;color:#fff;font-weight:700;display:grid;place-items:center;font-size:15px}
.bubble{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:9px 13px;font-size:${phone ? 15 : 17}px;line-height:1.35}
.tag{font-size:12px;color:#6b6e78;margin:0 0 8px;letter-spacing:.02em}
</style></head><body><div class="wrap"><p class="tag">${s.title} · the board as the child sees it; the speech bubble is Maya's line, not part of the board</p>${svg}<div class="cap"><div class="av">M</div><div class="bubble">${s.maya}</div></div></div></body></html>`;
  writeFileSync(`${out}/${s.file}.html`, html);
}
console.log("wrote", SCREENS.length, "pages to", out);

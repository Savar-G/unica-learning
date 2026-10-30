// Base-ten blocks: hundreds as flats, tens as rods and ones as cubes, laid out left to right by place and standing on one
// baseline. A rod is ten cubes tall and a flat is ten rods wide, so the sizes show the place values. Each block is a
// named part ("hundred-2", "ten-3", "one-5") and each place a group ("hundreds", "tens", "ones").
import { fields, grow, int, invalid, rectOutline, serpentine, union, type ModelKind } from "@/lib/board/model-kind";
import type { Point } from "@/lib/board/glyphs";
import type { LocalStroke, LocalTarget } from "@/lib/board/representation";
import type { Rect } from "@/lib/board/types";

export interface BaseTenSpec {
  kind: "base_ten";
  hundreds: number;
  tens: number;
  ones: number;
}

/** The most blocks of each place: up to 19 tens or ones shows a group before or after an exchange. */
export const BASE_TEN_LIMITS = { hundreds: 9, tens: 19, ones: 19 } as const;

/** A cube's side in cells. */
const U = 0.3;
const PAD = 0.2;
const GROUP_GAP = 1;
const ROW_GAP = 0.5;
const GROUPS = [
  { group: "hundreds", unit: "hundred", w: 10 * U, h: 10 * U, gap: 0.5, perRow: 3 },
  { group: "tens", unit: "ten", w: U, h: 10 * U, gap: U, perRow: 10 },
  { group: "ones", unit: "one", w: U, h: U, gap: 0.2, perRow: 5 },
] as const;
type Group = (typeof GROUPS)[number]["group"];

interface Block {
  name: string;
  group: Group;
  rect: Rect;
}

/** Every block with its rectangle, and the size of the whole model. */
function arrange(spec: BaseTenSpec): { blocks: Block[]; w: number; h: number } {
  const used = GROUPS.filter((g) => spec[g.group] > 0).map((g) => {
    const n = spec[g.group];
    const cols = Math.min(n, g.perRow);
    const rows = Math.ceil(n / g.perRow);
    return { ...g, n, w: cols * g.w + (cols - 1) * g.gap, h: rows * g.h + (rows - 1) * ROW_GAP, unitW: g.w, unitH: g.h };
  });
  const height = Math.max(...used.map((g) => g.h));
  const blocks: Block[] = [];
  let x = PAD;
  for (const g of used) {
    const top = PAD + height - g.h;
    for (let i = 0; i < g.n; i++) {
      const row = Math.floor(i / g.perRow);
      const col = i % g.perRow;
      blocks.push({ name: `${g.unit}-${i + 1}`, group: g.group, rect: { x: x + col * (g.unitW + g.gap), y: top + row * (g.unitH + ROW_GAP), w: g.unitW, h: g.unitH } });
    }
    x += g.w + GROUP_GAP;
  }
  return { blocks, w: Math.ceil(x - GROUP_GAP + PAD), h: Math.ceil(height + 2 * PAD) };
}

/** The inner lines of a block: one per cube it is made of. */
function innerLines(r: Rect): { across: [Point, Point][]; down: [Point, Point][] } {
  const across: [Point, Point][] = [];
  const down: [Point, Point][] = [];
  for (let i = 1; i < Math.round(r.h / U); i++) across.push([[r.x, r.y + i * U], [r.x + r.w, r.y + i * U]]);
  for (let i = 1; i < Math.round(r.w / U); i++) down.push([[r.x + i * U, r.y], [r.x + i * U, r.y + r.h]]);
  return { across, down };
}

export const baseTen: ModelKind<BaseTenSpec> = {
  parse(raw) {
    const o = fields(raw, "base_ten model", ["kind", "hundreds", "tens", "ones"]);
    const spec: BaseTenSpec = {
      kind: "base_ten",
      hundreds: int(o.hundreds, "hundreds", 0, BASE_TEN_LIMITS.hundreds),
      tens: int(o.tens, "tens", 0, BASE_TEN_LIMITS.tens),
      ones: int(o.ones, "ones", 0, BASE_TEN_LIMITS.ones),
    };
    if (spec.hundreds + spec.tens + spec.ones === 0) invalid("A base_ten model needs at least one block.");
    return spec;
  },
  layout(spec) {
    const { w, h } = arrange(spec);
    return { w, h };
  },
  targets(spec, objectId) {
    const { blocks, w, h } = arrange(spec);
    const out: LocalTarget[] = [
      {
        target: { objectId, part: "whole" },
        label: `${objectId}: base-ten blocks, ${spec.hundreds} hundreds, ${spec.tens} tens, ${spec.ones} ones`,
        writable: false,
        value: String(100 * spec.hundreds + 10 * spec.tens + spec.ones),
        rect: { x: 0, y: 0, w, h },
      },
    ];
    for (const g of GROUPS) {
      const mine = blocks.filter((b) => b.group === g.group);
      if (mine.length === 0) continue;
      out.push({ target: { objectId, part: "piece", piece: g.group }, label: `${objectId} ${g.group}`, writable: false, value: String(mine.length), rect: grow(union(mine.map((b) => b.rect)), 0.25) });
    }
    for (const b of blocks)
      out.push({ target: { objectId, part: "piece", piece: b.name }, label: `${objectId} ${b.name.replace("-", " ")}`, writable: false, value: null, rect: b.rect });
    return out;
  },
  draw(spec, pen) {
    const out: LocalStroke[] = [];
    for (const b of arrange(spec).blocks) {
      const base = { objectId: pen.objectId, target: { objectId: pen.objectId, part: "piece" as const, piece: b.name }, kind: "rule" as const, layer: "math" as const, ink: pen.ink, seq: pen.seq };
      out.push({ ...base, key: `${b.name}/outline`, width: 0.05, pts: rectOutline(b.rect) });
      const { across, down } = innerLines(b.rect);
      if (across.length > 0) out.push({ ...base, key: `${b.name}/across`, width: 0.025, pts: serpentine(across) });
      if (down.length > 0) out.push({ ...base, key: `${b.name}/down`, width: 0.025, pts: serpentine(down) });
    }
    return out;
  },
};

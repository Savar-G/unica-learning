// Fraction strips: one whole of a fixed length split into equal parts, the first parts shaded. Every strip is the same
// length, so two strips stacked line up part for part (1/2 over 2/4). Each part is a named part ("part-3"), and so are
// the shaded and the unshaded parts together.
import { fields, int, rectOutline, serpentine, type ModelKind } from "@/lib/board/model-kind";
import type { Point } from "@/lib/board/glyphs";
import type { LocalStroke, LocalTarget } from "@/lib/board/representation";
import type { Rect } from "@/lib/board/types";
import { gcd } from "@/lib/question-package-math";

export interface FractionStripSpec {
  kind: "fraction_strip";
  /** How many equal parts the whole is split into. */
  parts: number;
  /** How many parts are shaded, from the left. */
  shaded: number;
}

export const FRACTION_STRIP_LIMITS = { parts: 12 } as const;

/** The whole's length and height in cells: 12 splits evenly into halves, thirds, quarters, sixths and twelfths. */
const LENGTH = 12;
const HEIGHT = 2;
/** Room around the strip, in cells, so the pen's width stays inside the model's space. */
const PAD = 0.5;
/** The gap between shading lines, in cells. */
const HATCH = 0.25;

const partRect = (spec: FractionStripSpec, from: number, to: number): Rect => ({ x: PAD + (from * LENGTH) / spec.parts, y: PAD, w: ((to - from) * LENGTH) / spec.parts, h: HEIGHT });

export const fractionStrip: ModelKind<FractionStripSpec> = {
  parse(raw) {
    const o = fields(raw, "fraction_strip model", ["kind", "parts", "shaded"]);
    const parts = int(o.parts, "parts", 1, FRACTION_STRIP_LIMITS.parts);
    return { kind: "fraction_strip", parts, shaded: int(o.shaded, "shaded", 0, parts) };
  },
  layout: () => ({ w: LENGTH + 2 * PAD, h: HEIGHT + 2 * PAD }),
  targets(spec, objectId) {
    const { parts, shaded } = spec;
    const g = gcd(shaded, parts);
    const equal = shaded > 0 && g > 1 ? `, equal to ${shaded / g}/${parts / g}` : "";
    const out: LocalTarget[] = [
      {
        target: { objectId, part: "whole" },
        label: `${objectId}: a strip in ${parts} equal parts with ${shaded} shaded, ${shaded}/${parts}${equal}`,
        writable: false,
        value: `${shaded}/${parts}`,
        rect: partRect(spec, 0, parts),
      },
    ];
    if (shaded > 0) out.push({ target: { objectId, part: "piece", piece: "shaded" }, label: `${objectId} shaded parts`, writable: false, value: `${shaded}/${parts}`, rect: partRect(spec, 0, shaded) });
    if (shaded < parts)
      out.push({ target: { objectId, part: "piece", piece: "unshaded" }, label: `${objectId} unshaded parts`, writable: false, value: `${parts - shaded}/${parts}`, rect: partRect(spec, shaded, parts) });
    for (let i = 1; i <= parts; i++)
      out.push({ target: { objectId, part: "piece", piece: `part-${i}` }, label: `${objectId} part ${i}`, writable: false, value: `1/${parts}`, rect: partRect(spec, i - 1, i) });
    return out;
  },
  draw(spec, pen) {
    const base = { objectId: pen.objectId, kind: "rule" as const, ink: pen.ink, seq: pen.seq };
    const out: LocalStroke[] = [];
    if (spec.shaded > 0) {
      // Hand shading: upright lines across the shaded parts, kept inside them.
      const r = partRect(spec, 0, spec.shaded);
      const lines: [Point, Point][] = [];
      for (let x = r.x + HATCH; x < r.x + r.w - HATCH / 2; x += HATCH) lines.push([[x, r.y + 0.1], [x, r.y + r.h - 0.1]]);
      out.push({ ...base, key: "shaded", target: { objectId: pen.objectId, part: "piece", piece: "shaded" }, layer: "behind", width: 0.04, opacity: 0.6, pts: serpentine(lines) });
    }
    for (let i = 1; i <= spec.parts; i++)
      out.push({ ...base, key: `part-${i}`, target: { objectId: pen.objectId, part: "piece", piece: `part-${i}` }, layer: "math", width: 0.06, pts: rectOutline(partRect(spec, i - 1, i)) });
    return out;
  },
};

// Arrays: rows of equal items, one item per grid cell. Each item is a named part ("item-2-3" is row 2, column 3), and so
// is each row and each column, so Maya can point at one row of a multiplication fact.
import { around, ellipse, fields, int, type ModelKind } from "@/lib/board/model-kind";
import type { LocalStroke, LocalTarget } from "@/lib/board/representation";

export interface ArraySpec {
  kind: "array";
  rows: number;
  columns: number;
}

export const ARRAY_LIMITS = { rows: 10, columns: 10 } as const;

const DOT = 0.5;

export const array: ModelKind<ArraySpec> = {
  parse(raw) {
    const o = fields(raw, "array model", ["kind", "rows", "columns"]);
    return { kind: "array", rows: int(o.rows, "rows", 1, ARRAY_LIMITS.rows), columns: int(o.columns, "columns", 1, ARRAY_LIMITS.columns) };
  },
  layout: (spec) => ({ w: spec.columns, h: spec.rows }),
  targets(spec, objectId) {
    const { rows, columns } = spec;
    const out: LocalTarget[] = [
      { target: { objectId, part: "whole" }, label: `${objectId}: an array of ${rows} rows of ${columns}`, writable: false, value: String(rows * columns), rect: { x: 0, y: 0, w: columns, h: rows } },
    ];
    for (let r = 1; r <= rows; r++)
      out.push({ target: { objectId, part: "piece", piece: `row-${r}` }, label: `${objectId} row ${r}`, writable: false, value: String(columns), rect: { x: 0, y: r - 1, w: columns, h: 1 } });
    for (let c = 1; c <= columns; c++)
      out.push({ target: { objectId, part: "piece", piece: `column-${c}` }, label: `${objectId} column ${c}`, writable: false, value: String(rows), rect: { x: c - 1, y: 0, w: 1, h: rows } });
    for (let r = 1; r <= rows; r++)
      for (let c = 1; c <= columns; c++)
        out.push({ target: { objectId, part: "piece", piece: `item-${r}-${c}` }, label: `${objectId} row ${r} item ${c}`, writable: false, value: null, rect: around([c - 0.5, r - 0.5], DOT + 0.2) });
    return out;
  },
  draw(spec, pen) {
    const out: LocalStroke[] = [];
    for (let r = 1; r <= spec.rows; r++)
      for (let c = 1; c <= spec.columns; c++) {
        const name = `item-${r}-${c}`;
        out.push({
          key: name,
          objectId: pen.objectId,
          target: { objectId: pen.objectId, part: "piece", piece: name },
          kind: "circle",
          layer: "math",
          ink: pen.ink,
          width: 0.07,
          seq: pen.seq,
          pts: ellipse(c - 0.5, r - 0.5, DOT / 2, DOT / 2, 16),
        });
      }
    return out;
  },
};

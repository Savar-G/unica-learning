import type { Point } from "@/lib/workbook-print-contract";

/** A visible paper edge supplies a line constraint when several points agree on its position. */
export function paperEdges(photo: { width: number; height: number }, grey: (x: number, y: number) => number, at: (p: Point) => Point, page: { width: number; height: number }) {
  const { width, height } = page;
  const sides = [
    { x: 0, y: 0, dx: width, dy: 0, nx: 0, ny: 1 },
    { x: width, y: 0, dx: 0, dy: height, nx: -1, ny: 0 },
    { x: 0, y: height, dx: width, dy: 0, nx: 0, ny: -1 },
    { x: 0, y: 0, dx: 0, dy: height, nx: 1, ny: 0 },
  ];
  const reach = Math.min(32, Math.max(8, Math.round(photo.width * 0.015)));
  return sides.flatMap(({ x, y, dx, dy, nx, ny }) => {
    const samples = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85].flatMap((f) => {
      const from = { x: x + f * dx, y: y + f * dy };
      const p = at(from), inside = at({ x: from.x + 16 * nx, y: from.y + 16 * ny });
      const length = Math.hypot(inside.x - p.x, inside.y - p.y);
      if (!Number.isFinite(length) || length === 0) return [];
      const n = { x: (inside.x - p.x) / length, y: (inside.y - p.y) / length };
      let strongest = 20, first = 0, last = 0;
      for (let d = -reach; d <= reach; d++) {
        const u = p.x + d * n.x, v = p.y + d * n.y;
        if (Math.min(u, v, photo.width - u, photo.height - v) < 7) continue;
        const contrast = grey(u + 4 * n.x, v + 4 * n.y) - grey(u - 4 * n.x, v - 4 * n.y);
        if (contrast > strongest) { strongest = contrast; first = d; last = d; }
        else if (contrast === strongest && d === last + 1) last = d;
      }
      const shift = (first + last) / 2;
      return strongest > 20 && Math.abs(shift) < reach ? [{ from, to: { x: p.x + shift * n.x, y: p.y + shift * n.y }, shift }] : [];
    });
    const middle = samples.map((p) => p.shift).sort((a, b) => a - b)[samples.length >> 1];
    const aligned = samples.filter((p) => Math.abs(p.shift - middle) <= 4);
    return aligned.length >= 5 ? aligned : [];
  });
}

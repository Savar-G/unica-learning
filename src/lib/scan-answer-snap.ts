import type { Point } from "@/lib/workbook-print-contract";

type PrintSample = Point & { grey: number };

/** Normalized correlation of fixed print samples at each translation in native photo pixels. */
export function snapPrint(groups: readonly (readonly PrintSample[])[], photo: Uint8Array, width: number, limit: number): { offset: Point; atLimit: boolean } | null {
  const scores = groups.map((samples) => printScore(samples, photo, width));
  if (scores.some((score) => !score)) return null;
  let score = -1, offset = { x: 0, y: 0 };
  const guard = limit + 1;
  for (let y = -guard; y <= guard; y++) for (let x = -guard; x <= guard; x++) {
    const r = Math.min(...scores.map((read) => read?.(x, y) ?? -1));
    if (r > score + 0.001 || (Math.abs(r - score) <= 0.001 && Math.hypot(x, y) < Math.hypot(offset.x, offset.y))) {
      score = r;
      offset = { x, y };
    }
  }
  return score >= 0.45 ? { offset, atLimit: Math.max(Math.abs(offset.x), Math.abs(offset.y)) > limit } : null;
}

function printScore(samples: readonly PrintSample[], photo: Uint8Array, width: number) {
  const n = samples.length;
  if (!n) return null;
  const mean = samples.reduce((s, p) => s + p.grey, 0) / n;
  const centered = samples.map((p) => {
    const x = p.x - 0.5, y = p.y - 0.5, col = Math.floor(x), row = Math.floor(y);
    return { index: row * width + col, fx: x - col, fy: y - row, grey: p.grey - mean };
  });
  const spread = centered.reduce((s, p) => s + p.grey * p.grey, 0);
  if (spread < n * 16) return null;
  // Read the paper shade once for the toner-shine fold. The upper middle of the sample is usually blank paper.
  const tones = centered.map((s) => photo[s.index]).sort((a, b) => a - b);
  const paper = tones[Math.floor(n * 0.7)];
  return (x: number, y: number) => {
    let sum = 0, squares = 0, cross = 0, foldSum = 0, foldSquares = 0, foldCross = 0;
    for (const s of centered) {
      const i = s.index + y * width + x;
      const top = photo[i] * (1 - s.fx) + photo[i + 1] * s.fx;
      const bottom = photo[i + width] * (1 - s.fx) + photo[i + width + 1] * s.fx;
      const v = top * (1 - s.fy) + bottom * s.fy;
      const f = paper - Math.abs(v - paper);
      sum += v; squares += v * v; cross += s.grey * v;
      foldSum += f; foldSquares += f * f; foldCross += s.grey * f;
    }
    const variance = squares - sum * sum / n, foldVariance = foldSquares - foldSum * foldSum / n;
    return Math.max(variance > 0 ? cross / Math.sqrt(spread * variance) : -1,
      foldVariance > 0 ? foldCross / Math.sqrt(spread * foldVariance) : -1);
  };
}

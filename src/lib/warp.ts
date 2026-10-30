// Perspective warp: the CSS matrix3d that maps a w x h box onto four corner points (top-left, top-right,
// bottom-left, bottom-right). The What's included page uses it to lay real workbook pages and app screens
// onto a photo. Pure math, so it runs on the server and the transform is in the first HTML.

export type Quad = readonly [number, number, number, number, number, number, number, number];

type M3 = number[];

function adj(m: M3): M3 {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}

function mul(a: M3, b: M3): M3 {
  const c: M3 = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
    c[3 * i + j] = s;
  }
  return c;
}

function mulV(m: M3, v: number[]): number[] {
  return [0, 1, 2].map((i) => m[3 * i] * v[0] + m[3 * i + 1] * v[1] + m[3 * i + 2] * v[2]);
}

// The projective map from the unit square's basis to four points.
function basis(q: Quad): M3 {
  const [x1, y1, x2, y2, x3, y3, x4, y4] = q;
  const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = mulV(adj(m), [x4, y4, 1]);
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** The 3 x 3 homography (row-major, last value 1) that maps the box corners onto the quad. */
export function homography(w: number, h: number, quad: Quad): M3 {
  const t = mul(basis(quad), adj(basis([0, 0, w, 0, 0, h, w, h])));
  return t.map((x) => x / t[8]);
}

/** Where a point of the box lands on the photo. */
export function project(t: M3, x: number, y: number): [number, number] {
  const [px, py, pz] = mulV(t, [x, y, 1]);
  return [px / pz, py / pz];
}

/** The CSS transform for an element of size w x h with transform-origin 0 0. */
export function warpTransform(w: number, h: number, quad: Quad): string {
  const t = homography(w, h, quad);
  const r = (x: number) => +x.toPrecision(8);
  return `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].map(r).join(",")})`;
}

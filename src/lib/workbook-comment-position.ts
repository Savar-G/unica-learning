/** A keyboard click has detail 0. Pointer coordinates are fractions of the page, bounded at its edges. */
export function commentPosition(detail: number, x: number, y: number, box: {left: number; top: number; width: number; height: number}) {
  const bounded = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : .5;
  return detail === 0 ? {x: .5, y: .5} : {x: bounded((x - box.left) / box.width), y: bounded((y - box.top) / box.height)};
}

// Numeric measurements and fixed labels are enough to reconstruct the question as shown.
export type Point = [x: number, y: number];

export const BAR_CATEGORIES = ["Class A", "Class B"] as const;
export const BAR_SERIES = ["Monday", "Tuesday"] as const;
export const LINE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const POLYGONS = ["triangle", "square", "rectangle", "hexagon", "pentagon", "isosceles triangle", "rotated square"] as const;

export type DrawnFigure =
  | { kind: "clock"; hour: number; minute: number }
  | { kind: "ruler"; end: number }
  | { kind: "number-line"; intervals: number; mark: number }
  | { kind: "polygon"; shape: (typeof POLYGONS)[number] }
  | { kind: "right-triangle"; base: number; height: number | null; hypotenuse: number | null }
  | { kind: "circle"; measurement: "radius" | "diameter"; length: number }
  | { kind: "cylinder"; radius: number; height: number }
  | { kind: "net"; cells: Point[] }
  | { kind: "line-plot"; heights: number[] }
  | { kind: "grouped-bars"; scale: number; counts: [Point, Point] }
  | { kind: "truncated-bars"; start: number; first: number; second: number }
  | { kind: "coordinate-grid"; points: Point[] }
  | { kind: "circle-graph"; percent: number };

export function clockHands(hour: number, minute: number): string {
  const short = minute === 0 ? `points to ${hour}` : `is between ${hour} and ${hour % 12 + 1}`;
  const long = minute === 0 ? 12 : minute / 5;
  return `The short hand ${short}. The long hand points to ${long}.`;
}

export function numberLineMarks(intervals: number, mark: number): string {
  return `The line from 0 to 1 has ${intervals} equal parts. The dot is ${mark} ${mark === 1 ? "part" : "parts"} from 0.`;
}

// Server-safe pieces of the What's included page (D-179): Leah's Day 1 pages with her pencil answers and the app's
// marks, the Workbook 04 cover, and the Unica square mark. Positions are in the 541 x 700 page image's pixels
// (Figma 228:128, Leah's sample workbook), scaled to the width asked for.
/* eslint-disable @next/next/no-img-element -- fixed-size product mockups; next/image wrappers would break the absolute layout */
import type { CSSProperties, ReactNode } from "react";

export const ASSETS = "/whats-included";
const PAGE_W = 541;

// Day 1, page 1 (warm-up): answer box centres, Leah's answers by column, and her two slips (column-row: what she wrote).
const COLS = [153, 316, 480];
const ROWS = [182, 229, 275, 321, 368, 414, 461, 507, 553, 599];
const ANSWERS = [[13, 16, 12, 15, 13, 12, 18, 14, 13, 11], [8, 9, 5, 13, 6, 8, 9, 7, 18, 9], [13, 9, 14, 8, 19, 9, 14, 7, 14, 6]];
const WRONG: Record<string, number> = { "1-3": 7, "1-8": 12 };

type Pen = { x: number; y: number; text: string; size: number; rot?: number };
const NAME_DATE: Pen[] = [{ x: 96, y: 30, text: "Leah", size: 25, rot: -2 }, { x: 438, y: 32, text: "Oct 27", size: 20, rot: -1 }];
// Day 1, page 2: the fix for Sam's trade, and what Sam forgot.
const PAGE2_PEN: Pen[] = [
  ...NAME_DATE,
  { x: 278, y: 414, text: "3", size: 26, rot: -3 },
  { x: 333, y: 414, text: "16", size: 26, rot: 2 },
  { x: 64, y: 462, text: "He forgot the 10 ones from the trade.", size: 22, rot: -1 },
];

const px = (v: number, s: number) => `${(v * s).toFixed(1)}px`;

function PenText({ pens, s }: { pens: Pen[]; s: number }) {
  return pens.map((p) => (
    <i key={p.text + p.x} className="wi-pen" style={{ left: px(p.x, s), top: px(p.y, s), fontSize: px(p.size, s), transform: `rotate(${p.rot ?? 0}deg)` }}>{p.text}</i>
  ));
}

/** Day 1, page 1 with Leah's answers; with `marks`, the app's ticks, crosses and score in red. */
export function MarkedPage({ width, marks = false, name = false, className = "" }: { width: number; marks?: boolean; name?: boolean; className?: string }) {
  const s = width / PAGE_W;
  const cells: ReactNode[] = [];
  const red: ReactNode[] = [];
  COLS.forEach((x, c) => ROWS.forEach((y, k) => {
    const n = c * 10 + k;
    const dx = (((n * 37) % 7) - 3) * 1.2;
    const rot = (((n * 53) % 5) - 2) * 0.8;
    cells.push(
      <i key={`a${n}`} className="wi-hw" style={{ left: px(x - 19 + dx, s), top: px(y - 15, s), width: px(38, s), height: px(30, s), fontSize: px(25, s), transform: `rotate(${rot}deg)` }}>{ANSWERS[c][k]}</i>,
    );
    if (!marks) return;
    const wrote = WRONG[`${c}-${k}`];
    if (wrote) {
      red.push(<i key={`r${n}`} className="wi-ring" style={{ left: px(x - 30, s), top: px(y - 21, s), width: px(60, s), height: px(42, s) }} />);
      red.push(<i key={`x${n}`} className="wi-tk" style={{ left: px(x + 21, s), top: px(y - 16, s), fontSize: px(26, s) }}>✗<small style={{ fontSize: px(17, s) }}>{wrote}</small></i>);
    } else {
      red.push(<i key={`t${n}`} className="wi-tk" style={{ left: px(x + 21, s), top: px(y - 15, s), fontSize: px(24, s) }}>✓</i>);
    }
  }));
  return (
    <div className={`wi-mp ${className}`.trim()} style={{ width }}>
      <img src={`${ASSETS}/wb/leah-03-d1p1.jpg`} alt="" />
      {cells}
      {name && <PenText pens={NAME_DATE} s={s} />}
      {marks && (
        <div className="wi-ml">
          {red}
          <i className="wi-score" style={{ left: px(420, s), top: px(70, s), fontSize: px(34, s), padding: `${px(2, s)} ${px(12, s)}`, borderWidth: px(2.4, s) }}>28/30</i>
        </div>
      )}
    </div>
  );
}

/** Day 1, page 2 with Leah's answers. */
export function PageTwo({ width, className = "" }: { width: number; className?: string }) {
  return (
    <div className={`wi-mp ${className}`.trim()} style={{ width }}>
      <img src={`${ASSETS}/wb/leah-04-d1p2.jpg`} alt="" />
      <PenText pens={PAGE2_PEN} s={width / PAGE_W} />
    </div>
  );
}

/** The Unica mark: a 3 x 3 grid with four colour squares. */
export function Mark({ className = "" }: { className?: string }) {
  return <div className={`wi-mk ${className}`.trim()} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>;
}

export type Change = { tag: "more" | "new" | "less" | "rev"; label: string; text: string; from: number[] };
export const TAG_LABEL: Record<Change["tag"], string> = { more: "More", new: "New", less: "Less", rev: "Review" };

/** The next workbook's cover, in the Figma cover style. With `changes`, the box lists each change and its sources. */
export function NextCover({ changes, zoom = 1, style }: { changes?: Change[]; zoom?: number; style?: CSSProperties }) {
  return (
    <div className="wi-cv" style={{ zoom, ...style }}>
      <div className="wi-cv-top"><span className="wi-cv-wm">Unica Learning<i /></span><span className="wi-cv-n">Workbook 04</span></div>
      <Mark className="wi-cv-mk" />
      <div className="wi-cv-for">Made for Leah · Grade 3 · Adding and subtracting to 1000</div>
      <div className="wi-cv-t">Borrowing across<br /><mark>zero</mark></div>
      <div className="wi-cv-box">
        <b>Made from Leah&apos;s Workbook 03</b>
        {changes ? (
          <ul className="wi-cvl">
            {changes.map((c) => (
              <li key={c.label}><b className={`wi-t ${c.tag}`}>{TAG_LABEL[c.tag]}</b>{c.text}{c.from.map((n) => <i key={n}>{n}</i>)}</li>
            ))}
          </ul>
        ) : (
          <ul><li>More practice: borrowing across a zero</li><li>Less practice: carrying, now strong</li><li>A step ahead: 3-digit word problems</li></ul>
        )}
      </div>
    </div>
  );
}

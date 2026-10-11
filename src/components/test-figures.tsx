// Figures in the test's questions (#79, from the #74 bank): the shape glyphs drawn as real shapes of one size, the dot
// rows of a picture graph lined up, a choice that is a line drawn as a line, and a bar graph. Fonts draw ▬ as a dash,
// ▮ tiny and ■ smaller than ▲, so the screen draws them itself.
import type { CSSProperties, ReactNode } from "react";
import { isLineChoice, type BarFigure } from "@/lib/assessment";
import "./test-base.css";
import "./test-figures.css";

const SHAPES: Record<string, { word: string; draw: ReactNode }> = {
  "●": { word: "circle", draw: <circle cx="10" cy="10" r="8" /> },
  "■": { word: "square", draw: <rect x="2.5" y="2.5" width="15" height="15" /> },
  "▲": { word: "triangle", draw: <path d="M10 2 L18.5 17.5 H1.5 Z" /> },
  "▼": { word: "triangle", draw: <path d="M10 18 L18.5 2.5 H1.5 Z" /> },
  "★": { word: "star", draw: <path d="M10 1.5 l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7Z" /> },
  "◆": { word: "diamond", draw: <path d="M10 1.5 L18.5 10 L10 18.5 L1.5 10 Z" /> },
  "▬": { word: "rectangle", draw: <rect x="0.5" y="5.5" width="19" height="9" /> },
  "▮": { word: "rectangle", draw: <rect x="5.5" y="1.5" width="9" height="17" /> },
};
const GLYPH_RE = /([●■▲▼★◆▬▮])/;

/** One shape, drawn at the size of a capital letter. The word is there for screen readers. */
function Glyph({ g }: { g: string }) {
  const shape = SHAPES[g];
  return (
    <span className="test-glyph">
      <svg viewBox="0 0 20 20" aria-hidden>{shape.draw}</svg>
      <span className="sr-only">{shape.word}</span>
    </span>
  );
}

/** Text with its shape glyphs drawn. */
function Inline({ text }: { text: string }) {
  return <>{text.split(GLYPH_RE).map((part, i) => (SHAPES[part] ? <Glyph key={i} g={part} /> : part))}</>;
}

/** "Cats: ● ● ●." A sentence that is a label and a row of glyphs (kit.ts row(), joined with no-break spaces). */
const ROW_RE = /^(.+?): ([●■▲★](?: [●■▲★])*)\.$/;

/**
 * A question's words, with a picture graph's rows lined up: each row's label in one column and its glyphs in equal
 * cells, so the rows can be compared by eye. Other text stays as it is, with its glyphs drawn.
 */
export function PromptText({ text }: { text: string }) {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const parts: ReactNode[] = [];
  let rows: { label: string; glyphs: string[] }[] = [];
  const flush = () => {
    if (rows.length === 0) return;
    const group = rows;
    parts.push(
      <span key={`rows${parts.length}`} className="test-rows">
        {group.map((r) => (
          <span key={r.label} className="test-row">
            <span className="test-row-label">{r.label}</span>
            <span className="test-row-cells">{r.glyphs.map((g, i) => <span key={i} className="test-row-cell"><Glyph g={g} /></span>)}</span>
          </span>
        ))}
      </span>,
    );
    rows = [];
  };
  for (const sentence of sentences) {
    const m = sentence.match(ROW_RE);
    if (m) {
      rows.push({ label: m[1], glyphs: m[2].split(" ") });
      continue;
    }
    flush();
    parts.push(<span key={`t${parts.length}`}>{parts.length > 0 ? " " : ""}<Inline text={sentence} /></span>);
  }
  flush();
  return <>{parts}</>;
}

/** What a choice row shows: a line drawn to its length (they all start at the same place), or the text with its glyphs. */
export function ChoiceFace({ text }: { text: string }) {
  if (isLineChoice(text)) return <span className="test-line" style={{ "--units": text.length } as CSSProperties} aria-hidden />;
  // One element, so the row's flex gap does not space out the glyphs.
  return <span className="test-choice-face"><Inline text={text} /></span>;
}

/** A bar graph to read: one bar per row against a scale from 0, with a line at every unit. */
export function BarGraph({ figure }: { figure: BarFigure }) {
  const top = Math.max(...figure.bars.map((b) => b.value));
  const max = Math.ceil((top + 1) / 2) * 2;
  const step = max > 12 ? 2 : 1;
  const [labelW, plotW, rowH, axisH] = [104, 300, 46, 28];
  const x = (v: number) => labelW + (v / max) * plotW;
  const height = figure.bars.length * rowH + axisH;
  const units = Array.from({ length: max + 1 }, (_, v) => v);
  const said = figure.bars.map((b) => `${b.label}: ${b.value}`).join(". ");
  return (
    <figure className="test-bars">
      <svg viewBox={`0 0 ${labelW + plotW + 16} ${height}`} role="img" aria-label={`Bar graph. ${said}.`}>
        {units.map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={4} y2={height - axisH} className={v % step === 0 ? "is-major" : undefined} />
        ))}
        {figure.bars.map((b, i) => (
          <g key={b.label}>
            <text x={labelW - 12} y={i * rowH + rowH / 2 + 5} textAnchor="end" className="test-bars-label">{b.label}</text>
            <rect x={x(0)} y={i * rowH + 10} width={x(b.value) - x(0)} height={rowH - 20} rx={3} className={`test-bars-bar is-${i % 2 ? "b" : "a"}`} />
          </g>
        ))}
        {units.filter((v) => v % step === 0).map((v) => (
          <text key={v} x={x(v)} y={height - 8} textAnchor="middle" className="test-bars-num">{v}</text>
        ))}
      </svg>
    </figure>
  );
}

import type { ReactNode } from "react";
import { BAR_CATEGORIES, BAR_SERIES, clockHands, LINE_DAYS, numberLineMarks, type DrawnFigure, type Point } from "@/lib/assessment/figure-data";

const sequence = (length: number) => Array.from({ length }, (_, index) => index);
const points = (vertices: readonly Point[]) => vertices.map(([x, y]) => `${x},${y}`).join(" ");

function Drawing({ width, height, description, children }: {
  width: number; height: number; description: string; children: ReactNode;
}) {
  return <figure className="test-drawing" style={{ maxWidth: width }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={description}>{children}</svg>
  </figure>;
}

function Clock({ figure }: { figure: Extract<DrawnFigure, { kind: "clock" }> }) {
  const { hour, minute } = figure;
  const point = (turn: number, distance: number) => ({
    x: 88 + Math.sin(turn * 2 * Math.PI) * distance,
    y: 88 - Math.cos(turn * 2 * Math.PI) * distance,
  });
  const short = point((hour + minute / 60) / 12, 33);
  const long = point(minute / 60, 52);
  return <Drawing width={176} height={176} description={`Analog clock. ${clockHands(hour, minute)}`}>
    <circle cx="88" cy="88" r="82" className="test-drawing-fill" />
    {sequence(60).map((i) => {
      const from = point(i / 60, i % 5 === 0 ? 73 : 77);
      const to = point(i / 60, 81);
      return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={i % 5 ? "test-drawing-minor" : undefined} />;
    })}
    {sequence(12).map((i) => {
      const position = point(i / 12, 61);
      return <text key={i} x={position.x} y={position.y} dominantBaseline="central">{i || 12}</text>;
    })}
    <line x1="88" y1="88" x2={short.x} y2={short.y} strokeWidth="5" strokeLinecap="round" />
    <line x1="88" y1="88" x2={long.x} y2={long.y} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="88" cy="88" r="3.5" fill="currentColor" stroke="none" />
  </Drawing>;
}

function Ruler({ end }: { end: number }) {
  const x = (cm: number) => 23 + cm * 22;
  return <Drawing width={310} height={112} description={`Centimetre ruler. The pencil starts at the 0 mark and ends at the ${end} mark.`}>
    <path d={`M${x(0)} 9 H${x(end) - 13} L${x(end)} 16 L${x(end) - 13} 23 H${x(0)} Z`} className="test-drawing-fill" />
    <line x1={x(0)} y1="23" x2={x(0)} y2="39" className="test-drawing-guide" />
    <line x1={x(end)} y1="16" x2={x(end)} y2="39" className="test-drawing-guide" />
    <rect x="8" y="39" width="294" height="64" rx="4" className="test-drawing-fill" />
    {sequence(13).map((i) => <g key={i}>
      <line x1={x(i)} y1="39" x2={x(i)} y2="56" />
      {i < 12 && <line x1={x(i + 0.5)} y1="39" x2={x(i + 0.5)} y2="48" className="test-drawing-minor" />}
      <text x={x(i)} y="73">{i}</text>
    </g>)}
    <text x="287" y="96">cm</text>
  </Drawing>;
}

function NumberLine({ intervals, mark }: { intervals: number; mark: number }) {
  const x = (i: number) => 20 + i / intervals * 260;
  return <Drawing width={300} height={62} description={numberLineMarks(intervals, mark)}>
    <line x1={x(0)} x2={x(intervals)} y1="25" y2="25" />
    {sequence(intervals + 1).map((i) => <line key={i} x1={x(i)} x2={x(i)} y1="18" y2="32" />)}
    <circle cx={x(mark)} cy="25" r="5" fill="currentColor" stroke="none" />
    <text x={x(0)} y="51">0</text><text x={x(intervals)} y="51">1</text>
  </Drawing>;
}

function Polygon({ shape }: { shape: Extract<DrawnFigure, { kind: "polygon" }>["shape"] }) {
  const regular = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, "rotated square": 4 };
  let vertices: Point[];
  if (shape === "rectangle") vertices = [[20, 32], [140, 32], [140, 96], [20, 96]];
  else if (shape === "isosceles triangle") vertices = [[80, 12], [133, 111], [27, 111]];
  else {
    const offset = shape === "square" ? Math.PI / 4 : 0;
    vertices = sequence(regular[shape]).map((i) => {
      const angle = offset + i / regular[shape] * 2 * Math.PI;
      return [80 + Math.sin(angle) * 55, 64 - Math.cos(angle) * 55];
    });
  }
  const description = shape === "rectangle" ? "Four square corners, two long sides and two short sides."
    : shape === "triangle" ? "Three equal straight sides and three corners."
    : shape === "pentagon" || shape === "hexagon" ? `Regular ${shape}.`
    : shape === "isosceles triangle" ? "Triangle with exactly two equal sides." : "Four equal sides and four square corners.";
  return <Drawing width={160} height={128} description={description}>
    <polygon points={points(vertices)} className="test-drawing-fill" />
  </Drawing>;
}

function Geometry({ figure }: { figure: Extract<DrawnFigure, { kind: "circle" | "cylinder" | "right-triangle" | "net" }> }) {
  switch (figure.kind) {
    case "circle": {
      const { measurement, length } = figure;
      return <Drawing width={158} height={144} description={`Circle. The ${measurement} is ${length} centimetres.`}>
        <circle cx="79" cy="72" r="62" className="test-drawing-fill" />
        <line x1={measurement === "radius" ? 79 : 17} x2="141" y1="72" y2="72" />
        <circle cx="79" cy="72" r="3" fill="currentColor" stroke="none" />
        <text x={measurement === "radius" ? 104 : 79} y="61">{length} cm</text>
      </Drawing>;
    }
    case "cylinder": {
      const { radius, height } = figure;
      return <Drawing width={192} height={150} description={`Cylinder with a radius of ${radius} centimetres and a height of ${height} centimetres.`}>
        <path d="M25 39 V114 A54 16 0 0 0 133 114 V39" className="test-drawing-fill" />
        <ellipse cx="79" cy="39" rx="54" ry="16" className="test-drawing-fill" />
        <line x1="79" x2="133" y1="39" y2="39" /><circle cx="79" cy="39" r="2.5" fill="currentColor" stroke="none" />
        <text x="109" y="17">{radius} cm</text>
        <line x1="144" x2="144" y1="39" y2="114" className="test-drawing-guide" />
        <line x1="140" x2="148" y1="39" y2="39" /><line x1="140" x2="148" y1="114" y2="114" />
        <text x="169" y="80">{height} cm</text>
      </Drawing>;
    }
    case "right-triangle": {
      const { base, height, hypotenuse } = figure;
      const description = height === null
        ? `Right triangle. One leg is ${base} centimetres and the hypotenuse is ${hypotenuse} centimetres. The other leg is missing.`
        : `Right triangle with legs of ${base} and ${height} centimetres. The hypotenuse is missing.`;
      const leg = height ?? Math.sqrt((hypotenuse ?? 0) ** 2 - base ** 2);
      const scale = Math.min(156 / base, 100 / leg);
      const right = 53 + base * scale, top = 116 - leg * scale;
      const centreX = (53 + right) / 2, centreY = (top + 116) / 2;
      return <Drawing width={236} height={146} description={description}>
        <path d={`M53 ${top} V116 H${right} Z`} className="test-drawing-fill" />
        <path d="M53 102 H67 V116" fill="none" />
        <text x="25" y={centreY + 4}>{height === null ? "?" : `${height} cm`}</text>
        <text x={centreX} y="138">{base} cm</text>
        <text x={centreX + 15} y={centreY - 10}>{hypotenuse === null ? "?" : `${hypotenuse} cm`}</text>
      </Drawing>;
    }
    case "net": {
      const { cells } = figure;
      const rows = [...new Set(cells.map(([, row]) => row))].sort((a, b) => a - b);
      const description = rows.map((row) => {
        const columns = cells.filter(([, y]) => y === row).map(([x]) => ["A", "B", "C", "D"][x]).sort();
        return `Row ${row + 1}: ${columns.join(", ")}.`;
      }).join(" ");
      return <Drawing width={218} height={172} description={`Six equal squares on a grid. ${description}`}>
        {["A", "B", "C", "D"].map((letter, i) => <text key={letter} x={55 + i * 44} y="18">{letter}</text>)}
        {[1, 2, 3].map((row) => <text key={row} x="16" y={57 + (row - 1) * 44}>{row}</text>)}
        {cells.map(([x, y]) => <rect key={`${x},${y}`} x={33 + x * 44} y={30 + y * 44} width="44" height="44" className="test-drawing-fill" />)}
      </Drawing>;
    }
  }
}

function PlottedGraph({ figure }: { figure: Extract<DrawnFigure, { kind: "line-plot" | "grouped-bars" | "truncated-bars" }> }) {
  const firstY = figure.kind === "truncated-bars" ? figure.start : 0;
  const values = figure.kind === "line-plot" ? figure.heights : figure.kind === "grouped-bars"
    ? figure.counts.flat().map((n) => n * figure.scale) : [figure.first, figure.second];
  const step = figure.kind === "grouped-bars" ? figure.scale : figure.kind === "line-plot" ? (Math.max(...values) > 16 ? 4 : 2) : 1;
  const ticks = Math.ceil((Math.max(...values) - firstY) / step) + (figure.kind === "line-plot" ? 0 : 1);
  const y = (value: number) => 154 - (value - firstY) / (step * ticks) * 126;
  const labels = figure.kind === "line-plot" ? LINE_DAYS : BAR_CATEGORIES;
  const x = (index: number) => 46 + (index + 0.5) * 264 / labels.length;
  const axis = figure.kind === "line-plot" ? "Plant height (cm)" : figure.kind === "grouped-bars" ? "Books read" : "Votes";
  const description = figure.kind === "line-plot"
    ? `Line graph. Plant height in centimetres. ${LINE_DAYS.map((day, i) => `${day}: ${figure.heights[i]}`).join(". ")}.`
    : figure.kind === "grouped-bars"
      ? `Double bar graph. Books read. ${BAR_CATEGORIES.map((category, i) =>
        `${category}, Monday: ${values[i * 2]}, Tuesday: ${values[i * 2 + 1]}`).join(". ")}.`
      : `Bar graph of votes. The vertical axis starts at ${firstY}. Class A: ${figure.first}. Class B: ${figure.second}.`;
  return <Drawing width={320} height={figure.kind === "grouped-bars" ? 218 : 188} description={description}>
    <text x="46" y="17" className="test-drawing-start">{axis}</text>
    {sequence(ticks + 1).map((i) => {
      const tick = firstY + i * step;
      return <g key={tick}><line x1="46" x2="310" y1={y(tick)} y2={y(tick)} className="test-drawing-grid" />
        <text x="29" y={y(tick) + 4}>{tick}</text></g>;
    })}
    <path d="M46 28 V154 H310" fill="none" />
    {labels.map((label, i) => <text key={label} x={x(i)} y="177">{label}</text>)}
    {figure.kind === "line-plot" ? <>
      <polyline points={points(values.map((value, i) => [x(i), y(value)]))} fill="none" strokeWidth="2.5" />
      {values.map((value, i) => <circle key={i} cx={x(i)} cy={y(value)} r="3.5" fill="currentColor" stroke="none" />)}
    </> : figure.kind === "grouped-bars" ? <>
      {values.map((value, i) => <rect key={i} x={x(Math.floor(i / 2)) + (i % 2 ? 3 : -27)} y={y(value)}
        width="24" height={154 - y(value)} className={i % 2 ? "test-drawing-dark" : "test-drawing-fill"} />)}
      {BAR_SERIES.map((label, i) => <g key={label}>
        <rect x={54 + i * 130} y="193" width="17" height="15" className={i ? "test-drawing-dark" : "test-drawing-fill"} />
        <text x={80 + i * 130} y="205" className="test-drawing-start">{label}</text>
      </g>)}
    </> : values.map((value, i) => <rect key={i} x={x(i) - 23} y={y(value)} width="46" height={154 - y(value)} className="test-drawing-fill" />)}
  </Drawing>;
}

function CoordinateGrid({ coordinates }: { coordinates: Point[] }) {
  const x = (value: number) => 135 + value * 21;
  const y = (value: number) => 123 - value * 21;
  const units = sequence(11).map((i) => i - 5);
  const distance = (value: number) => `${Math.abs(value)} ${Math.abs(value) === 1 ? "unit" : "units"}`;
  const [first] = coordinates;
  const description = coordinates.length === 1
    ? `A dot ${distance(first[0])} ${first[0] < 0 ? "left" : "right"} and ${distance(first[1])} ${first[1] < 0 ? "below" : "above"} the origin.`
    : `Coordinate grid. The plotted points are ${coordinates.map(([a, b]) => `(${a}, ${b})`).join(", ")}.`;
  return <Drawing width={270} height={256} description={description}>
    {units.map((i) => <g key={i}>
      <line x1={x(i)} x2={x(i)} y1={y(-5)} y2={y(5)} className={i ? "test-drawing-grid" : undefined} />
      <line x1={x(-5)} x2={x(5)} y1={y(i)} y2={y(i)} className={i ? "test-drawing-grid" : undefined} />
      <text x={x(i)} y="248">{i}</text>
      <text x="15" y={y(i) + 4}>{i}</text>
    </g>)}
    <text x="252" y="128">x</text><text x="135" y="14">y</text>
    {coordinates.map(([a, b]) => <circle key={`${a},${b}`} cx={x(a)} cy={y(b)} r="4.5" fill="currentColor" stroke="none" />)}
  </Drawing>;
}

function CircleGraph({ percent }: { percent: number }) {
  const angle = percent / 100 * 2 * Math.PI;
  return <Drawing width={198} height={181} description={`Circle graph. Walk: ${percent} percent. Other ways: ${100 - percent} percent.`}>
    <circle cx="99" cy="71" r="63" className="test-drawing-fill" />
    <path d={`M99 71 V8 A63 63 0 ${percent > 50 ? 1 : 0} 1 ${99 + 63 * Math.sin(angle)} ${71 - 63 * Math.cos(angle)} Z`} className="test-drawing-dark" />
    <rect x="2" y="157" width="14" height="14" className="test-drawing-dark" />
    <text x="22" y="169" className="test-drawing-start">Walk {percent}%</text>
    <rect x="94" y="157" width="14" height="14" className="test-drawing-fill" />
    <text x="114" y="169" className="test-drawing-start">Other {100 - percent}%</text>
  </Drawing>;
}

export function DrawnQuestionFigure({ figure }: { figure: DrawnFigure }) {
  switch (figure.kind) {
    case "clock": return <Clock figure={figure} />;
    case "ruler": return <Ruler end={figure.end} />;
    case "number-line": return <NumberLine intervals={figure.intervals} mark={figure.mark} />;
    case "polygon": return <Polygon shape={figure.shape} />;
    case "circle": case "cylinder": case "right-triangle": case "net": return <Geometry figure={figure} />;
    case "line-plot": case "grouped-bars": case "truncated-bars": return <PlottedGraph figure={figure} />;
    case "coordinate-grid": return <CoordinateGrid coordinates={figure.points} />;
    case "circle-graph": return <CircleGraph percent={figure.percent} />;
  }
}

"use client";

// The lines from the three sources into Workbook 04 (D-180). They are measured from the real card and cover
// positions, so they meet the cards at any width. One loop: three dots leave the cards together, join into one
// bigger dot where the lines meet, and that dot moves into the cover.
import { useLayoutEffect, useRef, useState } from "react";

type Geo = { w: number; h: number; from: [number, number][]; mid: [number, number]; to: [number, number] };

const DUR = "3.2s";
const JOIN = 0.55; // the part of the loop when the three dots reach the meeting point

export function SourceWires() {
  const svg = useRef<SVGSVGElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);

  useLayoutEffect(() => {
    const box = svg.current?.parentElement;
    if (!box) return;
    const measure = () => {
      const b = box.getBoundingClientRect();
      const cards = [...box.querySelectorAll(".wi-srcc")].map((c) => c.getBoundingClientRect());
      const cover = box.querySelector(".wi-cvw .wi-cv")?.getBoundingClientRect();
      if (!cards.length || !cover || cover.left < cards[0].right) return setGeo(null);
      const toY = cover.top + cover.height / 2 - b.top;
      const toX = cover.left - b.left;
      const from = cards.map((c) => [c.right - b.left, c.top + c.height / 2 - b.top] as [number, number]);
      const midX = from[0][0] + (toX - from[0][0]) * 0.6;
      setGeo({ w: b.width, h: b.height, from, mid: [midX, toY], to: [toX, toY] });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const path = (f: [number, number], m: [number, number]) => {
    const cx = f[0] + (m[0] - f[0]) * 0.55;
    return `M${f[0]} ${f[1]} C ${cx} ${f[1]}, ${cx} ${m[1]}, ${m[0]} ${m[1]}`;
  };

  return (
    <svg ref={svg} className="wi-wires" width={geo?.w ?? 0} height={geo?.h ?? 0} viewBox={geo ? `0 0 ${geo.w} ${geo.h}` : undefined} aria-hidden="true">
      {geo && (
        <>
          {geo.from.map((f, i) => <path key={i} id={`wiWire${i}`} className="wi-wire" d={path(f, geo.mid)} />)}
          <path id="wiWireIn" className="wi-wire" d={`M${geo.mid[0]} ${geo.mid[1]} L ${geo.to[0]} ${geo.to[1]}`} />
          {geo.from.map((_, i) => (
            <circle key={i} r="5" className="wi-pulse">
              <animateMotion dur={DUR} repeatCount="indefinite" keyPoints="0;1;1" keyTimes={`0;${JOIN};1`} calcMode="linear"><mpath href={`#wiWire${i}`} /></animateMotion>
              <animate attributeName="opacity" dur={DUR} repeatCount="indefinite" values="0;1;1;0;0" keyTimes={`0;0.06;${JOIN - 0.02};${JOIN};1`} />
            </circle>
          ))}
          <circle r="9" className="wi-pulse big">
            <animateMotion dur={DUR} repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes={`0;${JOIN};0.92;1`} calcMode="linear"><mpath href="#wiWireIn" /></animateMotion>
            <animate attributeName="opacity" dur={DUR} repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes={`0;${JOIN - 0.02};${JOIN};0.86;0.92;1`} />
            <animate attributeName="r" dur={DUR} repeatCount="indefinite" values="5;5;9;9" keyTimes={`0;${JOIN};${JOIN + 0.06};1`} />
          </circle>
        </>
      )}
    </svg>
  );
}

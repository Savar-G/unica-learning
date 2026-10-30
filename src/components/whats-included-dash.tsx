"use client";

// The parent dashboard on the What's included page (D-177, r162 option D-A): the web dashboard (Figma 99:53) with the
// phone app beside it (Figma 95:55, 98:90, 98:187, 95:308). The chips move both screens; the web menu scrolls the web
// dashboard and also moves the phone. Sample data.
/* eslint-disable @next/next/no-img-element -- fixed-size product mockup; next/image wrappers would break the absolute layout */
import { useEffect, useRef, useState } from "react";
import { ASSETS } from "./whats-included-parts";
import { Fit } from "./fit";

const WEB_W = 860;
const S = WEB_W / 1440;
// Web menu items and where each one starts in the 1440 px wide dashboard design.
const NAV = ["Overview", "Skill map", "Progress over time", "What we've learned", "Work history", "Companion calls", "Next workbook", "Account"];
const TARGET = [0, 1327, 949, 1910, 2496, 1910, 2496, 2928];
// The order the parts appear when scrolling, for the menu highlight.
const SCROLL_ORDER = [0, 2, 1, 3, 4, 7];
const CHIPS = [
  { label: "Progress", phone: "app-progress.png", nav: 0 },
  { label: "This week", phone: "app-week.png", nav: 4 },
  { label: "Sessions with Maya", phone: "app-callnotes.png", nav: 5 },
  { label: "Next workbook", phone: "app-next.png", nav: 6 },
];
const NAV_TO_CHIP: Record<number, number> = { 0: 0, 2: 0, 4: 1, 5: 2, 6: 3 };

const navTop = (k: number) => (169 + 42 * k) * S;

export function DashboardDemo() {
  const [chip, setChip] = useState(0);
  const [hi, setHi] = useState(0);
  const main = useRef<HTMLDivElement>(null);
  const lock = useRef(0);

  // `at` is the click's event time; the scroll spy waits until the smooth scroll ends.
  const go = (k: number, at: number) => {
    setHi(k);
    if (k in NAV_TO_CHIP) setChip(NAV_TO_CHIP[k]);
    lock.current = at + 1200;
    main.current?.scrollTo({ top: TARGET[k] * S, behavior: "smooth" });
  };

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const onScroll = (e: Event) => {
      if (e.timeStamp < lock.current) return;
      let best = 0;
      for (const k of SCROLL_ORDER) if (el.scrollTop + 40 >= TARGET[k] * S) best = k;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) best = 4;
      setHi(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="wi-dv">
      <div className="wi-chips" role="group" aria-label="Show a part of the dashboard">
        {CHIPS.map((c, i) => (
          <button type="button" key={c.label} className={i === chip ? "on" : ""} aria-pressed={i === chip} onClick={(e) => go(c.nav, e.timeStamp)}>{c.label}</button>
        ))}
      </div>
      <Fit w={1104} h={640}>
        <div className="wi-dv-stage">
          <div className="wi-browser wi-dsh" style={{ width: WEB_W }}>
            <div className="bar"><i /><i /><i /><span>app.unicalearning.com/account</span></div>
            <div className="wi-dsh-body" style={{ height: 560 }}>
              <div className="wi-dsh-main" ref={main} style={{ left: Math.round(248 * S) }}>
                <img src={`${ASSETS}/dash-main.jpg`} alt="The parent dashboard on the website, with sample data" style={{ width: Math.round(1192 * S) }} />
              </div>
              <nav className="wi-dsh-side" style={{ width: Math.round(248 * S) }} aria-label="Dashboard menu">
                <img src={`${ASSETS}/dash-side.png`} alt="" style={{ width: Math.round(248 * S) }} />
                <i className="wi-dsh-hi" style={{ left: 20 * S, top: navTop(hi), width: 207 * S, height: 38 * S }} />
                {NAV.map((n, k) => (
                  <button type="button" key={n} aria-label={n} aria-current={k === hi ? "true" : undefined} style={{ left: 20 * S, top: navTop(k), width: 207 * S, height: 38 * S }} onClick={(e) => go(k, e.timeStamp)} />
                ))}
              </nav>
            </div>
          </div>
          <div className="wi-dv-ph">
            {CHIPS.map((c, i) => (
              <img key={c.phone} className={i === chip ? "on" : ""} src={`${ASSETS}/${c.phone}`} alt={i === chip ? `${c.label} in the Unica app, with sample data` : ""} aria-hidden={i !== chip} />
            ))}
          </div>
        </div>
      </Fit>
      <div className="wi-dv-cap"><span><b>On the web</b> · the full dashboard</span><span><b>In the app</b> · the same account</span></div>
    </div>
  );
}

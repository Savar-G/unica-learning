"use client";
// Parent reviews (D-338, look D-339): a spotlight carousel between the statement and How it works.
// Exact words from parents who saw Unica and agreed to be quoted; "…" marks a cut, [brackets] mark the one
// substitution (a competitor's name, D-074); nothing else is reworded.
// Role labels only, no names, ratings, counts or photos. No review markup (D-319).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import "@/components/parent-reviews.css";

export const PARENT_REVIEWS: readonly { quote: string; who: string }[] = [
  { quote: "I like the idea of actual workbooks. They already spend enough time on screens. And having them delivered, plus not having to check every answer myself, is a big plus.", who: "Mom of three" },
  { quote: "The program is great, it's an alternative for tutoring programs [like other learning programs] and gives the student and parents more flexibility.", who: "Parent of a 9-year-old" },
  { quote: "I used to get them work books every summer, wished I had personalized ones. I'm really impressed!", who: "Mom of teens" },
  { quote: "This is a great tool for kids who are quick learners, as well as those who need a little more time to understand and master concepts, all while allowing parents to monitor their progress.", who: "Parent of a 12-year-old" },
  { quote: "This is extremely unique and appealing.", who: "Parent of an 8-year-old" },
  { quote: "I think the concept is interesting, especially the combination of personalized learning and less screen time.", who: "Aunt of a 7-year-old" },
  { quote: "Each child is unique with different areas where they require assistance.", who: "Parent" },
  { quote: "Same age doesn't always mean same level.", who: "Mom of three" },
];

const ADVANCE_MS = 6000;
const REDUCE = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const m = window.matchMedia(REDUCE);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCE).matches,
    () => true,
  );
}

export function ParentReviews() {
  const n = PARENT_REVIEWS.length;
  const [cur, setCur] = useState(0);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  // Any choice by the visitor (arrow, dot, swipe, key, pause) stops the rotation for good.
  const [stopped, setStopped] = useState(false);
  const reduce = useReducedMotion();
  const touch = useRef<number | null>(null);

  const step = useCallback((d: number) => setCur((c) => (c + d + n) % n), [n]);
  const choose = (i: number) => {
    setStopped(true);
    setCur(i);
  };
  const move = (d: number) => {
    setStopped(true);
    step(d);
  };

  const playing = !stopped && !reduce;
  useEffect(() => {
    if (!playing || hover || focus) return;
    const t = setTimeout(() => step(1), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [playing, hover, focus, cur, step]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowRight") move(1);
    else return;
    e.preventDefault();
  };

  return (
    <section className="prv" aria-labelledby="prvT">
      <div className="prv-panel">
        <p className="eyebrow prv-label">Parent reviews</p>
        <h2 id="prvT">Parents love us</h2>
        <div
          className="prv-stage"
          role="region"
          aria-roledescription="carousel"
          aria-label="Parent reviews"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={onKey}
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
          }}
        >
          <div aria-live={playing ? "off" : "polite"}>
            {PARENT_REVIEWS.map(({ quote, who }, i) => {
              let o = i - cur;
              if (o > n / 2) o -= n;
              if (o < -n / 2) o += n;
              const on = o === 0;
              return (
                <figure
                  key={i}
                  className={`prv-card${on ? " is-on" : ""}`}
                  style={{ "--o": o, "--ao": Math.abs(o) } as CSSProperties}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${n}`}
                  aria-hidden={!on || undefined}
                  data-far={Math.abs(o) > 2 || undefined}
                  onClick={on ? undefined : () => choose(i)}
                >
                  <blockquote>“{quote}”</blockquote>
                  <figcaption>{who}</figcaption>
                </figure>
              );
            })}
          </div>
        </div>
        <div className="prv-ctl">
          <button type="button" className="prv-btn" onClick={() => move(-1)} aria-label="Previous review">
            <span aria-hidden="true">←</span>
          </button>
          <div className="prv-dots">
            {PARENT_REVIEWS.map(({ who }, i) => (
              <button key={i} type="button" aria-current={i === cur || undefined} aria-label={`Review ${i + 1} of ${n}, ${who}`} onClick={() => choose(i)} />
            ))}
          </div>
          <button type="button" className="prv-btn" onClick={() => move(1)} aria-label="Next review">
            <span aria-hidden="true">→</span>
          </button>
          {!reduce && (
            <button type="button" className="prv-btn prv-pause" onClick={() => setStopped((s) => !s)} aria-label={stopped ? "Play reviews" : "Pause reviews"}>
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                {stopped ? <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /> : <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />}
              </svg>
            </button>
          )}
        </div>
        <p className="prv-note">Shared with permission, names left out.</p>
      </div>
    </section>
  );
}

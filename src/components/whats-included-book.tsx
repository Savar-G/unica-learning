"use client";

// The workbook on the What's included page (D-174, D-176): a 3D book that opens on the plan and Day 1, page 1.
// The arrows (or a click on either half) turn a page with a curl; the switch shows a second child's workbook.
// Pages: the sample workbooks in Figma (Leah 228:128, Mateo 267:131), cover to Day 1, page 8.
import { useState, type AnimationEvent, type CSSProperties } from "react";
import { ASSETS, Mark } from "./whats-included-parts";
import { Fit } from "./fit";

const BOOKS = {
  leah: { name: "Leah", level: "Level U10", title: "Carrying and borrowing", pages: ["leah-01-cover", "leah-02-plan", "leah-03-d1p1", "leah-04-d1p2", "leah-05-d1p3", "leah-06-d1p4", "leah-07-d1p5", "leah-08-d1p6", "leah-09-d1p7", "leah-10-d1p8"] },
  mateo: { name: "Mateo", level: "Level U19", title: "Factors and multiples", pages: ["mateo-01-cover", "mateo-02-plan", "mateo-03-d1p1", "mateo-04-d1p2", "mateo-05-d1p3", "mateo-06-d1p4", "mateo-07-d1p5", "mateo-08-d1p6", "mateo-09-d1p7", "mateo-10-d1p8"] },
} as const;
type BookKey = keyof typeof BOOKS;

const SPREADS = ["Cover", "Plan · Day 1, page 1", "Day 1, pages 2 and 3", "Day 1, pages 4 and 5", "Day 1, pages 6 and 7", "Day 1, page 8"];
const LEAVES = 5;
const HALF = 220;

const face = (src: string, x: number): CSSProperties => ({ backgroundImage: `url('${ASSETS}/wb/${src}.jpg')`, backgroundPosition: `${x}px 0` });

const ARROW_L = <svg viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;
const ARROW_R = <svg viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" strokeWidth="2" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>;

export function WorkbookReader() {
  const [key, setKey] = useState<BookKey>("leah");
  // f = the number of turned leaves; 1 = open on the plan and Day 1, page 1.
  const [f, setF] = useState(1);
  const [anim, setAnim] = useState<Record<number, "fwd" | "bwd">>({});
  const book = BOOKS[key];

  const turn = (dir: 1 | -1) => {
    const i = dir > 0 ? f : f - 1;
    if ((dir > 0 && f >= LEAVES) || (dir < 0 && f <= 1) || anim[i]) return;
    setAnim((a) => ({ ...a, [i]: dir > 0 ? "fwd" : "bwd" }));
    setF(f + dir);
  };
  const done = (i: number) => (e: AnimationEvent) => {
    if (e.target === e.currentTarget && e.animationName === "wi-lfturn") setAnim((a) => {
      const rest = { ...a };
      delete rest[i];
      return rest;
    });
  };
  const pick = (k: BookKey) => { setKey(k); setF(1); setAnim({}); };

  return (
    <>
      <Fit w={1104} h={680} className="wi-book-fit">
        <div className="wi-rd is-open">
          <div className="wi-rd-stage">
            <div
              className="wi-rd-body"
              onClick={(e) => {
                const b = e.currentTarget.getBoundingClientRect();
                turn(e.clientX > b.left + b.width / 2 ? 1 : -1);
              }}
            >
              <div className="wi-rd-board" />
              <div className="wi-rd-sh" />
              <div className="wi-rd-end">{book.name}&apos;s workbook goes on: Days 2 to 10.</div>
              <div className="wi-rd-sp"><Mark /><b>{`${book.name} · ${book.level} · ${book.title}`.toUpperCase()}</b></div>
              <div className="wi-rd-bt" />
              <div className="wi-rd-re" />
              {Array.from({ length: LEAVES }, (_, i) => {
                const fr = book.pages[2 * i], bk = book.pages[2 * i + 1];
                const cls = ["wi-lf", i === 0 && "cover", i < f && "flipped", anim[i]].filter(Boolean).join(" ");
                return (
                  <div key={`${key}-${i}`} className={cls} style={{ "--z": `${-i}px` } as CSSProperties} onAnimationEnd={done(i)}>
                    <div className="wi-hf in">
                      <div className="wi-fc fr" style={face(fr, 0)} />
                      <div className="wi-fc bk" style={face(bk, -HALF)} />
                      <div className="wi-hf out">
                        <div className="wi-fc fr" style={face(fr, -HALF)} />
                        <div className="wi-fc bk" style={face(bk, 0)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <button type="button" className="wi-rd-nav p" aria-label="Previous page" disabled={f <= 1} onClick={() => turn(-1)}>{ARROW_L}</button>
          <button type="button" className="wi-rd-nav n" aria-label="Next page" disabled={f >= LEAVES} onClick={() => turn(1)}>{ARROW_R}</button>
          <div className="wi-rd-cap" aria-live="polite">{`${book.name} · ${book.level} · ${SPREADS[f]}`}</div>
        </div>
      </Fit>
      <div className="wi-lvl" role="group" aria-label="Sample workbook">
        {(Object.keys(BOOKS) as BookKey[]).map((k) => (
          <button type="button" key={k} className={k === key ? "on" : ""} aria-pressed={k === key} onClick={() => pick(k)}>
            {BOOKS[k].name} · {BOOKS[k].level}
          </button>
        ))}
      </div>
    </>
  );
}

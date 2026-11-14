"use client";

// The animated pictures of three How it works cards (D-216, prototype round r32), built with the Stageshow kit
// (src/vendor/stageshow). Each plays a short story while its card is on screen and shows its last frame as a still
// under reduced motion: the report finds the child's level, the Teaching Assistant works a question on the shared
// board, and Scan pages on our website marks a scanned page. The screens copy the real product screens in public/whats-included
// (report-level.webp, ta-call.webp, app-marked.png); the numbers are sample data.
import type { Act } from "@/vendor/stageshow/act";
import { Phone } from "@/vendor/stageshow/phone";
import { Roll } from "@/vendor/stageshow/motion/Roll";
import { Check } from "@/vendor/stageshow/parts/Check";
import { Stage } from "@/vendor/stageshow/stage";
import "./how-demos.css";

const LOOK = {
  "--ss-font": "var(--font-geist), system-ui, sans-serif",
  "--ss-mono": "var(--font-geist-mono), ui-monospace, monospace",
  "--ss-accent": "#ff6a3d",
  "--ss-canvas": "#ebe8e3",
  "--ss-well": "#ebe8e3",
  "--ss-text-strong": "#0c0c0e",
  "--ss-text": "#44444c",
  "--ss-text-faint": "#8a8a93",
} as Record<string, string>;

const W = 380;
const H = 232;

/* ------------------------------------------------------------------ 01: the report */

type R = { step: number };
const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8"];

const reportScript = async (a: Act<R>) => {
  await a.wait(700);
  a.mark("school");
  a.put({ step: 1 }); // the school grade ring at 3
  await a.wait(1100);
  a.mark("level");
  a.put({ step: 2 }); // the working level lands on 2, the band between them fills
  await a.wait(1500);
  a.mark("area");
  a.put({ step: 3 }); // the first area's marker settles in its zone, then its result
  await a.wait(3200);
  a.mark("exit");
  a.put({ step: 0 }); // what the story added leaves in one reverse stagger
  await a.wait(900);
};

export function ReportDemo() {
  return (
    <Stage<R> width={W} height={H} initial={{ step: 0 }} poster={{ step: 3 }} script={reportScript} tokens={LOOK} className="ua ua-report">
      {(s) => (
        <div className="ur-page">
          <div className="ur-overall">
            <span className="ur-eyebrow">Overall</span>
            <div className="ur-h">Leah is working at a grade 2 level.</div>
            <div className="ur-scale" data-step={s.step}>
              <i className="ur-band" />
              {GRADES.map((g, i) => (
                <span key={g} className="ur-cell" data-level={i === 2 || undefined} data-school={i === 3 || undefined}>
                  {i === 3 && <i className="ur-ring" />}
                  {i === 2 && <i className="ur-disc" />}
                  <b>{g}</b>
                </span>
              ))}
            </div>
          </div>
          <div className="ur-area" data-step={s.step}>
            <div className="ur-area-t">
              <span>Number and operations</span>
              <span className="ur-pill">Needs attention</span>
            </div>
            <div className="ur-zones">
              <i /><i /><i />
              <b className="ur-marker" />
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ------------------------------------------------------------------ 04: the Teaching Assistant's board */

type T = { step: number };

const taScript = async (a: Act<T>) => {
  await a.wait(800);
  a.mark("borrow");
  a.put({ step: 1 }); // step 1, and the borrow marks over 300
  await a.wait(1800);
  a.mark("ones");
  a.put({ step: 2 }); // step 2, and the ones and tens are written
  await a.wait(1900);
  a.mark("turn");
  a.put({ step: 3 }); // Leah's turn: the pen passes to her
  await a.wait(1500);
  a.mark("done");
  a.put({ step: 4 }); // she writes the 1, and it is right
  await a.wait(2800);
  a.mark("exit");
  a.put({ step: 0 });
  await a.wait(1000);
};

const TA_STEPS = [
  "Ones: 0 − 8? Take 1 from the hundreds.",
  "Tens become 9. Ones become 10.",
  "10 − 8 = 2, and 9 − 2 = 7.",
];

export function TeachingDemo() {
  return (
    <Stage<T> width={W} height={H} initial={{ step: 0 }} poster={{ step: 4 }} script={taScript} tokens={LOOK} className="ua ua-ta">
      {(s) => (
        <div className="ut-board" data-step={s.step}>
          <div className="ut-head">
            <span className="ut-title">Our board</span>
            <span className="ut-pen"><Roll variant="fade">{`${s.step >= 3 ? "Leah" : "Maya"} has the pen`}</Roll></span>
          </div>
          <div className="ut-body">
            <div className="ut-sum">
              <div className="ut-marks" aria-hidden="true"><i>2</i><i>9</i><i>10</i></div>
              <div className="ut-top"><span>3</span><span>0</span><span>0</span><i className="ut-strike" /></div>
              <div className="ut-sub"><span className="ut-op">−</span><span>1</span><span>2</span><span>8</span></div>
              <div className="ut-ans">
                <span className="ut-hw" data-on={s.step >= 4 || undefined}>1</span>
                <span className="ut-hw" data-on={s.step >= 2 || undefined} style={{ transitionDelay: s.step >= 2 ? "520ms" : "0ms" }}>7</span>
                <span className="ut-hw" data-on={s.step >= 2 || undefined}>2</span>
                <Check className="ut-check" on={s.step >= 4} size={16} />
              </div>
            </div>
            <ol className="ut-steps">
              {TA_STEPS.map((t, i) => (
                <li key={t} data-on={s.step >= Math.min(i + 1, 2) || undefined} style={{ transitionDelay: i === 2 && s.step >= 2 ? "700ms" : "0ms" }}>
                  <b>{i + 1}</b>
                  <span>{t}</span>
                </li>
              ))}
              <li className="ut-turn" data-on={s.step >= 3 || undefined}>Your turn: what is 2 − 1?</li>
            </ol>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ------------------------------------------------------------------ 05: scanning a page in Scan pages on the website */

type P = { scene: "camera" | "marked"; found: boolean; flash: boolean; marks: boolean };
const CAMERA: P = { scene: "camera", found: false, flash: false, marks: false };

const SUMS: [number, number, number, boolean][] = [
  [84, 59, 25, true], [60, 25, 45, false], [55, 37, 18, true],
  [73, 26, 47, true], [92, 48, 44, true], [81, 46, 35, true],
  [94, 67, 27, true], [52, 19, 33, true], [43, 18, 25, true],
];

function SumsPage({ marks }: { marks: boolean }) {
  return (
    <div className="us-page">
      <div className="us-page-h">Subtracting 2-digit numbers</div>
      <div className="us-grid">
        {SUMS.map(([a, b, c, ok], i) => (
          <div className="us-q" key={i}>
            <span>{a}</span>
            <span>− {b}</span>
            <span className="us-a">{c}</span>
            <i className="us-mk" data-ok={ok || undefined} data-on={marks || undefined} style={{ transitionDelay: marks ? `${i * 90}ms` : "0ms" }}>{ok ? "✓" : "✗"}</i>
          </div>
        ))}
      </div>
    </div>
  );
}

const scanScript = async (a: Act<P>) => {
  await a.wait(900);
  a.mark("found");
  a.put({ found: true }); // the corners lock onto the page
  await a.wait(1000);
  a.put({ flash: true }); // the photo is taken; the flash covers the swap to the result
  await a.wait(120);
  a.put({ scene: "marked" });
  await a.wait(220);
  a.mark("marked");
  a.put({ flash: false });
  await a.wait(700);
  a.put({ marks: true }); // the marks come in, question by question
  await a.wait(3000);
  await a.snap({ found: false }); // the hidden camera resets under the result screen
  await a.wait(200);
  a.mark("next");
  await a.click("next"); // Next: on to page 2, back in the camera
  a.put({ scene: "camera" });
  await a.wait(400);
  await a.snap({ marks: false }); // the result screen is hidden now
  await a.move({ x: 330, y: 200 }); // the finger lifts away; the loop starts where it began
  await a.wait(300);
};

export function ScanDemo() {
  return (
    <Stage<P>
      width={W}
      height={H}
      initial={CAMERA}
      poster={{ scene: "marked", found: true, flash: false, marks: true }}
      script={scanScript}
      tokens={LOOK}
      cursor={{ at: { x: 330, y: 200 }, style: "touch" }}
      className="ua ua-scan"
    >
      {(s) => (
        <Phone width={300} className="us-phone" dark={s.scene === "camera"} wallpaper={s.scene === "camera" ? "#1d1b19" : "#fafaf9"}>
          <div className="us-camera" data-on={s.scene === "camera" || undefined} data-found={s.found || undefined}>
            <div className="us-cam-page"><SumsPage marks={false} /></div>
            <i className="us-corner tl" /><i className="us-corner tr" /><i className="us-corner bl" /><i className="us-corner br" />
            <span className="us-found">Page found</span>
          </div>
          <div className="us-flash" data-on={s.flash || undefined} />
          <div className="us-marked" data-on={s.scene === "marked" || undefined}>
            <div className="us-nav">
              <span className="us-back">‹</span>
              <span>Day 4 · page 1</span>
              <span className="us-next" data-target="next">Next</span>
            </div>
            <span className="us-eyebrow">Marked</span>
            <div className="us-score"><b>8 of 9</b> right</div>
            <SumsPage marks={s.marks} />
          </div>
        </Phone>
      )}
    </Stage>
  );
}

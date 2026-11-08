"use client";

// The Maya demo with its steps (D-220): the silent demo video and a list of the six steps in it. The list follows the
// video; only the step that plays is open, with one line on what it shows a parent. A tap on a step jumps the video
// there. Wide screens play the whole desk, phones play the board alone; the two files have different timings.
import { useEffect, useRef, useState } from "react";
import { DemoVideo } from "./demo-video";

type Step = { wide: number; board: number; title: string; text: string };

// Start times in seconds, read from the captions of each video, one frame per second.
const STEPS: Step[] = [
  { wide: 0, board: 0, title: "Your child asks Maya about question 5", text: "Your child got 56 and asks for help with the question they are on." },
  { wide: 6, board: 2, title: "Maya writes 27 + 39 on the board", text: "Maya sets the sum up in columns on the board they share." },
  { wide: 9, board: 6, title: "Ones first: 7 + 9 = 16", text: "Maya asks instead of telling. Your child works out 7 + 9 = 16." },
  { wide: 16, board: 13, title: "Where does the 1 go?", text: "Maya asks where the 1 goes. Your child finds the carry." },
  { wide: 24, board: 21, title: "Tens: 1 + 2 + 3 = 6, so 66", text: "Your child adds the tens, gets 66 and sees what went wrong." },
  { wide: 34, board: 33, title: "Back to the workbook to fix it", text: "Maya sends your child back to fix question 5 in the workbook." },
];

const LABEL = "Demo: Maya, the Unica AI Teaching Assistant, works through 27 + 39 with a child on a shared board, showing how to carry the 1 to get 66. Captions show what is said.";

type Kind = "wide" | "board";

export function GuidanceDemo() {
  const wrap = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState({ t: 0, dur: 42, kind: "wide" as Kind });

  useEffect(() => {
    const videos = [...(wrap.current?.querySelectorAll<HTMLVideoElement>("video") ?? [])];
    const offs = videos.map((v) => {
      const kind: Kind = v.classList.contains("gd-board") ? "board" : "wide";
      const tick = () => { if (v.offsetParent) setTime({ t: v.currentTime, dur: v.duration || 42, kind }); };
      v.addEventListener("timeupdate", tick);
      v.addEventListener("loadedmetadata", tick);
      return () => { v.removeEventListener("timeupdate", tick); v.removeEventListener("loadedmetadata", tick); };
    });
    return () => offs.forEach((off) => off());
  }, []);

  // The shown copy: the other one is display: none (offsetParent is null).
  const shown = () => [...(wrap.current?.querySelectorAll<HTMLVideoElement>("video") ?? [])].find((v) => v.offsetParent);

  const seek = (step: Step) => {
    const v = shown();
    if (!v) return;
    v.currentTime = v.classList.contains("gd-board") ? step.board : step.wide;
    void v.play().catch(() => {});
  };

  const { t, dur, kind } = time;
  const active = STEPS.reduce((a, s, i) => (t >= s[kind] ? i : a), 0);
  const start = STEPS[active][kind];
  const end = STEPS[active + 1]?.[kind] ?? dur;
  const fill = Math.min(1, Math.max(0, (t - start) / (end - start)));

  return (
    <div className="gd-body" ref={wrap}>
      <div className="gd-media">
        <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={LABEL} />
        <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={LABEL} />
      </div>
      <ol className="gd-steps" aria-label="What happens in the demo">
        {STEPS.map((step, i) => (
          <li key={step.title} className={i === active ? "on" : i < active ? "done" : undefined} aria-current={i === active ? "step" : undefined}>
            <button type="button" onClick={() => seek(step)}>
              <span className="n" aria-hidden="true">{i + 1}</span>
              <span className="tx">{step.title}</span>
            </button>
            <div className="gd-step-text"><p>{step.text}</p></div>
            {i === active && <span className="bar" aria-hidden="true"><i style={{ transform: `scaleX(${fill})` }} /></span>}
          </li>
        ))}
      </ol>
      <p className="gd-cap">Shown without sound. The captions show what Maya and Emma say.</p>
    </div>
  );
}

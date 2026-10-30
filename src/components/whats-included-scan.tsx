"use client";

// The Unica app on the phone in the scan photo: camera, marking, marked, on a loop (D-177, r162 option S-A).
// With reduced motion it shows the marked screen and stays there.
import { useEffect, useState } from "react";
import { ASSETS, MarkedPage } from "./whats-included-parts";

const STEPS = ["cam", "mkg", "res"] as const;
const DURATION = [2300, 1300, 3800];

const ICON_X = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const ICON_FLASH = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
const ICON_BACK = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" strokeWidth="2"><path d="M15 5l-7 7 7 7" /></svg>;
const ICON_CAM = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const STATUS = (
  <div className="bar1">
    <span>9:41</span>
    <span className="si">
      <svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
      <svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="3" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width="15" height="7" rx="1.5" /><rect x="21.5" y="3.5" width="1.5" height="4" rx=".7" opacity=".5" /></svg>
    </span>
  </div>
);

export function ScanPhone() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still && step === 2) return;
    const t = setTimeout(() => setStep(still ? 2 : (step + 1) % STEPS.length), still ? 0 : DURATION[step]);
    return () => clearTimeout(t);
  }, [step]);
  const on = (i: number) => (i === step ? " on" : "");
  return (
    <div className="wi-ui" aria-hidden="true">
      <div className={`sc c3${on(0)}`}>
        {STATUS}
        <div className="bar2">{ICON_X}<span>Day 1 · page 1 of 8</span>{ICON_FLASH}</div>
        <div className="vf" style={{ backgroundImage: `url('${ASSETS}/wood.jpg')` }}>
          <div className="pg"><MarkedPage width={206} name /></div>
          <i className="br a" /><i className="br b" /><i className="br c" /><i className="br d" />
        </div>
        <div className="pill"><span className="p1">Hold still. Almost straight…</span><span className="p2">Got it</span></div>
        <div className="bot"><div className="thumbs"><i /><i /><i /><i /></div><div className="shut"><i /></div><span className="up">Upload</span></div>
        <div className="flash" />
      </div>
      <div className={`sc m2${on(1)}`}>
        {STATUS}
        <div className="bar2 mid"><span>Day 1 · page 1</span></div>
        <div className="pgw"><MarkedPage width={214} /></div>
        <div className="sweep" />
        <div className="pill">Marking page 1…</div>
      </div>
      <div className={`sc r2${on(2)}`}>
        {STATUS}
        <div className="bar2">{ICON_BACK}<span>Day 1 · page 1</span><span className="nx">Next</span></div>
        <div className="kk">MARKED</div>
        <div className="big">28 of 30<small>right</small></div>
        <div className="line">Two slips, both the same: she took the smaller digit from the bigger one.</div>
        <div className="panel"><MarkedPage width={150} marks /></div>
        <div className="nt">
          <h4><i>19</i>20 − 8 · Leah wrote 18</h4>
          <p>She took 0 from 8 instead of trading a ten. The right answer is 12.</p>
          <div className="bt"><span>See the steps</span><span className="d">Ask Maya</span></div>
        </div>
        <div className="tabs"><span>Today</span><b>{ICON_CAM}</b><span>Progress</span><span>Stuck?</span></div>
      </div>
    </div>
  );
}

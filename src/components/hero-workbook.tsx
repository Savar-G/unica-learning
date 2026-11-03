"use client";

// Home hero visual (D-214, prototype r30 B): a sample workbook cover, made for one child, on top of a workbook page.
// The cover is the real sample cover (public/whats-included/wb/leah-01-cover.jpg) rebuilt in HTML at 880 px wide,
// so the child's name can change: it cycles through sample names to show that each book is made for one child.
// With reduced motion on, it stays on the first name.
import Image from "next/image";
import { useEffect, useState } from "react";

const NAMES = ["Leah", "Arjun", "Maya", "Noah", "Sofia", "Ethan"];
const EVERY_MS = 2600;

function Cover({ name }: { name: string }) {
  const whose = /s$/i.test(name) ? `${name}'` : `${name}'s`;
  return (
    <div className="hwb-cover">
      <div className="hwb-cover-top"><span className="hwb-wm">Unica Learning<i /></span><span className="hwb-mono">Workbook 01 · 10 days</span></div>
      <div className="hwb-cover-mk">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
      <p className="hwb-cover-for">Made for <b>{name}</b> · Level U10 · Adding and subtracting to 1000</p>
      <p className="hwb-cover-t">Carrying and<br /><mark>borrowing</mark></p>
      <div className="hwb-cover-box">
        <span className="hwb-mono">Made from {whose} assessment</span>
        <p>On Sep 22, {name} added well but slowed down when a subtraction needed borrowing. So this workbook:</p>
        <ul>
          <li>Practises borrowing, from 2-digit to 3-digit numbers</li>
          <li>Keeps carrying fresh every day</li>
          <li>Ends with one step ahead: borrowing across a zero</li>
        </ul>
      </div>
      <div className="hwb-cover-foot">
        <span className="hwb-qr" />
        <span className="hwb-mono">UL · {name.toUpperCase()} · W01 · COVER</span>
        <span className="hwb-wm sm">Unica Learning<i /></span>
      </div>
    </div>
  );
}

export function HeroWorkbook() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setN((i) => (i + 1) % NAMES.length), EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="hwb-stage" role="img" aria-label="A sample Unica workbook cover made for one child, on top of a workbook page">
      <div className="hwb-glow" aria-hidden="true" />
      <div className="hwb-desk" aria-hidden="true">
        <div className="hwb-sheet hwb-back">
          <Image src="/whats-included/wb/leah-04-d1p2.jpg" alt="" width={880} height={1139} sizes="440px" loading="eager" />
        </div>
        <div className="hwb-front">
          <div className="hwb-sheet hwb-page"><Cover key={NAMES[n]} name={NAMES[n]} /></div>
          <i className="hwb-fold" />
        </div>
      </div>
    </div>
  );
}

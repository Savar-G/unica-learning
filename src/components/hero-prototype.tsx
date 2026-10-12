"use client";

// Throwaway: compare three hero structures on /?variant=A, B, or C.
import { useCallback, useEffect, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import photo from "@/assets/img/hero-home-1.jpg";
import { HERO, PLANS, cad, firstMonth } from "@/lib/site";
import "./hero-prototype.css";

const variants = ["A", "B", "C"];
const names = ["One column", "Two columns", "Photo beside text"];

function Problem() {
  return <div className="hp-problem"><p className="hp-kicker">{HERO.kicker}</p><h1>Schools and tutoring programs put every child in <span className="mark">the same box.</span></h1><p className="hp-pain">Same material, same pace.<br />Miss one topic, and the lessons that build on it get harder.</p></div>;
}
function Benefit() {
  return <div className="hp-benefit"><h2>More practice where your child needs help.<br />New challenges when they’re ready.</h2><p>We use their completed work to adjust each new workbook, then mail it home. You don’t have to decide what they should practise next.</p><div className="hp-actions"><a className="btn" href="#how">Take free assessment <span aria-hidden="true">→</span></a><a className="btn ghost" href="#how">See how it works</a></div><p className="hp-meta">First month CAD {cad(firstMonth(PLANS.one.price))}, then CAD {PLANS.one.price}/month<br />30-day money-back guarantee · Cancel anytime</p></div>;
}
function Photo() {
  return <div className="hp-photo"><Image src={photo} alt="A boy writes in his workbook at a desk at home" sizes="(min-width: 1000px) 1100px, 100vw" priority /></div>;
}
export function VariantA() {
  return <section className="hp hp-a" aria-label="Opening section"><Problem /><Benefit /><Photo /></section>;
}
export function VariantB() {
  return <section className="hp hp-b" aria-label="Opening section"><div className="hp-columns"><Problem /><Benefit /></div><Photo /></section>;
}
export function VariantC() {
  return <section className="hp hp-c" aria-label="Opening section"><div className="hp-top"><Problem /><Photo /></div><Benefit /></section>;
}
export function HeroPrototype({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const key = params.get("variant") ?? "";
  const index = variants.indexOf(key);
  const change = useCallback((offset: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("variant", variants[(index + offset + variants.length) % variants.length]);
    router.replace("?" + next.toString(), { scroll: false });
  }, [params, index, router]);
  useEffect(() => {
    if (index < 0) return;
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]")) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        change(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, change]);
  if (index < 0 || process.env.NODE_ENV === "production") return children;
  return <><div className="hp-host" onClickCapture={(event) => {
    const link = (event.target as Element).closest("a");
    if (link?.textContent?.includes("Take free assessment")) {
      event.preventDefault();
      document.getElementById("hp-status")?.focus();
    }
  }}>{index === 0 ? <VariantA /> : index === 1 ? <VariantB /> : <VariantC />}</div>
    <nav className="hp-switcher" aria-label="Prototype options"><button onClick={() => change(-1)} aria-label="Previous option">←</button><div id="hp-status" tabIndex={-1} aria-live="polite"><small>PROTOTYPE · assessment button is a sample</small><strong>{key} · {names[index]}</strong></div><button onClick={() => change(1)} aria-label="Next option">→</button></nav></>;
}

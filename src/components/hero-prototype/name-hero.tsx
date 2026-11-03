"use client";

// PROTOTYPE (throwaway): variant B. The parent types their child's first name and the workbook cover changes
// to it. The name stays in this tab: it is not sent, stored or tracked.
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StartLink } from "@/components/start-link";
import { Booklet, NamedCover } from "./workbook";

const SAMPLES = ["Leah", "Arjun", "Maya", "Noah", "Sofia", "Ethan"];

export function NameHero({ head, foot, behind }: { head: ReactNode; foot: ReactNode; behind: ReactNode }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [sample, setSample] = useState(0);
  const name = typed.replace(/[^\p{L}' -]/gu, "").trim().slice(0, 18);

  useEffect(() => {
    if (typed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setSample((n) => (n + 1) % SAMPLES.length), 2200);
    return () => window.clearInterval(t);
  }, [typed]);

  const shown = name ? name.charAt(0).toUpperCase() + name.slice(1) : SAMPLES[sample];

  return (
    <header id="top" className="hp hp-b">
      <div className="hp-b-txt">
        {head}
        <form className="hp-b-bar" onSubmit={(e) => { e.preventDefault(); router.push("/start"); }}>
          <label htmlFor="hp-child" className="sr">Your child&apos;s first name</label>
          <input id="hp-child" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Your child's first name" maxLength={18} autoComplete="off" spellCheck={false} />
          <StartLink src="hero-proto-b">Take free assessment <span className="arr" aria-hidden="true">→</span></StartLink>
        </form>
        <p className="hp-b-note">Type a name to see their cover. We do not save it.</p>
        {foot}
      </div>
      <div className="hp-b-stage" role="img" aria-label={`A Unica workbook cover made for ${shown}`}>
        <div className="hp-b-glow" aria-hidden="true" />
        <div className="hp-b-desk">
          {behind}
          <Booklet className="hp-b-front">
            <div key={shown} className="hp-b-swap"><NamedCover name={shown} zoom={0.5} /></div>
          </Booklet>
        </div>
      </div>
    </header>
  );
}

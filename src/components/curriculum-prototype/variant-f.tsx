"use client";

// PROTOTYPE variant F: "Search what they learn now". The page opens on one question: what is your child learning at
// school? Typing or a topic chip filters all 30 levels, grouped by grade band, with the match marked.
import { useState, type CSSProperties, type ReactNode } from "react";
import { BANDS } from "./data";

const CHIPS = ["Counting", "Adding", "Times tables", "Fractions", "Decimals", "Percents", "Money", "Shapes", "Graphs", "Equations"];
const ALIASES: Record<string, string[]> = {
  "times tables": ["times tables", "multiplication", "multiplying", "times"],
  adding: ["adding", "add", "subtract", "taking away"],
  fractions: ["fraction", "halves", "thirds", "fourths", "mixed numbers"],
  percents: ["percent"],
  shapes: ["shape", "polygon", "triangle", "circle", "3d", "prism", "angles"],
  graphs: ["graph", "tallies"],
  equations: ["equation"],
  money: ["money", "coin", "change", "budget", "price", "$"],
};

function terms(q: string) {
  const k = q.trim().toLowerCase();
  return k ? (ALIASES[k] ?? [k]) : [];
}

function Mark({ text, ts }: { text: string; ts: string[] }) {
  if (!ts.length) return <>{text}</>;
  const re = new RegExp(`(${ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

export function VariantF({ how, end }: { how: ReactNode; end: ReactNode }) {
  const [q, setQ] = useState("");
  const ts = terms(q);
  const hit = (s: string) => ts.some((t) => s.toLowerCase().includes(t));
  const bands = BANDS.map((b) => ({ b, levels: b.group.levels.filter((l) => !ts.length || hit(l.title) || l.points.some(hit)) }));
  const count = bands.reduce((n, x) => n + x.levels.length, 0);
  return (
    <main id="main" className="curp cp cpf">
      <header className="cp-head cpf-head">
        <p className="eyebrow">Our curriculum</p>
        <h1>What is your child learning at school right now?</h1>
        <p className="lead">Type a topic to see where it shows up in our 30 levels, from Kindergarten to Grade 9, built from the BC math curriculum.</p>
        <label className="cpf-search">
          <span className="sr-only">Search the levels</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try fractions, times tables or money" />
        </label>
        <div className="cpf-chips">
          {CHIPS.map((c) => (
            <button key={c} type="button" aria-pressed={q.toLowerCase() === c.toLowerCase()} onClick={() => setQ(q.toLowerCase() === c.toLowerCase() ? "" : c)}>{c}</button>
          ))}
        </div>
      </header>

      <p className="cpf-count" aria-live="polite">{ts.length ? `${count} of 30 levels cover "${q.trim()}"` : "All 30 levels"}</p>

      <div className="cpf-results">
        {bands.map(({ b, levels }) => (
          <section key={b.key} className={`cpf-band${levels.length ? "" : " none"}`} style={{ "--c": b.color } as CSSProperties}>
            <h2><span>{b.grades}</span><small>{b.levels} · {levels.length ? `${levels.length} ${levels.length === 1 ? "level" : "levels"}` : "no match"}</small></h2>
            <div className="cpf-grid">
              {levels.map((l) => (
                <article key={l.n}>
                  <p className="cp-mono">U{l.n}</p>
                  <h3><Mark text={l.title} ts={ts} /></h3>
                  <ul>{l.points.map((p) => <li key={p} className={ts.length && hit(p) ? "hit" : ""}><Mark text={p} ts={ts} /></li>)}</ul>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="cp-fine">Your child starts at the level the free assessment finds. Many children start below or above their school grade, and that&apos;s normal.</p>
      {how}
      {end}
    </main>
  );
}

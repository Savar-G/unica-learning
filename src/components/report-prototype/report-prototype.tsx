"use client";

// PROTOTYPE ONLY (branch site/report-prototype, round r12). Throwaway: the chosen direction is rebuilt in #80.
// URL: /report-prototype?variant=A-E&child=behind|on|ahead&stage=1|2|3&prov=BC|ON&help=0|1&view=page|email
// The bottom bar switches every axis; the arrow keys step through variants. State lives in the URL only.
import { useEffect, useState } from "react";
import { track } from "@/lib/track";
import { CHILDREN, STAGE_LABEL, TAKERS, type ChildKey, type Stage } from "./data";
import { ReportEmail } from "./email";
import { SampleBanner, type Province } from "./parts";
import { VARIANTS } from "./variants";
import "./report-prototype.css";

interface State {
  variant: string;
  child: ChildKey;
  stage: Stage;
  prov: Province;
  help: boolean;
  view: "page" | "email";
}

const DEFAULT: State = { variant: "A", child: "behind", stage: 1, prov: "BC", help: false, view: "page" };

function fromUrl(): State {
  const q = new URLSearchParams(window.location.search);
  const pick = <T,>(k: string, ok: readonly T[], d: T) => (ok.includes(q.get(k) as T) ? (q.get(k) as T) : d);
  return {
    variant: pick("variant", VARIANTS.map((v) => v.key), DEFAULT.variant),
    child: pick("child", ["behind", "on", "ahead"] as const, DEFAULT.child),
    stage: Number(pick("stage", ["1", "2", "3"] as const, "1")) as Stage,
    prov: pick("prov", ["BC", "ON"] as const, DEFAULT.prov),
    help: q.get("help") === "1",
    view: pick("view", ["page", "email"] as const, DEFAULT.view),
  };
}

function toUrl(s: State) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ variant: s.variant, child: s.child, stage: String(s.stage), prov: s.prov, help: s.help ? "1" : "0", view: s.view }).toString();
  window.history.replaceState(null, "", url);
}

export function ReportPrototype() {
  const [s, setS] = useState<State>(DEFAULT);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setS(fromUrl()); // eslint-disable-line react-hooks/set-state-in-effect -- read the URL once after hydration
  }, []);

  useEffect(() => {
    track("report_open", { src: `report-proto-${s.variant}`, status: s.child });
  }, [s.variant, s.child]);

  const set = (patch: Partial<State>) => {
    const next = { ...s, ...patch };
    setS(next);
    toUrl(next);
  };

  const i = Math.max(0, VARIANTS.findIndex((v) => v.key === s.variant));
  const step = (d: number) => set({ variant: VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length].key });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const v = VARIANTS[i];
  const c = CHILDREN[s.child];
  const props = { c, stage: s.stage, prov: s.prov, helped: s.help };

  return (
    <>
      <SampleBanner />
      <div className={`rp-root v-${v.key}`} key={`${v.key}-${s.view}`}>
        {s.view === "page" ? <v.C {...props} /> : <ReportEmail {...props} variant={v.key} />}
      </div>

      <div className={`rp-bar${open ? "" : " is-closed"}`} role="toolbar" aria-label="Prototype controls">
        <div className="rp-bar-v">
          <button type="button" onClick={() => step(-1)} aria-label="Previous variant">←</button>
          <span><b>{v.key}</b> {v.name} <i>{i + 1}/{VARIANTS.length}</i></span>
          <button type="button" onClick={() => step(1)} aria-label="Next variant">→</button>
          <button type="button" className="rp-bar-x" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Hide controls" : "Show controls"}>
            {open ? "–" : "+"}
          </button>
        </div>
        {open && (
          <div className="rp-bar-o">
            <Seg label="Child" value={s.child} onChange={(child) => set({ child })} options={[["behind", "Behind"], ["on", "On grade"], ["ahead", "Ahead"]]} />
            <Seg
              label="Data"
              value={String(s.stage)}
              onChange={(x) => set({ stage: Number(x) as Stage })}
              options={([1, 2, 3] as Stage[]).map((n) => [String(n), `${STAGE_LABEL[n]} (n ${n === 1 ? "<100" : TAKERS[n]})`])}
            />
            <Seg label="Province" value={s.prov} onChange={(prov) => set({ prov })} options={[["BC", "BC: card"], ["ON", "Ontario: waitlist"]]} />
            <Seg label="Help flag" value={s.help ? "1" : "0"} onChange={(x) => set({ help: x === "1" })} options={[["0", "Off"], ["1", "On"]]} />
            <Seg label="View" value={s.view} onChange={(view) => set({ view })} options={[["page", "Page"], ["email", "Email"]]} />
          </div>
        )}
      </div>
    </>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="rp-seg" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(([k, name]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {name}
        </button>
      ))}
    </div>
  );
}

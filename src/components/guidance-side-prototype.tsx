// PROTOTYPE (throwaway, branch site/maya-side-prototype). Question: what should sit beside the Maya demo so a parent
// understands what the AI Teaching Assistant does and how it works? Five variants on the real home page, switched
// with ?variant=A..E (or the bottom bar); "now" is today's step list. Facts used: the QR code on each page opens that
// question on the desk; chat for Grade 3 and up (voice is not live); hints one step at a time, never the answer; a
// shared board; back to the workbook to fix it; parents read Maya notes and transcripts; the desk is locked by a PIN.

export const SIDE_VARIANTS = [
  { key: "now", name: "Today: demo steps" },
  { key: "A", name: "Three things Maya does" },
  { key: "B", name: "How it works, under the video" },
  { key: "C", name: "Maya will / won't" },
  { key: "D", name: "Parent promise + checklist" },
  { key: "E", name: "Parent moment + chips" },
];

/** B spans the full width under the video instead of a side column. */
export const WIDE_VARIANTS = new Set(["B"]);

export function SideVariant({ variant }: { variant: string }) {
  return (
    <>
      <style>{CSS}</style>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      {variant === "D" && <VariantD />}
      {variant === "E" && <VariantE />}
    </>
  );
}

// A: three verbs, each with one plain line. The "what she does" answer in the fewest words.
function VariantA() {
  const rows = [
    { t: "Sees the exact question", d: "Your child scans the code on the page. Maya opens that question." },
    { t: "Asks, never tells", d: "One hint at a time, so your child does the thinking." },
    { t: "Sends them back to the page", d: "The fix happens in the workbook, in pencil." },
  ];
  return (
    <div className="pv-a">
      <p className="pv-kick">What Maya does</p>
      {rows.map((r, i) => (
        <div key={r.t} className="pv-a-row">
          <span className="pv-a-dot" style={{ background: ["#FFD23F", "#3366F0", "#16A06A"][i] }} />
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

// B: how it works as a 3-step strip across the full width under the video.
function VariantB() {
  const steps = [
    { n: "1", t: "Stuck? Scan the page", d: "Every workbook page has a code. Scanning it opens that exact question for Maya." },
    { n: "2", t: "Work it out together", d: "Maya asks small questions and draws on a shared board. She never gives the answer." },
    { n: "3", t: "Fix it in the workbook", d: "Your child goes back to the page and writes the fix. You can read the chat after." },
  ];
  return (
    <div className="pv-b">
      {steps.map((s) => (
        <div key={s.n} className="pv-b-step">
          <span className="pv-b-n">{s.n}</span>
          <p className="pv-b-t">{s.t}</p>
          <p className="pv-b-d">{s.d}</p>
        </div>
      ))}
    </div>
  );
}

// C: a will / won't split. Answers the parent's real worry (does it just give answers?) head on.
function VariantC() {
  return (
    <div className="pv-c">
      <div className="pv-c-box pv-c-yes">
        <p className="pv-c-h">Maya will</p>
        <ul>
          <li>Open the exact question your child is on</li>
          <li>Give one hint at a time</li>
          <li>Draw it out on a board you share</li>
        </ul>
      </div>
      <div className="pv-c-box pv-c-no">
        <p className="pv-c-h">Maya won&apos;t</p>
        <ul>
          <li>Give the answer</li>
          <li>Do the page for them</li>
        </ul>
      </div>
    </div>
  );
}

// D: one bold promise, then the three things a parent checks before trusting an AI with their child.
function VariantD() {
  return (
    <div className="pv-d">
      <p className="pv-d-big">Hints, <mark>never answers.</mark></p>
      <p className="pv-d-sub">Maya guides your child one step at a time, so the learning stays theirs.</p>
      <ul className="pv-d-list">
        <li>You can read every conversation</li>
        <li>Opens only to the question on the page</li>
        <li>Locked to the desk with your PIN</li>
      </ul>
    </div>
  );
}

// E: starts from the parent's moment, then three short chips. The warmest, least "feature list" option.
function VariantE() {
  return (
    <div className="pv-e">
      <p className="pv-e-q">Your child is stuck and you&apos;re making dinner.</p>
      <p className="pv-e-a">They scan the page and Maya walks them through it, one question at a time, until they can fix it themselves.</p>
      <div className="pv-e-chips">
        <span>Sees the exact question</span>
        <span>Hints, not answers</span>
        <span>You read every chat</span>
      </div>
    </div>
  );
}

const CSS = `
.gd-body[data-proto-wide] { grid-template-columns: 1fr; }
.pv-kick { margin: 0 0 6px; font: 500 12px/1.4 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); }

.pv-a { display: grid; gap: 18px; }
.pv-a-row { display: grid; grid-template-columns: 14px 1fr; gap: 12px; align-items: start; }
.pv-a-dot { width: 12px; height: 12px; margin-top: 6px; border: 1.5px solid #111; }
.pv-a-t { margin: 0; font-size: 18px; font-weight: 500; line-height: 1.3; color: var(--ink); }
.pv-a-d { margin: 4px 0 0; font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }

.pv-b { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(16px, 2.5vw, 32px); margin-top: 8px; }
.pv-b-step { border-top: 2px solid var(--ink); padding-top: 14px; }
.pv-b-n { display: inline-block; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: #fff; font: 500 14px/28px var(--mono); text-align: center; }
.pv-b-t { margin: 12px 0 0; font-size: 20px; font-weight: 500; line-height: 1.25; color: var(--ink); }
.pv-b-d { margin: 6px 0 0; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
@media (max-width: 899px) { .pv-b { grid-template-columns: 1fr; } }

.pv-c { display: grid; gap: 12px; }
.pv-c-box { border-radius: 12px; padding: 16px 18px; }
.pv-c-yes { background: #eaf6ef; }
.pv-c-no { background: #fdeee8; }
.pv-c-h { margin: 0 0 8px; font-size: 17px; font-weight: 600; color: var(--ink); }
.pv-c ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.pv-c li { font-size: 15px; line-height: 1.4; color: var(--ink-2); padding-left: 22px; position: relative; }
.pv-c-yes li::before { content: "✓"; position: absolute; left: 0; color: #16A06A; font-weight: 700; }
.pv-c-no li::before { content: "✕"; position: absolute; left: 0; color: #FF6430; font-weight: 700; }

.pv-d-big { margin: 0; font-family: var(--serif, inherit); font-size: clamp(30px, 2.6vw, 38px); line-height: 1.1; letter-spacing: -.01em; color: var(--ink); }
.pv-d-big mark { background: #FFD23F; color: inherit; padding: 0 4px; }
.pv-d-sub { margin: 12px 0 18px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
.pv-d-list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
.pv-d-list li { padding: 11px 0 11px 26px; border-bottom: 1px solid var(--line); font-size: 15px; color: var(--ink); position: relative; }
.pv-d-list li::before { content: "✓"; position: absolute; left: 2px; color: #16A06A; font-weight: 700; }

.pv-e { border-left: 3px solid var(--accent); padding-left: 18px; }
.pv-e-q { margin: 0; font-size: 21px; font-weight: 500; line-height: 1.3; color: var(--ink); }
.pv-e-a { margin: 10px 0 16px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
.pv-e-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pv-e-chips span { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--line); font-size: 13.5px; color: var(--ink); background: #fff; }
`;

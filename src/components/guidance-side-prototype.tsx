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
  { key: "I", name: "A with small drawings" },
  { key: "J", name: "A with the logo grid" },
  { key: "K", name: "A on a card" },
  { key: "L", name: "J with the full-colour logo" },
  { key: "M", name: "J, logo builds up" },
];

/** B and G span the full width under the video instead of a side column. */
export const WIDE_VARIANTS = new Set(["B", "G"]);

// The three points Cedric chose (variant A); F, G and H show them in other designs.
const POINTS = [
  { t: "Already has the question", d: "Your child picks it from their page, and Maya sees exactly what they see.", c: "#FFD23F" },
  { t: "Talks it through, never tells", d: "Maya asks small questions and draws on a shared board. Your child does the thinking.", c: "#3366F0" },
  { t: "Sends them back to the page", d: "The fix happens in the workbook, in pencil.", c: "#16A06A" },
];

export function SideVariant({ variant }: { variant: string }) {
  return (
    <>
      <style>{CSS}</style>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      {variant === "D" && <VariantD />}
      {variant === "E" && <VariantE />}
      {variant === "F" && <VariantF />}
      {variant === "G" && <VariantG />}
      {variant === "H" && <VariantH />}
      {variant === "I" && <VariantI />}
      {variant === "J" && <VariantJ />}
      {variant === "K" && <VariantK />}
      {variant === "L" && <VariantL />}
      {variant === "M" && <VariantM />}
    </>
  );
}

// A: three verbs, each with one plain line. The "what she does" answer in the fewest words.
function VariantA() {
  return (
    <div className="pv-a">
      <p className="pv-kick">What Maya does</p>
      {POINTS.map((r) => (
        <div key={r.t} className="pv-a-row">
          <span className="pv-a-dot" style={{ background: r.c }} />
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

// F: the same points as big editorial numbers with rules between them.
function VariantF() {
  return (
    <ol className="pv-f">
      {POINTS.map((r, i) => (
        <li key={r.t}>
          <span className="pv-f-n">0{i + 1}</span>
          <p className="pv-f-t">{r.t}</p>
          <p className="pv-f-d">{r.d}</p>
        </li>
      ))}
    </ol>
  );
}

// G: the same points as three columns across the full width under the video, a logo colour bar on each.
function VariantG() {
  return (
    <div className="pv-g">
      {POINTS.map((r) => (
        <div key={r.t} className="pv-g-col" style={{ borderTopColor: r.c }}>
          <p className="pv-g-t">{r.t}</p>
          <p className="pv-g-d">{r.d}</p>
        </div>
      ))}
    </div>
  );
}

// H: the same points as the arc of one call, joined by a line, Maya's avatar at the top.
function VariantH() {
  const when = ["Your child calls", "During the call", "After the call"];
  return (
    <div className="pv-h">
      <p className="pv-kick">How a call with Maya goes</p>
      <ol>
        {POINTS.map((r, i) => (
          <li key={r.t}>
            <span className="pv-h-dot" style={{ borderColor: r.c }} />
            <p className="pv-h-when">{when[i]}</p>
            <p className="pv-h-t">{r.t}</p>
            <p className="pv-h-d">{r.d}</p>
          </li>
        ))}
      </ol>
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

// I: A, with a small drawn icon in a logo-colour tile instead of the plain square.
function VariantI() {
  const icons = [
    <svg key="1" viewBox="0 0 20 20"><rect x="4" y="3" width="12" height="14" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h3" /></svg>,
    <svg key="2" viewBox="0 0 20 20"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V13A2 2 0 0 1 3 11z" /></svg>,
    <svg key="3" viewBox="0 0 20 20"><path d="M4 16l2.5-.6L15.5 6.4a1.6 1.6 0 0 0-2.3-2.3L4.6 13.1z" /><path d="M12 5.5l2.4 2.4" /></svg>,
  ];
  return (
    <div className="pv-a">
      <p className="pv-kick">What Maya does</p>
      {POINTS.map((r, i) => (
        <div key={r.t} className="pv-i-row">
          <span className="pv-i-ic" style={{ background: r.c }}>{icons[i]}</span>
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

// J: A, where each cue is a small copy of the 3x3 logo with one tile lit in that row's colour.
function VariantJ() {
  const lit = [0, 2, 6];
  return (
    <div className="pv-a">
      <p className="pv-kick">What Maya does</p>
      {POINTS.map((r, i) => (
        <div key={r.t} className="pv-j-row">
          <span className="pv-j-grid">{Array.from({ length: 9 }, (_, k) => <i key={k} style={k === lit[i] ? { background: r.c } : undefined} />)}</span>
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

// K: A as it is, on a soft white card with lines between the rows, so it reads as one block beside the video.
function VariantK() {
  return (
    <div className="pv-k">
      <p className="pv-kick">What Maya does</p>
      {POINTS.map((r) => (
        <div key={r.t} className="pv-k-row">
          <span className="pv-a-dot" style={{ background: r.c }} />
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

// The real logo: yellow top left, blue top right, orange centre, green bottom left, warm grey bottom right.
const LOGO: Record<number, string> = { 0: "#FFD23F", 2: "#3366F0", 4: "#FF6430", 6: "#16A06A", 8: "#B8B3AA" };

function Grid({ fill, dim, size = 34 }: { fill: Record<number, string>; dim?: number; size?: number }) {
  return (
    <span className="pv-lg" style={{ width: size, height: size }}>
      {Array.from({ length: 9 }, (_, k) => (
        <i key={k} style={{ background: fill[k] ?? "#fff", opacity: dim !== undefined && k !== dim && fill[k] ? 0.28 : 1 }} />
      ))}
    </span>
  );
}

// L: each cue is the full-colour logo; that row's tile stays bright and the other colours fade back.
function VariantL() {
  const lit = [0, 2, 6];
  return (
    <div className="pv-a">
      <p className="pv-kick">What Maya does</p>
      {POINTS.map((r, i) => (
        <div key={r.t} className="pv-l-row">
          <Grid fill={LOGO} dim={lit[i]} />
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

// M: the logo builds up as you read: one colour, then two, then the whole logo with Maya's work done.
function VariantM() {
  const steps: Record<number, string>[] = [
    { 0: LOGO[0] },
    { 0: LOGO[0], 2: LOGO[2], 4: LOGO[4] },
    LOGO,
  ];
  return (
    <div className="pv-a">
      <p className="pv-kick">What Maya does</p>
      {POINTS.map((r, i) => (
        <div key={r.t} className="pv-l-row">
          <Grid fill={steps[i]} />
          <div><p className="pv-a-t">{r.t}</p><p className="pv-a-d">{r.d}</p></div>
        </div>
      ))}
    </div>
  );
}

const CSS = `
.pv-l-row { display: grid; grid-template-columns: 34px 1fr; gap: 14px; align-items: start; }
.pv-lg { display: grid; grid-template-columns: repeat(3, 1fr); box-sizing: border-box; border-top: 1.5px solid #111; border-left: 1.5px solid #111; margin-top: 2px; }
.pv-lg i { border-right: 1.5px solid #111; border-bottom: 1.5px solid #111; transition: opacity .3s; }

.pv-i-row { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: start; }
.pv-i-ic { width: 34px; height: 34px; border: 1.5px solid #111; display: grid; place-items: center; box-sizing: border-box; }
.pv-i-ic svg { width: 20px; height: 20px; fill: none; stroke: #111; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.pv-j-row { display: grid; grid-template-columns: 30px 1fr; gap: 12px; align-items: start; }
.pv-j-grid { display: grid; grid-template-columns: repeat(3, 1fr); width: 27px; height: 27px; margin-top: 3px; border-top: 1.5px solid #111; border-left: 1.5px solid #111; box-sizing: border-box; }
.pv-j-grid i { border-right: 1.5px solid #111; border-bottom: 1.5px solid #111; background: #fff; }
.pv-k { background: #fff; border-radius: 14px; padding: 20px 22px 8px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 20px 40px -24px rgba(30,40,80,.35); }
.pv-k-row { display: grid; grid-template-columns: 14px 1fr; gap: 12px; align-items: start; padding: 14px 0; border-top: 1px solid var(--line); }
.pv-k-row .pv-a-dot { margin-top: 6px; }

.pv-f { list-style: none; margin: 0; padding: 0; }
.pv-f li { padding: 16px 0; border-top: 1px solid var(--line); }
.pv-f li:last-child { border-bottom: 1px solid var(--line); }
.pv-f-n { display: block; font-family: var(--serif, inherit); font-size: 40px; line-height: 1; color: var(--accent); }
.pv-f-t { margin: 8px 0 0; font-size: 18px; font-weight: 500; color: var(--ink); }
.pv-f-d { margin: 4px 0 0; font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }

.pv-g { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(16px, 2.5vw, 32px); margin-top: 8px; }
.pv-g-col { border-top: 4px solid; padding-top: 16px; }
.pv-g-t { margin: 0; font-size: 21px; font-weight: 500; line-height: 1.25; color: var(--ink); }
.pv-g-d { margin: 8px 0 0; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
@media (max-width: 899px) { .pv-g { grid-template-columns: 1fr; } }

.pv-h ol { list-style: none; margin: 10px 0 0; padding: 0; position: relative; }
.pv-h ol::before { content: ""; position: absolute; left: 7px; top: 10px; bottom: 24px; width: 2px; background: var(--line); }
.pv-h li { position: relative; padding: 0 0 22px 32px; }
.pv-h-dot { position: absolute; left: 0; top: 3px; width: 16px; height: 16px; border-radius: 50%; border: 4px solid; background: #fff; box-sizing: border-box; }
.pv-h-when { margin: 0; font: 500 11.5px/1.4 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); }
.pv-h-t { margin: 3px 0 0; font-size: 18px; font-weight: 500; color: var(--ink); }
.pv-h-d { margin: 4px 0 0; font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }

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

import Image, { type StaticImageData } from "next/image";
import { BRAND, HERO, PLANS, SOURCES } from "@/lib/site";
import { Cover, Knot, PageFrac, PageNext, PageRead, Parcel, Report, Rise, Scan, type Vars } from "./drawn";

import heroHome1 from "@/assets/img/hero-home-1.jpg";
import heroHome2 from "@/assets/img/hero-home-2.jpg";
import assess1 from "@/assets/img/loop-assess-1.jpg";
import practice6 from "@/assets/img/loop-practice-6.jpg";
import adapt3 from "@/assets/img/loop-adapt-3.jpg";
import adapt4 from "@/assets/img/loop-adapt-4.jpg";
import reading1 from "@/assets/img/loop-practice-reading-1.jpg";
import reading2 from "@/assets/img/loop-practice-reading-2.jpg";
import emo4 from "@/assets/img/emotion-4.jpg";
import emo5 from "@/assets/img/emotion-5.jpg";
import emo6 from "@/assets/img/emotion-6.jpg";
import emo7 from "@/assets/img/emotion-7.jpg";
import emo9 from "@/assets/img/emotion-9.jpg";
import emo10 from "@/assets/img/emotion-10.jpg";
import emo11 from "@/assets/img/emotion-11.jpg";

function Photo({ src, alt, sizes, className = "ph" }: { src: StaticImageData; alt: string; sizes: string; className?: string }) {
  return (
    <div className={className}>
      <Image src={src} alt={alt} sizes={sizes} placeholder="blur" />
    </div>
  );
}

function GetStarted({ src, plan, label = "Get started", ghost = false }: { src: string; plan?: string; label?: string; ghost?: boolean }) {
  return (
    <button className={`btn${ghost ? " ghost" : ""}`} data-open data-src={src} data-plan={plan}>
      {label} {!ghost && <span className="arr">→</span>}
    </button>
  );
}

export function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <div className="in">
        <a className="logo" href="#top" aria-label={`${BRAND} home`}>
          {BRAND}
          <b />
        </a>
        <ul>
          <li><a href="#how">How it works</a></li>
          <li><a href="#inc">What&apos;s included</a></li>
          <li><a href="#price">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
        <button className="btn sm" data-open data-src="nav">Get started</button>
      </div>
    </nav>
  );
}

export function Hero() {
  return (
    <header className="hero hero-c" id="top">
      <div className="txt">
        <Rise as="p" className="eyebrow">{HERO.eyebrow}</Rise>
        <Rise as="h1" d={0.1}>
          Personalized. Delivered. <span className="mark">Mastered.</span>
        </Rise>
        <Rise as="p" d={0.2} className="lead">{HERO.sub}</Rise>
        <Rise d={0.3}>
          <div className="ctas">
            <GetStarted src="hero" />
            <a className="btn ghost" href="#how">See how it works</a>
          </div>
        </Rise>
        <Rise d={0.4}>
          <p className="meta">Grades 3-5 <i /> From CAD {PLANS.one.price} a month <i /> Delivery included</p>
        </Rise>
      </div>
      <Rise d={0.3} className="stage">
        <div className="ph big">
          <Image src={heroHome1} alt="A boy writes in his workbook at a desk at home" sizes="(min-width: 1200px) 1120px, 100vw" placeholder="blur" loading="eager" fetchPriority="high" />
        </div>
        <div className="fl pg" data-speed="-.08"><PageFrac /></div>
        <div className="fl rp" data-speed=".06"><Report /></div>
      </Rise>
    </header>
  );
}

export function What() {
  return (
    <section className="sec" id="what" aria-labelledby="whatT">
      <Knot />
      <div className="what">
        <Rise>
          <p className="eyebrow">What is {BRAND}?</p>
          <h2 id="whatT" style={{ marginTop: 16 }}>A Workbook That Knows Your Child.</h2>
        </Rise>
        <Rise d={0.1}>
          <p className="big">
            A workbook for{" "}
            <span className="swap" aria-hidden="true">
              <span className="on">fractions</span>
              <span>reading</span>
              <span>long division</span>
              <span>new words</span>
            </span>
            <span className="sr">fractions, reading, long division or new words,</span>
            <br />
            made for one child: yours. Mailed to your door, and rebuilt from every page they finish.
          </p>
        </Rise>
      </div>
      <div className="rows">
        <Rise className="row">
          <h3>Math And Reading, Grades 3-5.</h3>
          <p>Every book follows the BC curriculum. Choose one subject or both.</p>
          <Photo src={practice6} alt="A girl works through an arithmetic page" sizes="140px" />
        </Rise>
        <Rise className="row" d={0.08}>
          <h3>Starts At Their Level.</h3>
          <p>A short online assessment finds where your child is, so the first book fits from page one.</p>
          <Photo src={assess1} alt="A child takes a short assessment on a laptop with her mother" sizes="140px" />
        </Rise>
        <Rise className="row" d={0.16}>
          <h3>Mailed To Your Door.</h3>
          <p>Your next book arrives before the current one runs out. Delivery is included.</p>
          <div className="ph"><Parcel /></div>
        </Rise>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", t: "Assess", c: "var(--sun)", d: "Your child completes an adaptive online assessment that identifies their level, strengths, gaps and misconceptions.",
    v: <div className="vis"><Image src={assess1} alt="A parent sits beside her daughter as she takes the assessment on a laptop" sizes="(min-width: 1080px) 380px, (min-width: 700px) 45vw, 92vw" placeholder="blur" /></div> },
  { n: "02", t: "Deliver", c: "var(--sky)", d: "We create and mail a physical workbook personalized to what your child needs to work on.", v: <div className="vis"><Parcel /></div> },
  { n: "03", t: "Practice", c: "var(--tang)", d: "Your child spends roughly 15-20 minutes a day working on paper.",
    v: <div className="vis"><Image src={practice6} alt="A girl works through an arithmetic page in pencil" sizes="(min-width: 1080px) 380px, (min-width: 700px) 45vw, 92vw" placeholder="blur" /></div> },
  { n: "04", t: "Scan", c: "var(--leaf)", d: "You take a photo of the completed pages with your phone.", v: <div className="vis"><Scan /></div> },
  { n: "05", t: "Adapt", c: "var(--sun)", d: "Our system checks your child's answers and updates their learning profile.", v: <div className="vis dk" data-io><PageFrac /></div> },
  { n: "06", t: "Repeat", c: "var(--sky)", d: "The next workbook is built from what your child mastered, struggled with or needs to review. It arrives before the current one runs out.", v: <div className="vis dk"><PageNext /></div> },
];

export function How() {
  return (
    <section className="sec" id="how" aria-labelledby="howT">
      <Knot />
      <Rise className="sec-head">
        <p className="eyebrow">How it works</p>
        <h2 id="howT">Six Steps. One Loop.</h2>
        <p className="lead">Every book is built from the last one, so the work always matches what your child needs next.</p>
      </Rise>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.n} className="step rise" style={{ "--d": `${i * 0.06}s` } as Vars}>
            <div className="top"><span className="num">{s.n}</span><span className="sq" style={{ background: s.c }} /></div>
            <h3>{s.t}.</h3>
            <p>{s.d}</p>
            {s.v}
          </li>
        ))}
      </ol>
      <Rise as="p" className="loopnote">
        <svg viewBox="0 0 34 34" aria-hidden="true"><path d="M27 12a11 11 0 1 0 1.5 8" /><path d="M28 5v7h-7" /></svg>
        Step 6 leads back to step 2. Two kids in the same grade get two different books.
      </Rise>
    </section>
  );
}

export function Why() {
  const cards = [
    ["Real Paper. Real Pencil.", "Your child learns away from screens. The only screen is your phone camera, for a few seconds."],
    ["Made For One Child.", "Every page targets what your child is ready for next, not what the rest of the class is on."],
    ["It Never Forgets.", "A skill your child missed comes back in new forms until they master it."],
    ["You See Everything.", "A progress report, updated continuously: what they got right, what keeps coming back, and what's next."],
  ];
  return (
    <section className="sec" id="why" aria-labelledby="whyT">
      <Knot />
      <Rise className="sec-head">
        <p className="eyebrow">Why choose {BRAND}?</p>
        <h2 id="whyT">Built Different, On Purpose.</h2>
      </Rise>
      <div className="why">
        {cards.map(([h, p], i) => (
          <Rise key={h} className={`c${i + 1}`} d={i * 0.08}>
            <span className="n">0{i + 1}</span>
            <h3>{h}</h3>
            <p>{p}</p>
          </Rise>
        ))}
      </div>
    </section>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  test: <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h5M8 16l2 2 4-4" /></svg>,
  book: <svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></svg>,
  box: <svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></svg>,
  cam: <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M9 6l1.5-2h3L15 6" /></svg>,
  chart: <svg viewBox="0 0 24 24"><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>,
  layers: <svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>,
};

function Card({ icon, bg, title, text, d }: { icon: string; bg: string; title: string; text: string; d: number }) {
  return (
    <Rise className="card" d={d}>
      <div className="ic" style={{ background: bg }} aria-hidden="true">{ICONS[icon]}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </Rise>
  );
}

export function Included() {
  return (
    <section className="sec" id="inc" aria-labelledby="incT">
      <Knot />
      <Rise className="sec-head">
        <p className="eyebrow">What&apos;s included</p>
        <h2 id="incT">Everything Your Child Needs. Nothing They Don&apos;t.</h2>
      </Rise>
      <div className="inc">
        <div className="col">
          <Card icon="test" bg="#FFF3C4" title="Placement Assessment" text="A short online assessment finds your child's level, strengths and gaps." d={0} />
          <Card icon="book" bg="#D9E3FF" title="Personalized Workbooks" text="Math, reading or both, made for your child and no one else." d={0.08} />
          <Card icon="box" bg="#FFD9C9" title="Delivery Included" text="Your next book arrives before the current one runs out." d={0.16} />
        </div>
        <Rise className="stack" aria-hidden="true">
          <Cover name="Arjun" book="Book 2" subject="Reading" bg="var(--sky)" />
          <Cover name="Leo" book="Book 5" subject="Math" bg="var(--leaf)" />
          <Cover name="Maya" book="Book 4" subject="Fractions" />
        </Rise>
        <div className="col">
          <Card icon="cam" bg="#CDEFDF" title="Photo Check-Ins" text="Snap the finished pages with your phone. That's it." d={0.04} />
          <Card icon="chart" bg="#FFF3C4" title="Progress Reports" text="Updated continuously: what they got right, what keeps coming back, what's next." d={0.12} />
          <Card icon="layers" bg="#D9E3FF" title="A Learning Profile" text="Every book builds on every book before it. Nothing is forgotten." d={0.2} />
        </div>
      </div>
    </section>
  );
}

const DRIFT: [StaticImageData, number, number, number, number, number, number, boolean][] = [
  [adapt4, 3, 7, 15, 21, 0.14, -4, false], [emo9, 23, 8, 12, 17, -0.1, 3, true],
  [emo5, 79, 5, 17, 22, 0.18, 4, false], [reading2, 62, 7, 12, 16, -0.14, -3, true],
  [emo4, 3, 70, 15, 19, -0.18, 3, false], [emo7, 80, 66, 17, 22, 0.1, -4, false],
  [emo11, 22, 78, 13, 16, 0.12, -2, true], [emo10, 64, 79, 13, 16, -0.1, 4, true],
];

export function Feel() {
  return (
    <section className="sec feel" aria-labelledby="feelT">
      <Knot />
      {DRIFT.map(([src, l, t, w, h, s, r, hide], i) => (
        <div key={i} className={`drift${hide ? " hide-sm" : ""}`} data-speed={s} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, "--r": `${r}deg` } as Vars}>
          <div className="ph"><Image src={src} alt="" sizes="(min-width: 760px) 18vw, 40vw" placeholder="blur" /></div>
        </div>
      ))}
      <div className="drift scrap hide-sm" data-speed=".24" data-io style={{ left: "9%", top: "38%", width: "11%", "--r": "-7deg" } as Vars}><PageRead /></div>
      <div className="drift scrap hide-sm" data-speed="-.2" data-io style={{ left: "81%", top: "35%", width: "11%", "--r": "6deg" } as Vars}><PageFrac /></div>
      <Rise className="msg">
        <h2 id="feelT">No Two Kids Learn The Same Way.</h2>
        <p className="lead">So no two {BRAND} books are the same. Each one starts where your child is, and moves on when they&apos;re ready.</p>
      </Rise>
    </section>
  );
}

export function Team() {
  return (
    <section className="sec" id="team" aria-labelledby="teamT">
      <Knot />
      <div className="found">
        <Rise>
          <p className="eyebrow">Who&apos;s behind it</p>
          <h2 id="teamT" style={{ margin: "16px 0 20px" }}>Made By Two Students Who Grew Up On Workbooks.</h2>
          <p className="lead">
            Savar and Cedric both did workbook programs as kids. We know what daily practice on paper builds, and we know what too much screen time feels like. {BRAND} is the program we wish we&apos;d had: real paper, with a book that keeps up with you.
          </p>
        </Rise>
        <Rise className="duo" d={0.1}>
          <div className="who"><div className="face" style={{ background: "var(--sun)" }}>S</div><div className="cap"><b>Savar Gupta</b>Co-founder</div></div>
          <div className="who"><div className="face" style={{ background: "var(--sky)", color: "#fff" }}>C</div><div className="cap"><b>Cedric Tanafranca</b>Co-founder</div></div>
        </Rise>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section className="sec" id="price" aria-labelledby="priceT">
      <Knot />
      <Rise className="sec-head">
        <p className="eyebrow">Pricing</p>
        <h2 id="priceT">Simple Pricing.</h2>
        <p className="lead">Less than CAD 2 a day for a workbook made for your child.</p>
      </Rise>
      <div className="plans">
        <Rise className="plan">
          <h3>One Subject</h3>
          <p className="small" style={{ margin: "-8px 0 0" }}>Math or reading</p>
          <div className="price">CAD {PLANS.one.price}<small> / month</small></div>
          <ul>
            <li>Placement assessment</li><li>Personalized workbooks, mailed home</li><li>Your next book arrives before the current one runs out</li>
            <li>Progress reports, updated continuously</li><li>Delivery included. Cancel anytime</li>
          </ul>
          <GetStarted src="price" plan="one" label="Choose one subject" ghost />
        </Rise>
        <Rise className="plan hl" d={0.08}>
          <span className="chip tag" style={{ "--tilt": "3deg", background: "#fff" } as Vars}>{PLANS.both.note}</span>
          <h3>Math + Reading</h3>
          <p className="small" style={{ margin: "-8px 0 0" }}>Both subjects, one plan</p>
          <div className="price">CAD {PLANS.both.price}<small> / month</small></div>
          <ul>
            <li>Everything in One Subject</li><li>A math book and a reading book every cycle</li><li>One progress report for both</li><li>Delivery included. Cancel anytime</li>
          </ul>
          <GetStarted src="price" plan="both" label="Choose math + reading" />
        </Rise>
      </div>
      <p className="fine">Now delivering in Metro Vancouver. You&apos;re charged when your first workbook ships. Prices in Canadian dollars.</p>
    </section>
  );
}

const FAQ: [string, string][] = [
  ["Is there any screen time?", "Your child works on paper. The only screen is your phone camera, for the few seconds it takes to snap the finished pages."],
  ["Who is it for?", "Children in grades 3 to 5 (about ages 8 to 11), in math, reading or both."],
  ["Does it follow the BC curriculum?", "Yes. Every book follows the BC curriculum for your child's grade, and starts from where your child actually is."],
  ["What if we miss a few days?", "The next book picks up where your child is. Nothing is lost."],
  ["What if we forget to send photos?", "We send a reminder. Until new pages arrive, the next book reviews what your child last worked on."],
  ["How is the work checked?", "Every page you photograph is checked, working included. The results update your child's learning profile and your progress report."],
  ["What happens to my child's work?", "We use it only to make your child's next book. We never sell or share it, and you can ask us to delete it at any time."],
  ["Can we cancel?", "Yes, anytime. You are charged only when a workbook ships."],
  ["Where do you deliver?", "Metro Vancouver for now. Enter your postal code when you sign up and we'll tell you right away."],
];

export function Faq() {
  return (
    <section className="sec" id="faq" aria-labelledby="faqT">
      <Knot />
      <Rise className="sec-head">
        <p className="eyebrow">FAQ</p>
        <h2 id="faqT">Questions, Answered.</h2>
      </Rise>
      <div className="faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}<span className="pm" aria-hidden="true" /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

const STRIP = [heroHome2, adapt4, emo9, emo10, reading1, emo6, adapt3, emo5];

export function Closing() {
  return (
    <section className="sec close" aria-labelledby="closeT">
      <Knot />
      <Rise as="ul" className="beliefs">
        <li><i style={{ background: "var(--sun)" }} />Learning belongs on paper, not on another screen.</li>
        <li><i style={{ background: "var(--sky)" }} /><span>Research links paper and handwriting to stronger learning.<sup><a href="#src">1-3</a></sup></span></li>
        <li><i style={{ background: "var(--tang)" }} />Every child is different, so every workbook is too.</li>
      </Rise>
      <Rise as="h2" id="closeT">This Is What Learning Should Be Like.</Rise>
      <Rise className="ctas">
        <GetStarted src="close" />
        <a className="btn ghost" href="#price">See pricing</a>
      </Rise>
      <div className="strip" aria-hidden="true">
        {STRIP.map((src, i) => (
          <div className="ph" key={i}><Image src={src} alt="" sizes="(min-width: 900px) 12vw, 45vw" placeholder="blur" /></div>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div>
        <a className="logo" href="#top">{BRAND}<b /></a>
        <p style={{ margin: "12px 0 0" }}>Personalized math and reading workbooks for grades 3-5, delivered in Metro Vancouver.</p>
        <p className="small" style={{ marginTop: 10 }}>© 2026 {BRAND}</p>
      </div>
      <div id="src">
        <p style={{ margin: "0 0 8px", fontWeight: 500, color: "var(--ink)" }}>Sources</p>
        <ol>{SOURCES.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>
    </footer>
  );
}

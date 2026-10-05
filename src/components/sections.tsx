// Landing page sections, composed from the Pagewise design system (src/ds).
// Site-only concerns stay here: next/image photos, scroll reveals (Rise/Knot), and the
// [data-open] buttons that open the reserve dialog.
import Image, { type StaticImageData } from "next/image";
import { BRAND, HERO, PLANS, SOURCES } from "@/lib/site";
import {
  BeliefList,
  CoverStack,
  Eyebrow,
  Faq as FaqList,
  FeatureCard,
  FeatureGrid,
  FounderCard,
  FounderGrid,
  GradientPanel,
  Hero as HeroBlock,
  IncludedCard,
  Mailer,
  Nav as NavBar,
  PhoneScan,
  PlanCard,
  PlanGrid,
  Section,
  SectionHeader,
  StepCard,
  StepGrid,
  SwapWord,
  WorkbookPage,
  type IconName,
} from "@/ds";
import { Knot, Rise, type Vars } from "./drawn";

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

/** Opens the reserve dialog (see reserve.tsx, which listens for [data-open]). */
function GetStarted({ src, plan, label = "Get started", ghost = false }: { src: string; plan?: string; label?: string; ghost?: boolean }) {
  return (
    <button className={`btn${ghost ? " ghost" : ""}`} data-open data-src={src} data-plan={plan}>
      {label} {!ghost && <span className="arr">→</span>}
    </button>
  );
}

const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

export function Nav() {
  return <NavBar brand={BRAND} cta={<button className="btn sm" data-open data-src="nav">Get started</button>} />;
}

export function Hero() {
  return (
    <HeroBlock
        id="top"
        eyebrow={HERO.eyebrow}
        lead={HERO.sub}
        animate
        meta={["Grades 3-5", `From CAD ${PLANS.one.price} a month`, "Delivery included"]}
        actions={
          <>
            <GetStarted src="hero" />
            <a className="btn ghost" href="#how">See how it works</a>
          </>
        }
        media={<Image src={heroHome1} alt="A boy writes in his workbook at a desk at home" sizes="(min-width: 1200px) 1120px, 100vw" placeholder="blur" loading="eager" fetchPriority="high" />}
      />
  );
}

export function What() {
  return (
    <Section id="what" aria-labelledby="whatT">
      <Knot />
      <div className="what">
        <Rise>
          <Eyebrow>What is {BRAND}?</Eyebrow>
          <h2 id="whatT" style={{ marginTop: 16 }}>A workbook that knows your child.</h2>
        </Rise>
        <Rise d={0.1}>
          <p className="big">
            A workbook for <SwapWord words={["fractions", "reading", "long division", "new words"]} />
            <br />
            made for one child: yours. Mailed to your door, and rebuilt from every page they finish.
          </p>
        </Rise>
      </div>
      <div className="rows">
        <Rise className="row">
          <h3>Math and reading, grades 3-5.</h3>
          <p>Every book follows the BC curriculum. Choose one subject or both.</p>
          <Photo src={practice6} alt="A girl works through an arithmetic page" sizes="140px" />
        </Rise>
        <Rise className="row" d={0.08}>
          <h3>Starts at their level.</h3>
          <p>A short online assessment finds where your child is, so the first book fits from page one.</p>
          <Photo src={assess1} alt="A child takes a short assessment on a laptop with her mother" sizes="140px" />
        </Rise>
        <Rise className="row" d={0.16}>
          <h3>Mailed to your door.</h3>
          <p>Your next book arrives before the current one runs out. Delivery is included.</p>
          <div className="ph"><Mailer animate /></div>
        </Rise>
      </div>
    </Section>
  );
}

const STEP_SIZES = "(min-width: 1080px) 380px, (min-width: 700px) 45vw, 92vw";

const STEPS = [
  { n: "01", t: "Assess", d: "Your child completes an adaptive online assessment that identifies their level, strengths, gaps and misconceptions.",
    v: <Image src={assess1} alt="A parent sits beside her daughter as she takes the assessment on a laptop" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "02", t: "Deliver", d: "We create and mail a physical workbook personalized to what your child needs to work on.", v: <Mailer animate />, tone: "photo" as const },
  { n: "03", t: "Practice", d: "Your child spends roughly 15-20 minutes a day working on paper.",
    v: <Image src={practice6} alt="A girl works through an arithmetic page in pencil" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "04", t: "Scan", d: "You take a photo of the completed pages with your phone.", v: <PhoneScan animate />, tone: "photo" as const },
  { n: "05", t: "Adapt", d: "Our system checks your child's answers and updates their learning profile.", v: <WorkbookPage />, tone: "paper" as const },
  { n: "06", t: "Repeat", d: "The next workbook is built from what your child mastered, struggled with or needs to review. It arrives before the current one runs out.", v: <WorkbookPage variant="next-book" />, tone: "paper" as const },
];

export function How() {
  return (
    <Section id="how" aria-labelledby="howT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="How it works" title="Six steps. One loop." titleId="howT" lead="Every book is built from the last one, so the work always matches what your child needs next." />
      </Rise>
      <StepGrid>
        {STEPS.map((s, i) => (
          <StepCard key={s.n} number={s.n} title={`${s.t}.`} visual={s.v} visualTone={s.tone} className="rise" style={d(i * 0.06)}>
            {s.d}
          </StepCard>
        ))}
      </StepGrid>
      <Rise as="p" className="loopnote">
        <svg viewBox="0 0 34 34" aria-hidden="true"><path d="M27 12a11 11 0 1 0 1.5 8" /><path d="M28 5v7h-7" /></svg>
        Step 6 leads back to step 2. Two kids in the same grade get two different books.
      </Rise>
    </Section>
  );
}

const WHY: [string, string][] = [
  ["Real paper. Real pencil.", "Your child learns away from screens. The only screen is your phone camera, for a few seconds."],
  ["Made for one child.", "Every page targets what your child is ready for next, not what the rest of the class is on."],
  ["It never forgets.", "A skill your child missed comes back in new forms until they master it."],
  ["You see everything.", "A progress report, updated continuously: what they got right, what keeps coming back, and what's next."],
];

export function Why() {
  return (
    <Section id="why" aria-labelledby="whyT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow={`Why choose ${BRAND}?`} title="Built different, on purpose." titleId="whyT" />
      </Rise>
      <FeatureGrid>
        {WHY.map(([h, p], i) => (
          <FeatureCard key={h} index={(i + 1) as 1 | 2 | 3 | 4} title={h} className="rise" style={d(i * 0.08)}>
            {p}
          </FeatureCard>
        ))}
      </FeatureGrid>
    </Section>
  );
}

const INCLUDED: [IconName, string, string, number][][] = [
  [
    ["test", "Placement assessment", "A short online assessment finds your child's level, strengths and gaps.", 0],
    ["book", "Personalized workbooks", "Math, reading or both, made for your child and no one else.", 0.08],
    ["box", "Delivery included", "Your next book arrives before the current one runs out.", 0.16],
  ],
  [
    ["cam", "Photo check-ins", "Snap the finished pages with your phone. That's it.", 0.04],
    ["chart", "Progress reports", "Updated continuously: what they got right, what keeps coming back, what's next.", 0.12],
    ["layers", "A learning profile", "Every book builds on every book before it. Nothing is forgotten.", 0.2],
  ],
];

export function Included() {
  const col = (items: [IconName, string, string, number][]) => (
    <div className="col">
      {items.map(([icon, title, text, delay]) => (
        <IncludedCard key={title} icon={icon} title={title} className="rise" style={d(delay)}>
          {text}
        </IncludedCard>
      ))}
    </div>
  );
  return (
    <Section id="inc" aria-labelledby="incT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="What's included" title="Everything your child needs. Nothing they don't." titleId="incT" />
      </Rise>
      <div className="inc">
        {col(INCLUDED[0])}
        <Rise>
          <CoverStack />
        </Rise>
        {col(INCLUDED[1])}
      </div>
    </Section>
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
    <Section className="feel" aria-labelledby="feelT">
      <Knot />
      {DRIFT.map(([src, l, t, w, h, s, r, hide], i) => (
        <div key={i} className={`drift${hide ? " hide-sm" : ""}`} data-speed={s} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, "--r": `${r}deg` } as Vars}>
          <div className="ph"><Image src={src} alt="" sizes="(min-width: 760px) 18vw, 40vw" placeholder="blur" /></div>
        </div>
      ))}
      <div className="drift scrap hide-sm" data-speed=".24" data-io style={{ left: "9%", top: "38%", width: "11%", "--r": "-7deg" } as Vars}><WorkbookPage variant="reading" /></div>
      <div className="drift scrap hide-sm" data-speed="-.2" data-io style={{ left: "81%", top: "35%", width: "11%", "--r": "6deg" } as Vars}><WorkbookPage /></div>
      <Rise className="msg">
        <h2 id="feelT">No two kids learn the same way.</h2>
        <p className="lead">So no two {BRAND} books are the same. Each one starts where your child is, and moves on when they&apos;re ready.</p>
      </Rise>
    </Section>
  );
}

export function Team() {
  return (
    <Section id="team" aria-labelledby="teamT">
      <Knot />
      <div className="found">
        <Rise>
          <Eyebrow>Who&apos;s behind it</Eyebrow>
          <h2 id="teamT" style={{ margin: "16px 0 20px" }}>Made by two students who grew up on workbooks.</h2>
          <p className="lead">
            Savar and Cedric both did workbook programs as kids. We know what daily practice on paper builds, and we know what too much screen time feels like. {BRAND} is the program we wish we&apos;d had: real paper, with a book that keeps up with you.
          </p>
        </Rise>
        <Rise d={0.1}>
          <FounderGrid>
            <FounderCard name="Savar Gupta" initial="S" field="warm" />
            <FounderCard name="Cedric Tanafranca" initial="C" field="cool" />
          </FounderGrid>
        </Rise>
      </div>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section id="price" aria-labelledby="priceT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Pricing" title="Simple pricing." titleId="priceT" lead="Less than CAD 2 a day for a workbook made for your child." />
      </Rise>
      <PlanGrid>
        <PlanCard
          className="rise"
          name="One subject"
          note={PLANS.one.note}
          price={PLANS.one.price}
          features={["Placement assessment", "Personalized workbooks, mailed home", "Your next book arrives before the current one runs out", "Progress reports, updated continuously", "Delivery included. Cancel anytime"]}
          ctaLabel="Choose one subject"
          cta={<GetStarted src="price" plan="one" label="Choose one subject" ghost />}
        />
        <PlanCard
          className="rise"
          style={d(0.08)}
          featured
          name="Math + Reading"
          note={PLANS.both.note}
          price={PLANS.both.price}
          features={["Everything in One Subject", "A math book and a reading book every cycle", "One progress report for both", "Delivery included. Cancel anytime"]}
          ctaLabel="Choose math + reading"
          cta={<GetStarted src="price" plan="both" label="Choose math + reading" />}
        />
      </PlanGrid>
    </Section>
  );
}

const FAQ = [
  ["Is there any screen time?", "Your child works on paper. The only screen is your phone camera, for the few seconds it takes to snap the finished pages."],
  ["Who is it for?", "Children in grades 3 to 5 (about ages 8 to 11), in math, reading or both."],
  ["Does it follow the BC curriculum?", "Yes. Every book follows the BC curriculum for your child's grade, and starts from where your child actually is."],
  ["What if we miss a few days?", "The next book picks up where your child is. Nothing is lost."],
  ["What if we forget to send photos?", "We send a reminder. Until new pages arrive, the next book reviews what your child last worked on."],
  ["How is the work checked?", "Every page you photograph is checked, working included. The results update your child's learning profile and your progress report."],
  ["What happens to my child's work?", "We use it only to make your child's next book. We never sell or share it, and you can ask us to delete it at any time."],
  ["Can we cancel?", "Yes, anytime. You are charged only when a workbook ships."],
  ["Where do you deliver?", "Metro Vancouver for now. Enter your postal code when you sign up and we'll tell you right away."],
].map(([question, answer]) => ({ question, answer }));

export function Faq() {
  return (
    <Section id="faq" aria-labelledby="faqT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="FAQ" title="Questions, answered." titleId="faqT" />
      </Rise>
      <FaqList items={FAQ} />
    </Section>
  );
}

const STRIP = [heroHome2, adapt4, emo9, emo10, reading1, emo6, adapt3, emo5];

export function Closing() {
  return (
    <Section className="close" aria-labelledby="closeT">
      <Knot />
      <GradientPanel>
        <Rise>
          <BeliefList
            items={[
              { text: "Learning belongs on paper, not on another screen.", color: "sun" },
              { text: <>Research links paper and handwriting to stronger learning.<sup><a href="#src">1-3</a></sup></>, color: "sky" },
              { text: "Every child is different, so every workbook is too.", color: "tang" },
            ]}
          />
        </Rise>
        <Rise as="h2" id="closeT">This is what learning should be like.</Rise>
        <Rise className="ctas">
          <GetStarted src="close" />
          <a className="btn ghost" href="#price">See pricing</a>
        </Rise>
      </GradientPanel>
      <div className="strip" aria-hidden="true">
        {STRIP.map((src, i) => (
          <div className="ph" key={i}><Image src={src} alt="" sizes="(min-width: 900px) 12vw, 45vw" placeholder="blur" /></div>
        ))}
      </div>
    </Section>
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

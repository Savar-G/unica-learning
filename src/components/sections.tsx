// Landing page sections, composed from the Unica Learning design system (src/ds).
// Site-only concerns stay here: next/image photos, scroll reveals (Rise/Knot), and the
// links to /start, the signup for the free online math assessment (#82).
import type { ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { FaqMore } from "@/components/faq-more";
import { StartLink, StartNote } from "@/components/start-link";
import { BRAND, FIRST_MONTH_OFF, HERO, PLANS, cad, firstMonth } from "@/lib/site";
import { FAQ } from "@/lib/faq";
import {
  BeliefList,
  Eyebrow,
  Faq as FaqList,
  Hero as HeroBlock,
  Highlight,
  IncludedCard,
  Nav as NavBar,
  PlanCard,
  PlanGrid,
  Section,
  SectionHeader,
  StepCard,
  StepGrid,
  SwapWord,
  type IconName,
} from "@/ds";
import { CompareTable } from "./compare";
import { Knot, Rise, type Vars } from "./drawn";

import heroHome1 from "@/assets/img/hero-home-1.jpg";
import assessPhoto from "@/assets/img/loop-assess-1.jpg";
import practice6 from "@/assets/img/loop-practice-6.jpg";
import deliverPhoto from "@/assets/img/loop-deliver.jpg";
import scanPhoto from "@/assets/img/loop-scan.jpg";
import adaptPhoto from "@/assets/img/loop-adapt.jpg";
import repeatPhoto from "@/assets/img/loop-repeat.jpg";
import emo1 from "@/assets/img/emotion-1.jpg";
import adapt4 from "@/assets/img/loop-adapt-4.jpg";
import heroHome2 from "@/assets/img/hero-home-2.jpg";
import emo4 from "@/assets/img/emotion-4.jpg";
import emo5 from "@/assets/img/emotion-5.jpg";
import emo7 from "@/assets/img/emotion-7.jpg";
import emo9 from "@/assets/img/emotion-9.jpg";
import emo10 from "@/assets/img/emotion-10.jpg";
import emo11 from "@/assets/img/emotion-11.jpg";

/** The main call to action (D-041): the free online math assessment, before any plan or card (#82). */
export const START_LABEL = "Take free assessment";

function GetStarted({ src }: { src: string }) {
  return <StartLink src={src}>{START_LABEL} <span className="arr">→</span></StartLink>;
}

const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

export function Nav() {
  return <NavBar brand={BRAND} cta={<StartLink className="btn sm" src="nav">Free assessment</StartLink>} />;
}

// 8-9 characters only: the chip is as wide as its longest word, so a long topic
// leaves a gap after every short one.
const TOPICS = [
  "fractions", "rounding", "decimals", "perimeter", "division", "equations", "percents", "multiples",
  "patterns", "symmetry", "geometry", "carrying", "integers", "addition", "graphing", "measuring",
];

export function Hero() {
  return (
    <HeroBlock
        id="top"
        className="hero-ink"
        eyebrow=""
        title={<>Struggling with <span className="nowrap"><SwapWord words={TOPICS} />?</span><br />{HERO.title}</>}
        highlight={HERO.highlight}
        lead={HERO.lead}
        meta={["For ages 6-12", "Free assessment on a laptop or tablet", "30-day money-back guarantee", "Cancel anytime"]}
        page={null}
        report={null}
        animate
        actions={
          <>
            <GetStarted src="hero" />
            <Link className="btn ghost" href="/sample-report">See a sample report</Link>
          </>
        }
        media={<Image src={heroHome1} alt="A boy writes in his workbook at a desk at home" sizes="(min-width: 1200px) 1120px, 100vw" placeholder="blur" loading="eager" fetchPriority="high" />}
      />
  );
}

const STEP_SIZES = "(min-width: 1080px) 380px, (min-width: 700px) 45vw, 92vw";

const STEPS = [
  { n: "01", t: "Assess", d: "Your child takes the free online assessment. The report shows their level and gaps. You choose a plan after.",
    v: <Image src={assessPhoto} alt="A girl and her mother sit at a laptop, with a workbook open on the table" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "02", t: "Deliver", d: "We mail a workbook matched to their level and gaps. It follows your school curriculum.", v: <Image src={deliverPhoto} alt="Two mailers waiting on a front step" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "03", t: "Practice", d: "Your child works on paper for 15-30 minutes a day, 5 days a week.",
    v: <Image src={practice6} alt="A girl works through an arithmetic page in pencil" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "04", t: "Scan", d: "Take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions.", v: <Image src={scanPhoto} alt="A phone camera frames a page to photograph it" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "05", t: "Adapt", d: "Each scan updates the program. Missed carrying? You get more of it. Got it? It moves on.", v: <Image src={adaptPhoto} alt="A girl shows her finished work to her parents" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "06", t: "Repeat", d: <>The next book arrives before this one runs out. <em>Struggling with fractions? Your next book focuses on fractions.</em></>, v: <Image src={repeatPhoto} alt="A girl starts on her next book at the dining table" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
];

export function How() {
  return (
    <Section id="how" aria-labelledby="howT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="How it works" title="Start easily. Repeat easily." titleId="howT" lead="Every book is built from the last one." />
      </Rise>
      <StepGrid>
        {STEPS.map((s, i) => (
          <StepCard key={s.n} number={s.n} title={`${s.t}.`} visual={s.v} visualTone={s.tone} className="rise" style={d(i * 0.06)}>
            {s.d}
          </StepCard>
        ))}
      </StepGrid>
    </Section>
  );
}

// Program parts first, the workbook last (D-095). The left column reads first, then the photo, then the right column.
const INCLUDED: [IconName, string, ReactNode, number][][] = [
  [
    ["layers", "A plan built for your child", "The free assessment finds your child's level and gaps. It sets what each book covers.", 0],
    ["calendar", "Daily practice, rewarded", <>15-30 minutes a day, 5 days a week, with rewards for every page and every week. <Link href="/rewards" className="more-link">See the rewards <span aria-hidden="true">→</span></Link></>, 0.08],
    ["pencil", "Real paper. Real pencil.", "Daily practice happens away from screens. The app is for you, not them.", 0.16],
  ],
  [
    ["cam", "Instant answer check", "Take a photo of a finished page in our app and see what's right in seconds. Stuck on a problem? Photograph it to see every step explained.", 0.04],
    ["voice", "The Unica companion", <>Stuck on a question? Your child starts a voice call, and the Unica companion explains it out loud, step by step, on a shared board. <Link href="#guidance" className="more-link">See it in action <span aria-hidden="true">→</span></Link></>, 0.1],
    ["chart", "Progress reports", "A report and worked solutions in the app after every scan.", 0.16],
    ["book", "Workbooks mailed home", "2 math workbooks a month, delivered before the current workbook ends.", 0.22],
  ],
];

export function Included() {
  const col = (items: [IconName, string, ReactNode, number][], first?: ReactNode) => (
    <div className="col">
      {first}
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
        <SectionHeader eyebrow="What you get each month" title="Everything your child needs. Nothing they don't." titleId="incT" />
      </Rise>
      <div className="inc">
        {col(INCLUDED[0])}
        <Rise>
          <div className="ph" style={{ aspectRatio: "3 / 4", borderRadius: 4 }}><Image src={emo1} alt="A boy works on a paper page at his desk" sizes="(min-width: 980px) 300px, 92vw" placeholder="blur" /></div>
        </Rise>
        {col(INCLUDED[1])}
      </div>
    </Section>
  );
}

const DRIFT: [StaticImageData, number, number, number, number, number, number, boolean][] = [
  [adapt4, 3, 7, 15, 21, 0.14, -4, false], [emo9, 23, 8, 12, 17, -0.1, 3, true],
  [emo5, 79, 5, 17, 22, 0.18, 4, false], [heroHome2, 62, 7, 12, 16, -0.14, -3, true],
  [emo4, 3, 70, 15, 19, -0.18, 3, false], [emo7, 80, 66, 17, 22, 0.1, -4, false],
  [emo11, 22, 78, 13, 16, 0.12, -2, true], [emo10, 64, 79, 13, 16, -0.1, 4, true],
];

export function Feel() {
  return (
    <Section className="feel" aria-labelledby="feelT">
      <Knot />
      {DRIFT.map(([src, l, t, w, h, s, r, hide], i) => (
        <div key={i} className={`drift${hide ? " hide-sm" : ""}`} aria-hidden="true" data-speed={s} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, "--r": `${r}deg` } as Vars}>
          <div className="ph"><Image src={src} alt="" sizes="(min-width: 760px) 18vw, 40vw" placeholder="blur" /></div>
        </div>
      ))}
      <Rise className="msg">
        <h2 id="feelT">A program made for one child: yours.</h2>
        <p className="lead">Your child&apos;s program starts from the assessment. After that, it&apos;s shaped by their progress.</p>
      </Rise>
    </Section>
  );
}

// One list for the home page and /our-story, so the promise text cannot drift apart.
export const PROMISE: [IconName, string, string][] = [
  ["shield", "30-day money-back guarantee", "If it is not working for your child within 30 days of your first payment, we refund your payment in full."],
  ["calendar", "Fits your family's schedule", "Kids are busy. Take a week or a month off, and pick up where your child left off."],
  ["test", "Free assessment, nothing to pay today", "Your child takes the free online math assessment before you choose a plan. We charge nothing until your first workbook ships."],
  ["undo", "Cancel anytime", "No contract. Stop whenever you want."],
];

// The home page shows the first two; pricing already says "free assessment" and "cancel anytime".
const HOME_PROMISE = PROMISE.slice(0, 2);

export function PromiseCards({ items = PROMISE }: { items?: [IconName, string, string][] }) {
  return (
    <div className="promise">
      {items.map(([icon, title, text], i) => (
        <IncludedCard key={title} icon={icon} title={title} className="rise" style={d(i * 0.06)}>
          {text}
        </IncludedCard>
      ))}
    </div>
  );
}

export function OurPromise() {
  return (
    <Section id="promise" aria-labelledby="promiseT">
      <Knot />
      <div className="found">
        <Rise>
          <Eyebrow>Our promise</Eyebrow>
          <h2 id="promiseT" style={{ margin: "16px 0 20px" }}>Try it with nothing to lose.</h2>
          <p className="lead">{BRAND} is made in Vancouver by two students who grew up on workbooks. We both did workbook programs for years and tutored other kids. We built the middle: personal, on paper, and affordable.</p>
          <p style={{ margin: "18px 0 0" }}>
            <Link href="/our-story" style={{ fontWeight: 500, textUnderlineOffset: 4 }}>Read why we built it →</Link>
          </p>
        </Rise>
        <PromiseCards items={HOME_PROMISE} />
      </div>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section id="price" aria-labelledby="priceT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Pricing" title="A learning centre's structure. A plan built for your child. A fraction of the price." titleId="priceT" />
        <p className="g-line">Try it with a <Highlight>30-day money-back guarantee.</Highlight></p>
      </Rise>
      <PlanGrid>
        <PlanCard
          className="rise"
          featured
          name={PLANS.one.name}
          note={PLANS.one.note}
          price={PLANS.one.price}
          offer={{ price: cad(firstMonth(PLANS.one.price)), note: `first month, ${FIRST_MONTH_OFF}% off!`, then: `Then CAD ${PLANS.one.price} a month.` }}
          features={["Free online math assessment and report, before you choose a plan", "A learning plan built from your child's level and gaps", "Progress reports after every check-in", "Personalized math workbooks matched to your child's level and gaps, mailed home", "Your next book arrives before the current one runs out", "Delivery included. Cancel anytime"]}
          ctaLabel={START_LABEL}
          cta={<div className="plan-cta"><GetStarted src="price" /><StartNote /></div>}
        />
      </PlanGrid>
      <CompareTable />
    </Section>
  );
}

export function Faq() {
  return (
    <Section id="faq" aria-labelledby="faqT">
      <Knot />
      <Rise>
        <SectionHeader className="faq-head" eyebrow="FAQ" title="Questions, answered." titleId="faqT" lead={<>Have another question? <Link href="/contact">Contact us</Link> and we will write back.</>} />
      </Rise>
      <FaqList items={FAQ} />
      <FaqMore />
    </Section>
  );
}

const CLOSING_BELIEFS = [
  { text: "Every child learns differently. Learning should adapt.", color: "sun" },
  { text: "No child should fall behind because the class moved on.", color: "sky" },
  { text: "Personal, on paper, and affordable.", color: "tang" },
] as const;

/** The closing claim. Rendered inside <Footer>, in the same colour field as the footer card (D-080). */
export function Closing() {
  return (
    <section className="close" aria-labelledby="closeT">
      <Rise>
        <BeliefList items={[...CLOSING_BELIEFS]} />
      </Rise>
      <Rise as="h2" id="closeT">This is what learning should be like.</Rise>
      <Rise className="ctas">
        <GetStarted src="close" />
        <a className="btn ghost" href="#price">See pricing</a>
        <StartNote />
      </Rise>
    </section>
  );
}

/** Last pencil-thread knot. The thread lives in <main>, and the closing now sits after it, in the footer field. */
export function ThreadEnd() {
  return (
    <div className="thread-end">
      <Knot />
    </div>
  );
}

const FOOTER_GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Learn", links: [{ label: "How it works", href: "/#how" }, { label: "What you get", href: "/#inc" }, { label: "Pricing", href: "/#price" }, { label: "FAQ", href: "/#faq" }, { label: "How we compare", href: "/compare" }] },
  { title: "Company", links: [{ label: "Our story", href: "/our-story" }, { label: "Rewards", href: "/rewards" }, { label: "Resources", href: "/resources" }] },
  { title: "Help", links: [{ label: "Contact us", href: "/contact" }, { label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] },
];

/** Site footer (D-080): a white link card inside a grainy colour field. The home page passes <Closing /> as children. */
export function Footer({ children }: { children?: ReactNode }) {
  return (
    <div className={`ending${children ? " has-close" : ""}`}>
      <div className="ending-field">
        {children}
        <footer className="foot">
          <div className="foot-brand">
            <a className="logo" href="#top">{BRAND}<b /></a>
            <p>A personalized math learning program for ages 6-12.</p>
          </div>
          {FOOTER_GROUPS.map((g) => (
            <nav className="foot-col" key={g.title} aria-label={g.title}>
              <h2>{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.label}>{l.href.startsWith("/") && !l.href.startsWith("/#") ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}</li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="foot-fine">
            <span>© 2026 {BRAND}</span>
            <span>Made in Vancouver, BC</span>
            <span>30-day money-back guarantee</span>
            <span>Cancel anytime</span>
            <CookieSettingsButton />
          </div>
        </footer>
      </div>
    </div>
  );
}

// Landing page sections, composed from the Pagewise design system (src/ds).
// Site-only concerns stay here: next/image photos, scroll reveals (Rise/Knot), and the
// [data-open] buttons that open the reserve dialog.
import Image, { type StaticImageData } from "next/image";
import { BRAND, HERO, PLANS } from "@/lib/site";
import {
  BeliefList,
  Eyebrow,
  Faq as FaqList,
  FeatureCard,
  FeatureGrid,
  GradientPanel,
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
import { Knot, Rise, type Vars } from "./drawn";
import { LoopPath } from "./loop-path";

import heroHome1 from "@/assets/img/hero-home-1.jpg";
import heroHome2 from "@/assets/img/hero-home-2.jpg";
import assessPaper from "@/assets/img/loop-assess-paper.jpg";
import practice6 from "@/assets/img/loop-practice-6.jpg";
import deliverPhoto from "@/assets/img/loop-deliver.jpg";
import scanPhoto from "@/assets/img/loop-scan.jpg";
import adaptPhoto from "@/assets/img/loop-adapt.jpg";
import repeatPhoto from "@/assets/img/loop-repeat.jpg";
import emo1 from "@/assets/img/emotion-1.jpg";
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
function GetStarted({ src, plan, label = "Take free assessment", ghost = false }: { src: string; plan?: string; label?: string; ghost?: boolean }) {
  return (
    <button className={`btn${ghost ? " ghost" : ""}`} data-open data-src={src} data-plan={plan}>
      {label} {!ghost && <span className="arr">→</span>}
    </button>
  );
}

const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

export function Nav() {
  return <NavBar brand={BRAND} cta={<button className="btn sm" data-open data-src="nav">Free assessment</button>} />;
}

export function Hero() {
  return (
    <HeroBlock
        id="top"
        eyebrow={HERO.eyebrow}
        lead={HERO.sub}
        page={null}
        report={null}
        animate
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
          <h3>Math and reading, ages 6-12.</h3>
          <p>Every book follows the BC curriculum. Choose one subject or both.</p>
          <Photo src={practice6} alt="A girl works through an arithmetic page" sizes="140px" />
        </Rise>
        <Rise className="row" d={0.08}>
          <h3>Starts at their level.</h3>
          <p>A free placement assessment, on paper, finds where your child is, so the first book fits from page one.</p>
          <Photo src={assessPaper} alt="A child works through a page of math problems in pencil" sizes="140px" />
        </Rise>
        <Rise className="row" d={0.16}>
          <h3>Mailed to your door.</h3>
          <p>Your next book arrives before the current one runs out. Delivery is included.</p>
          <Photo src={deliverPhoto} alt="Two mailers waiting on a front step" sizes="140px" />
        </Rise>
      </div>
    </Section>
  );
}

const STEP_SIZES = "(min-width: 1080px) 380px, (min-width: 700px) 45vw, 92vw";

const STEPS = [
  { n: "01", t: "Assess", d: "We send a free placement assessment on paper. It finds your child's level, strengths, gaps and misconceptions.",
    v: <Image src={assessPaper} alt="A child works through a page of math problems in pencil" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "02", t: "Deliver", d: "We create and mail a physical workbook personalized to what your child needs to work on.", v: <Image src={deliverPhoto} alt="Two mailers waiting on a front step" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "03", t: "Practice", d: "Your child spends roughly 15-20 minutes a day working on paper.",
    v: <Image src={practice6} alt="A girl works through an arithmetic page in pencil" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "04", t: "Scan", d: "You take a photo of the completed pages with your phone.", v: <Image src={scanPhoto} alt="A phone camera frames a page to photograph it" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "05", t: "Adapt", d: "Our system checks your child's answers and updates their learning profile.", v: <Image src={adaptPhoto} alt="A girl shows her finished work to her parents" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "06", t: "Repeat", d: "The next workbook is built from what your child mastered, struggled with or needs to review. It arrives before the current one runs out.", v: <Image src={repeatPhoto} alt="A girl starts on her next book at the dining table" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
];

export function How() {
  return (
    <Section id="how" aria-labelledby="howT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="How it works" title="Six steps. One loop." titleId="howT" lead="Every book is built from the last one, so the work always matches what your child needs next." />
      </Rise>
      <div className="loopwrap">
        <LoopPath />
        <StepGrid>
          {STEPS.map((s, i) => (
            <StepCard key={s.n} number={s.n} title={`${s.t}.`} visual={s.v} visualTone={s.tone} className="rise" style={d(i * 0.06)}>
              {s.d}
            </StepCard>
          ))}
        </StepGrid>
      </div>
      <Rise as="p" className="loopnote">
        <span className="sr-only">After step 6, the next book starts again at step 2. </span>
        Two kids the same age get two different books.
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
    ["test", "Free placement assessment", "A short assessment on paper finds your child's level, strengths and gaps.", 0],
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
          <div className="ph" style={{ aspectRatio: "3 / 4", borderRadius: 4 }}><Image src={emo1} alt="A boy works on a paper page at his desk" sizes="(min-width: 980px) 300px, 92vw" placeholder="blur" /></div>
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
      <Rise className="msg">
        <h2 id="feelT">No two kids learn the same way.</h2>
        <p className="lead">So no two {BRAND} books are the same. Each one starts where your child is, and moves on when they&apos;re ready.</p>
      </Rise>
    </Section>
  );
}

const PROMISE: [IconName, string, string][] = [
  ["shield", "30-day money-back guarantee", "If it is not working for your child in the first 30 days, we refund your payment in full."],
  ["calendar", "Fits your family's schedule", "Kids are busy. Take a week or a month off, and pick up where your child left off."],
  ["test", "Free assessment, no card", "See where your child is before you pay anything."],
  ["undo", "Cancel anytime", "No contract. Stop whenever you want."],
];

export function OurPromise() {
  return (
    <Section id="promise" aria-labelledby="promiseT">
      <Knot />
      <div className="found">
        <Rise>
          <Eyebrow>Our promise</Eyebrow>
          <h2 id="promiseT" style={{ margin: "16px 0 20px" }}>Try it with nothing to lose.</h2>
          <p className="lead">
            {BRAND} is made in Vancouver by a small team who grew up on paper workbooks. Every family starts with a free assessment, and every plan comes with a 30-day money-back guarantee.
          </p>
        </Rise>
        <div className="promise">
          {PROMISE.map(([icon, title, text], i) => (
            <IncludedCard key={title} icon={icon} title={title} className="rise" style={d(i * 0.06)}>
              {text}
            </IncludedCard>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section id="price" aria-labelledby="priceT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Pricing" title="Simple pricing." titleId="priceT" />
        <p className="g-line">Every plan has a <Highlight>30-day money-back guarantee.</Highlight></p>
      </Rise>
      <PlanGrid>
        <PlanCard
          className="rise"
          name="One subject"
          note={PLANS.one.note}
          price={PLANS.one.price}
          features={["Free placement assessment", "Personalized workbooks, mailed home", "Your next book arrives before the current one runs out", "Progress reports, updated continuously", "Delivery included. Cancel anytime", "30-day money-back guarantee"]}
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
          features={["Everything in One Subject", "A math book and a reading book every cycle", "One progress report for both", "Delivery included. Cancel anytime", "30-day money-back guarantee"]}
          ctaLabel="Choose math + reading"
          cta={<GetStarted src="price" plan="both" label="Choose math + reading" />}
        />
      </PlanGrid>
    </Section>
  );
}

const FAQ = [
  ["Is there any screen time?", "Your child works on paper. The only screen is your phone camera, for the few seconds it takes to snap the finished pages."],
  ["Who is it for?", "Children in grades 1 to 7 (ages 6 to 12), in math, reading or both."],
  ["How does the free assessment work?", "We send a short placement assessment on paper, matched to your child's age. Your child does it at home, and you send us a photo of the finished pages. It is free, and we use it to make your child's first book."],
  ["Does it follow the BC curriculum?", "Yes. Every book follows the BC curriculum for your child's grade, and starts from where your child actually is."],
  ["Can we take a break?", "Yes. Pause for a week, a month or longer. You pay only when a book ships, and nothing is lost: the next book starts where your child left off."],
  ["What if we miss a few days?", "The next book picks up where your child is. Nothing is lost."],
  ["What if we forget to send photos?", "We send a reminder. Until new pages arrive, the next book reviews what your child last worked on."],
  ["How is the work checked?", "Every page you photograph is checked, working included. The results update your child's learning profile and your progress report."],
  ["What happens to my child's work?", "We use it only to make your child's next book. We never sell or share it, and you can ask us to delete it at any time."],
  ["What if it is not right for my child?", "Every plan has a 30-day money-back guarantee. If it is not working for your child in the first 30 days, tell us and we refund your payment in full."],
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
              { text: "We believe paper and pencil build stronger learning.", color: "sky" },
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
        <p style={{ margin: "12px 0 0" }}>Personalized math and reading workbooks for ages 6-12, delivered in Metro Vancouver.</p>
        <p className="small" style={{ marginTop: 10 }}>Made in Vancouver, BC · 30-day money-back guarantee · Cancel anytime</p>
        <p className="small" style={{ marginTop: 10 }}>© 2026 {BRAND}</p>
      </div>
    </footer>
  );
}

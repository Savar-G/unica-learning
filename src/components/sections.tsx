// Landing page sections, composed from the Pagewise design system (src/ds).
// Site-only concerns stay here: next/image photos, scroll reveals (Rise/Knot), and the
// [data-open] buttons that open the reserve dialog.
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { BRAND, HERO, PLANS } from "@/lib/site";
import { SUPPORT_HREF } from "@/lib/contact";
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
        eyebrow=""
        subtitle={HERO.subtitle}
        lead={HERO.lead}
        meta={["Math and reading", "Ages 6-12", `From CAD ${PLANS.one.price}/month`, "30-day money-back guarantee"]}
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
      <div className="what box">
        <Rise>
          <Eyebrow>What is {BRAND}?</Eyebrow>
          <h2 id="whatT" style={{ marginTop: 16 }}>
            Schools and tutoring programs put every child in <Highlight animate>the same box.</Highlight>
          </h2>
        </Rise>
        <Rise d={0.1} className="what-cols">
          <p className="big">
            Same material, same pace, same teaching. <span className="nowrap">Miss <SwapWord
              words={[
                "fractions", "phonics", "times tables", "sight words", "long division", "place value",
                "spelling", "word problems", "decimals", "telling time", "vowel sounds", "mental math",
                "grammar", "percents", "ratios", "comprehension",
              ]}
            /></span>
            <br />
            and every lesson after it gets harder.
          </p>
          <p className="big">Your child needs learning built around them: their level, their pace. That&apos;s {BRAND}.</p>
        </Rise>
      </div>
      <div className="rows">
        <Rise className="row">
          <h3>Math and reading, ages 6-12.</h3>
          <p>Covers your school curriculum, at your child&apos;s pace. When they&apos;re ready, the books move ahead, so they see new topics before their class does. Choose one subject or both.</p>
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
  { n: "01", t: "Assess", d: "We send a free placement assessment on paper. It finds your child's level and where the gaps are.",
    v: <Image src={assessPaper} alt="A child works through a page of math problems in pencil" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "02", t: "Deliver", d: "We mail a workbook matched to your child's level and gaps.", v: <Image src={deliverPhoto} alt="Two mailers waiting on a front step" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "03", t: "Practice", d: "Your child works on paper for about 15-20 minutes a day.",
    v: <Image src={practice6} alt="A girl works through an arithmetic page in pencil" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "04", t: "Scan", d: "Take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions so your child can understand what went wrong.", v: <Image src={scanPhoto} alt="A phone camera frames a page to photograph it" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "05", t: "Adapt", d: "Based on how they did, we choose and adjust their next workbook: more practice where they're struggling, and moving ahead where they're ready. Every book is shaped by how your child is doing.", v: <Image src={adaptPhoto} alt="A girl shows her finished work to her parents" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
  { n: "06", t: "Repeat", d: <>Your next book arrives before the current one runs out, so there&apos;s never a gap. Then the loop starts again. <em>Struggling with fractions? Your next book focuses on fractions.</em></>, v: <Image src={repeatPhoto} alt="A girl starts on her next book at the dining table" sizes={STEP_SIZES} placeholder="blur" />, tone: "photo" as const },
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
    </Section>
  );
}

const WHY: [string, string][] = [
  ["Real paper. Real pencil.", "Your child learns away from screens. The app is for you, not them."],
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
    ["book", "Workbooks", "1 workbook per subject, about 20-25 pages.", 0],
    ["calendar", "Daily practice", "15-20 minutes a day, 5 days a week.", 0.08],
    ["box", "Delivery", "Delivered to your door before the current book ends.", 0.16],
  ],
  [
    ["cam", "Stuck? Scan it.", "When your child is stuck, scan the problem with our app. You see every step, explained, so you can walk them through it.", 0.04],
    ["test", "Instant answer check", "Scan a finished page and see what's right in seconds. No answer key needed. Each scan also helps us plan the next book.", 0.12],
    ["chart", "Progress reports", "A progress report and worked solutions in the app, updated after every scan.", 0.2],
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
  [emo5, 79, 5, 17, 22, 0.18, 4, false], [reading2, 62, 7, 12, 16, -0.14, -3, true],
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
        <h2 id="feelT">A workbook made for one child: yours.</h2>
        <p className="lead">No two {BRAND} books are the same. Each one starts where your child is, and moves on when they&apos;re ready.</p>
      </Rise>
    </Section>
  );
}

const PROMISE: [IconName, string, string][] = [
  ["shield", "30-day money-back guarantee", "If it is not working for your child within 30 days of your first payment, we refund your payment in full."],
  ["calendar", "Fits your family's schedule", "Kids are busy. Take a week or a month off, and pick up where your child left off."],
  ["test", "Free assessment, nothing to pay today", "We charge nothing until your first workbook ships."],
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
          features={["Free placement assessment", "Personalized workbooks matched to your child's level and gaps, mailed home", "Your next book arrives before the current one runs out", "Progress reports after every check-in", "Delivery included. Cancel anytime"]}
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
  ["How is the work checked?", "You take a photo of the finished pages with your phone. We mark the work, show you what your child got right and where the gaps are, and give the solutions so they can understand any mistakes."],
  ["What if it is not right for my child?", "Every plan has a 30-day money-back guarantee. If it is not working for your child within 30 days of your first payment, we refund your payment in full."],
  ["How is this different from Kumon?", `Kumon moves every child through a set sequence of worksheets, and Metro Vancouver centres charge about $185-$260 per subject a month. ${BRAND} starts at your child's level, builds every book from how they did, and costs less: from CAD ${PLANS.one.price} a month.`],
  ["What if my child is struggling a lot?", "The next book focuses on the gap with extra practice, and you'll see exactly where they're stuck so you can help right away."],
  ["Is there any screen time?", "Your child works on paper. The app is for you: scan a page when they're stuck or to check answers, then help them yourself."],
  ["Who is it for?", "Children in grades 1 to 7 (ages 6 to 12), in math, reading or both."],
  ["How does the free assessment work?", "We send a short placement assessment on paper, matched to your child's age. Your child does it at home, and you send us a photo of the finished pages. It is free, and we use it to make your child's first book."],
  ["What do the books cover?", "Math: numbers, math facts, fractions and decimals, measurement and word problems. Reading: phonics, reading aloud, vocabulary, understanding what they read, and writing. The free assessment decides where your child starts, which can be behind, at or ahead of their grade."],
  ["Does it follow our school curriculum?", "Yes. Books follow the BC curriculum today, and Alberta, Saskatchewan, Manitoba and Ontario are next. Pick your curriculum when you sign up: if its books are not ready, you join the waitlist and we email you when they are. Within the curriculum, each book follows your child's level, not just their grade."],
  ["Can we take a break?", "Yes. Pause for a week, a month or longer. Contact us to arrange a pause. The next book starts where your child left off."],
  ["What if we miss a few days?", "The next book picks up where your child is. Nothing is lost."],
  ["What if we forget to send photos?", "We send a reminder. Until new pages arrive, the next book reviews what your child last worked on."],
  ["What happens to my child's work?", "We use it to plan your child's next book and show their progress. We do not sell it, and you can ask us to delete it at any time."],
  ["Why do you ask for my card?", "So your first workbook can ship as soon as it is ready. We charge nothing when you sign up. When your first workbook ships, we charge your first month, then every month until you cancel. Cancel before it ships and you pay nothing. Families on the waitlist do not add a card."],
  ["Can we cancel?", "Yes, anytime. Contact us to cancel. If you cancel before your first workbook ships, you pay nothing."],
  ["Where do you deliver?", "We deliver across Canada. Delivery is included in every plan."],
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
              { text: "Every child learns differently. Learning should adapt.", color: "sun" },
              { text: "No child should fall behind because the class moved on.", color: "sky" },
              { text: "Personal, on paper, and affordable.", color: "tang" },
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
        <p style={{ margin: "12px 0 0" }}>Personalized math and reading workbooks for ages 6-12.</p>
        <p className="small" style={{ marginTop: 10 }}>Made in Vancouver, BC · 30-day money-back guarantee · Cancel anytime</p>
        <p className="small" style={{ marginTop: 10 }}>© 2026 {BRAND}</p>
        <nav className="footer-links small" aria-label="Site information">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={SUPPORT_HREF}>Contact us</a>
          <CookieSettingsButton />
        </nav>
      </div>
    </footer>
  );
}

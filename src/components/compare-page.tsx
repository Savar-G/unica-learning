// /compare (D-114, round r24): Unica beside private tutors, learning centres and online learning platforms.
// Categories only, never a competitor name (D-064). Facts live in src/lib/compare.ts with their sources.
// Uses the site nav and footer, like /our-story.
import { BRAND } from "@/lib/site";
import { COMPARE_FAQ, ONE_BY_ONE } from "@/lib/compare";
import { Eyebrow, Faq as FaqList, Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink, StartNote } from "@/components/start-link";
import { Footer, START_LABEL } from "@/components/sections";
import { CompareLegend } from "./compare";
import { CompareSwitch } from "./compare-switch";
import { Rise } from "./drawn";
import "./compare-page.css";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "What's included", href: "/#inc" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

export function ComparePage() {
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<StartLink className="btn sm" src="compare-nav">Free assessment</StartLink>} />
      <div className="frame">
        <main id="main" className="cmpp">
          <Rise className="cmpp-head">
            <Eyebrow>How we compare</Eyebrow>
            <h1><span className="cmpp-hl">How {BRAND} compares</span> to tutors, learning centres and online learning platforms.</h1>
            <p className="lead">Side by side: how personal each one is, whether there is a plan, what you see about your child&apos;s gaps, how much is on a screen, and what it costs.</p>
            <p className="lead">{BRAND} works alongside school. It follows your child&apos;s curriculum, so practice at home matches class.</p>
            <nav className="cmpp-jump" aria-label="Jump to a comparison">
              {ONE_BY_ONE.map((o) => <a key={o.id} href={`#${o.id}`}>{o.tag}</a>)}
            </nav>
          </Rise>

          <section className="cmpp-part" aria-labelledby="glanceT">
            <h2 className="cmp-kicker" id="glanceT">At a glance</h2>
            <Rise>
              <CompareSwitch labelledBy="glanceT" />
              <CompareLegend marks={["yes", "part", "no"]} />
              <p className="cmpp-src">Prices from public sources, checked October 2026. They vary by tutor, centre and plan.</p>
            </Rise>
          </section>

          <section className="cmpp-part" aria-labelledby="oneT">
            <h2 className="cmp-kicker" id="oneT">One by one</h2>
            {ONE_BY_ONE.map((o) => (
              <Rise className="cmpp-one" id={o.id} key={o.id}>
                <div>
                  <p className="cmpp-tag">{o.tag}</p>
                  <h3>{o.title}</h3>
                  <p className="cmpp-sum">{o.summary}</p>
                </div>
                <div className="cmpp-cols">
                  <List title={o.goodTitle} items={o.good} />
                  <List title={o.hardTitle} items={o.hard} />
                  <List title={`With ${BRAND}`} items={o.us} us />
                </div>
              </Rise>
            ))}
          </section>

          <section className="cmpp-part" aria-labelledby="cmppFaqT">
            <h2 className="cmp-kicker" id="cmppFaqT">Questions parents ask</h2>
            <FaqList items={COMPARE_FAQ} />
          </section>

          <Rise className="cmpp-end">
            <h2>See where your child is, before you choose anything.</h2>
            <p>The math assessment and report are free. Choose a plan after you read it. 30-day money-back guarantee.</p>
            <div>
              <StartLink src="compare">{START_LABEL} <span className="arr">→</span></StartLink>
              <StartNote />
            </div>
          </Rise>
        </main>
        <Footer />
      </div>
      <Motion />
    </div>
  );
}

function List({ title, items, us = false }: { title: string; items: string[]; us?: boolean }) {
  return (
    <div className={`cmpp-col${us ? " us" : ""}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  );
}

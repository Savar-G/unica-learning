"use client";

// PROTOTYPE ONLY (branch site/rewards-prototype): five versions of the /rewards page.
// Question: what should the page that explains the rewards program look like?
// Switch with ?variant=A|B|C|D|E or the bottom bar (← →). Every variant uses rewards-data.tsx.
import { useState } from "react";
import { Eyebrow, Faq, GradientPanel } from "@/ds";
import { BRAND } from "@/lib/site";
import { Rise } from "./drawn";
import {
  BOOK_BONUS, EARN, MONTHLY, PAGES_PER_BOOK, PER_PAGE, PRIZES, PRIZE_ICONS, REDEEM, REWARDS_FAQ, TONE_BG, WEEK_BONUS, fmt, monthsTo, type Prize,
} from "./rewards-data";
import { PrototypeSwitcher, SHOW_PROTOTYPES, useVariant } from "./prototype-switcher";
import "./rewards-prototype.css";

const faqItems = REWARDS_FAQ.map((f) => ({ question: f.question, answer: f.answer }));

function Tile({ p, size = 44 }: { p: Prize; size?: number }) {
  return <i className="rw-tile" style={{ background: TONE_BG[p.tone], width: size, height: size }}>{PRIZE_ICONS[p.icon]}</i>;
}

function Cta({ src, children = "Take free assessment" }: { src: string; children?: string }) {
  return <button className="btn" type="button" data-open data-src={src}>{children} <span className="arr" aria-hidden="true">→</span></button>;
}

function Closing({ src }: { src: string }) {
  return (
    <GradientPanel className="rw-close">
      <h2>Start with the free assessment.</h2>
      <p className="lead">Rewards are part of every {BRAND} plan. Points start with the first page.</p>
      <div className="ctas"><Cta src={src} /></div>
    </GradientPanel>
  );
}

/* A: the classic explainer. Earn, prizes, redeem, FAQ, in that order, one section each. */
function VariantA() {
  return (
    <div className="rw-page rw-pa">
      <Rise className="rw-head">
        <Eyebrow>Rewards</Eyebrow>
        <h1>Every finished page counts.</h1>
        <p className="lead">Your child earns points for the work they finish. They trade the points for prizes they pick: toys, movie tickets, a day at the zoo, even an iPad. You approve every one.</p>
      </Rise>

      <section className="rw-part" aria-labelledby="aEarn">
        <Rise as="h2" id="aEarn">How your child earns points</Rise>
        <div className="rw-pa-earn">
          {EARN.map((e, i) => (
            <Rise key={e.title} d={i * 0.06} className="rw-pa-earn-card">
              <b>{e.pts}</b>
              <h3>{e.title}</h3>
              <p>{e.text}</p>
            </Rise>
          ))}
        </div>
        <p className="rw-note">One subject, 5 days a week, comes to about {MONTHLY} points a month.</p>
      </section>

      <section className="rw-part" aria-labelledby="aPrizes">
        <Rise as="h2" id="aPrizes">What they can earn</Rise>
        <ul className="rw-pa-rows">
          {PRIZES.map((p) => (
            <li key={p.name}>
              <Tile p={p} />
              <div><h3>{p.name}</h3><p>{p.note}</p></div>
              <span className="rw-when">{monthsTo(p.pts)}</span>
              <b>{fmt(p.pts)} <small>points</small></b>
            </li>
          ))}
        </ul>
      </section>

      <section className="rw-part" aria-labelledby="aRedeem">
        <Rise as="h2" id="aRedeem">How a prize gets home</Rise>
        <ol className="rw-steps">
          {REDEEM.map((s, i) => (
            <Rise as="li" key={s.title} d={i * 0.06}><span>{i + 1}</span><h3>{s.title}</h3><p>{s.text}</p></Rise>
          ))}
        </ol>
      </section>

      <section className="rw-part" aria-labelledby="aFaq">
        <Rise as="h2" id="aFaq">Questions</Rise>
        <Faq items={faqItems} />
      </section>
      <Closing src="rewards-a" />
    </div>
  );
}

/* B: a shop window. The prizes lead; earning rules shrink to one line of chips; filter by points. */
const SHELVES = [
  { key: "all", label: "All", test: () => true },
  { key: "soon", label: "Under 1,000", test: (p: Prize) => p.pts < 1000 },
  { key: "mid", label: "1,000 to 3,500", test: (p: Prize) => p.pts >= 1000 && p.pts <= 3500 },
  { key: "big", label: "Big goals", test: (p: Prize) => p.pts > 3500 },
];

function VariantB() {
  const [shelf, setShelf] = useState("all");
  const test = (SHELVES.find((s) => s.key === shelf) ?? SHELVES[0]).test;
  return (
    <div className="rw-page rw-pb">
      <Rise className="rw-pb-head">
        <div>
          <Eyebrow>Rewards</Eyebrow>
          <h1>The {BRAND} rewards shop.</h1>
        </div>
        <ul className="rw-pb-chips" aria-label="How points are earned">
          {EARN.map((e) => <li key={e.title}><b>{e.pts}</b> {e.title.toLowerCase()}</li>)}
        </ul>
      </Rise>

      <div className="rw-pb-shelves" role="tablist" aria-label="Filter prizes by points">
        {SHELVES.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={shelf === s.key} onClick={() => setShelf(s.key)}>{s.label}</button>
        ))}
      </div>

      <ul className="rw-pb-grid">
        {PRIZES.filter(test).map((p) => (
          <li key={p.name}>
            <div className="rw-pb-img" style={{ background: TONE_BG[p.tone] }}>{PRIZE_ICONS[p.icon]}</div>
            <h3>{p.name}</h3>
            <p>{p.note}</p>
            <div className="rw-pb-price"><b>{fmt(p.pts)}</b> points</div>
          </li>
        ))}
      </ul>

      <div className="rw-pb-approve">
        <h2>You approve every prize.</h2>
        <ol>
          {REDEEM.map((s, i) => <li key={s.title}><span>{i + 1}</span><div><b>{s.title}.</b> {s.text}</div></li>)}
        </ol>
      </div>

      <dl className="rw-pb-faq">
        {REWARDS_FAQ.map((f) => <div key={f.question}><dt>{f.question}</dt><dd>{f.answer}</dd></div>)}
      </dl>
      <Closing src="rewards-b" />
    </div>
  );
}

/* C: a path. Points add up month by month; each prize is a stop on the way to the big goal. */
function VariantC() {
  const stops: { pts: number; prizes: Prize[] }[] = [];
  PRIZES.forEach((p) => {
    const s = stops.find((x) => x.pts === p.pts);
    if (s) s.prizes.push(p); else stops.push({ pts: p.pts, prizes: [p] });
  });
  return (
    <div className="rw-page rw-pc">
      <Rise className="rw-head center">
        <Eyebrow>Rewards</Eyebrow>
        <h1>From the first page to the big goal.</h1>
        <p className="lead">Every finished page moves your child along the path. They can stop for a prize at any point, or keep saving for the next one.</p>
      </Rise>

      <Rise className="rw-pc-sum" aria-label={`About ${MONTHLY} points a month`}>
        <div><b>{PAGES_PER_BOOK}</b><span>pages × {PER_PAGE}</span></div>
        <i>+</i>
        <div><b>4</b><span>full weeks × {WEEK_BONUS}</span></div>
        <i>+</i>
        <div><b>1</b><span>finished book × {BOOK_BONUS}</span></div>
        <i>=</i>
        <div className="tot"><b>{MONTHLY}</b><span>points a month</span></div>
      </Rise>

      <ol className="rw-pc-path">
        <li className="start"><span className="rw-pc-dot" /><div className="rw-pc-when">Day 1</div><div className="rw-pc-stop"><h3>The first page</h3><p>+{PER_PAGE} points the moment it is checked.</p></div></li>
        {stops.map((s, i) => (
          <Rise as="li" key={s.pts} d={i * 0.04} className={s.pts > 3500 ? "goal" : undefined}>
            <span className="rw-pc-dot" />
            <div className="rw-pc-when">{monthsTo(s.pts).replace(/^in (\w)/, (_, c: string) => c.toUpperCase())}<small>{fmt(s.pts)} points</small></div>
            <div className="rw-pc-stop">
              {s.prizes.map((p) => (
                <div key={p.name} className="rw-pc-prize"><Tile p={p} size={40} /><div><h3>{p.name}</h3><p>{p.note}</p></div></div>
              ))}
            </div>
          </Rise>
        ))}
      </ol>
      <p className="rw-note center">With Math + Reading, points come from both books, so every stop comes about twice as fast.</p>

      <section className="rw-part" aria-labelledby="cRedeem">
        <h2 id="cRedeem">At each stop</h2>
        <ol className="rw-steps">
          {REDEEM.map((s, i) => <li key={s.title}><span>{i + 1}</span><h3>{s.title}</h3><p>{s.text}</p></li>)}
        </ol>
      </section>
      <section className="rw-part" aria-labelledby="cFaq">
        <h2 id="cFaq">Questions</h2>
        <Faq items={faqItems} />
      </section>
      <Closing src="rewards-c" />
    </div>
  );
}

/* D: a letter to parents. Text first, one narrow column, like /our-story. Prizes are a plain list. */
function VariantD() {
  return (
    <div className="rw-page rw-pd">
      <Rise className="rw-pd-head">
        <Eyebrow>Rewards, for parents</Eyebrow>
        <h1>Why we reward finished work</h1>
      </Rise>
      <Rise className="rw-pd-body" d={0.06}>
        <p>Fifteen minutes on paper is easy for an adult to plan and hard for a seven-year-old to want. So we give your child something to work toward.</p>
        <p>Every page they finish earns points. The points are for the work, not for the score: a hard page that took three tries earns the same as an easy one. Your child saves the points, picks a prize, and you decide if it is a yes.</p>
      </Rise>

      <section className="rw-pd-part" aria-labelledby="dEarn">
        <h2 id="dEarn">What earns points</h2>
        <table className="rw-pd-table">
          <tbody>
            {EARN.map((e) => <tr key={e.title}><th scope="row">{e.title}</th><td>{e.text}</td><td className="n">{e.pts}</td></tr>)}
          </tbody>
        </table>
        <p className="rw-note">That is about {MONTHLY} points a month for one subject, 5 days a week.</p>
      </section>

      <section className="rw-pd-part" aria-labelledby="dCharge">
        <h2 id="dCharge">You stay in charge</h2>
        <p>Nothing is ordered without you. When your child picks a prize in the app, you get a request on your phone. Say yes and we send it: small prizes ride in the next workbook box, tickets and gift cards come by email. Say not yet, and the points wait.</p>
      </section>

      <section className="rw-pd-part" aria-labelledby="dPrizes">
        <h2 id="dPrizes">What they can choose</h2>
        <ul className="rw-pd-list">
          {PRIZES.map((p) => <li key={p.name}><span>{p.name}</span><b>{fmt(p.pts)}</b></li>)}
        </ul>
      </section>

      <section className="rw-pd-part" aria-labelledby="dFaq">
        <h2 id="dFaq">Questions</h2>
        <Faq items={faqItems} />
      </section>
      <Rise className="rw-pd-end"><Cta src="rewards-d" /></Rise>
    </div>
  );
}

/* E: a calculator. The parent sets plan and practice days; the page shows when each prize is in reach. */
function VariantE() {
  const [subjects, setSubjects] = useState(1);
  const [days, setDays] = useState(5);
  const pages = Math.round((PAGES_PER_BOOK * days) / 5);
  const perMonth = subjects * (pages * PER_PAGE + (days === 5 ? WEEK_BONUS * 4 + BOOK_BONUS : 0));
  const sixMonths = PRIZES.filter((p) => p.pts / perMonth <= 6).length;
  return (
    <div className="rw-page rw-pe">
      <Rise className="rw-head">
        <Eyebrow>Rewards</Eyebrow>
        <h1>How fast can your child earn?</h1>
        <p className="lead">Every finished page earns points toward prizes your child picks. Set your plan and practice days to see when each prize is in reach.</p>
      </Rise>

      <div className="rw-pe-calc">
        <div className="rw-pe-ctrl">
          <fieldset>
            <legend>Plan</legend>
            <div className="rw-seg">
              {[1, 2].map((n) => <button key={n} type="button" aria-pressed={subjects === n} onClick={() => setSubjects(n)}>{n === 1 ? "One subject" : "Math + Reading"}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Practice days a week</legend>
            <div className="rw-seg">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n}</button>)}
            </div>
          </fieldset>
          <div className="rw-pe-out">
            <b>{fmt(perMonth)}</b>
            <span>points a month</span>
            <p>{sixMonths} of {PRIZES.length} prizes within 6 months{days < 5 ? ". A full 5-day week adds a streak bonus." : "."}</p>
          </div>
        </div>

        <ul className="rw-pe-bars" aria-live="polite">
          {PRIZES.map((p) => {
            const m = p.pts / perMonth;
            return (
              <li key={p.name} className={m <= 6 ? "near" : undefined}>
                <Tile p={p} size={36} />
                <div className="rw-pe-bar">
                  <div className="rw-pe-label"><h3>{p.name}</h3><span>{fmt(p.pts)} points · {monthsTo(p.pts, perMonth)}</span></div>
                  <div className="rw-pe-track"><i style={{ width: `${Math.min(100, Math.sqrt(m / 36) * 100)}%` }} /></div>
                </div>
              </li>
            );
          })}
          <li className="rw-pe-key"><p className="rw-note">A shorter bar means a closer prize. Prizes within 6 months are highlighted.</p></li>
        </ul>
      </div>

      <section className="rw-part rw-pe-two" aria-label="Earning and approval">
        <div>
          <h2>What earns points</h2>
          <ul className="rw-pe-earn">{EARN.map((e) => <li key={e.title}><b>{e.pts}</b><span><strong>{e.title}.</strong> {e.text}</span></li>)}</ul>
        </div>
        <div>
          <h2>You approve every prize</h2>
          <ol className="rw-pe-earn">{REDEEM.map((s, i) => <li key={s.title}><b>{i + 1}</b><span><strong>{s.title}.</strong> {s.text}</span></li>)}</ol>
        </div>
      </section>
      <section className="rw-part" aria-labelledby="eFaq">
        <h2 id="eFaq">Questions</h2>
        <Faq items={faqItems} />
      </section>
      <Closing src="rewards-e" />
    </div>
  );
}

const VARIANTS = [
  { key: "A", name: "Explainer", C: VariantA },
  { key: "B", name: "Prize shop", C: VariantB },
  { key: "C", name: "Points path", C: VariantC },
  { key: "D", name: "Letter to parents", C: VariantD },
  { key: "E", name: "Calculator", C: VariantE },
];

function Switch() {
  const [key, change] = useVariant(VARIANTS.map((v) => v.key), "A", ".rw");
  const V = (VARIANTS.find((v) => v.key === key) ?? VARIANTS[0]).C;
  return (
    <>
      <V />
      <PrototypeSwitcher variants={VARIANTS} current={key} onChange={change} />
    </>
  );
}

export function RewardsPrototype() {
  return SHOW_PROTOTYPES ? <Switch /> : <VariantA />;
}

"use client";

// PROTOTYPE ONLY (branch site/rewards-prototype): five ways to put rewards in the "What you get each month" grid.
// Question: how does the grid tell parents about rewards and send them to /rewards, without a new section?
// Switch with ?variant=now|A|B|C|D|E or the bottom bar (← →). "now" is the live grid.
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { IncludedCard, Section, SectionHeader, type IconName } from "@/ds";
import emo1 from "@/assets/img/emotion-1.jpg";
import { Knot, Rise, type Vars } from "./drawn";
import { INCLUDED, WHY } from "./sections";
import { PRIZES, PRIZE_ICONS, PER_PAGE, TONE_BG, fmt } from "./rewards-data";
import { PrototypeSwitcher, SHOW_PROTOTYPES, useVariant } from "./prototype-switcher";
import "./rewards-prototype.css";

type Item = [IconName, string, ReactNode, number];
const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

const More = ({ children = "See the rewards" }: { children?: ReactNode }) => (
  <Link href="/rewards" className="rw-more">{children} <span aria-hidden="true">→</span></Link>
);

function Col({ items, first }: { items: Item[]; first?: ReactNode }) {
  return (
    <div className="col">
      {first}
      {items.map(([icon, title, text, delay]) => (
        <IncludedCard key={title} icon={icon} title={title} className="rise" style={d(delay)}>{text}</IncludedCard>
      ))}
    </div>
  );
}

const PHOTO = (
  <div className="ph" style={{ aspectRatio: "3 / 4", borderRadius: 4 }}>
    <Image src={emo1} alt="A boy works on a paper page at his desk" sizes="(min-width: 980px) 300px, 92vw" placeholder="blur" />
  </div>
);

function Grid({ left = INCLUDED[0], right = INCLUDED[1], middle = <Rise>{PHOTO}</Rise>, after, className = "" }: { left?: Item[]; right?: Item[]; middle?: ReactNode; after?: ReactNode; className?: string }) {
  return (
    <Section id="inc" aria-labelledby="incT" className={className}>
      <Knot />
      <Rise>
        <SectionHeader eyebrow="What you get each month" title="Everything your child needs. Nothing they don't." titleId="incT" />
      </Rise>
      <div className="inc">
        <Col items={left} first={<IncludedCard icon="pencil" title={WHY[0][0]} className="rise m-only">{WHY[0][1]}</IncludedCard>} />
        {middle}
        <Col items={right} />
      </div>
      {after}
    </Section>
  );
}

const LINE = "Every finished page earns points. Your child trades them for toys, zoo trips, movie tickets, even an iPad.";

/* A: a seventh card of the same kind, under the photo in the middle column. Quietest. */
function VariantA() {
  return (
    <Grid
      middle={
        <div className="col rw-a-mid">
          <Rise>{PHOTO}</Rise>
          <IncludedCard icon="gift" title="Rewards" className="rise rw-a-card">
            {LINE} <More />
          </IncludedCard>
        </div>
      }
    />
  );
}

/* B: the photo becomes a tall prize tile on the warm gradient, with a short prize ladder. */
function VariantB() {
  const ladder = [PRIZES[0], PRIZES[4], PRIZES[7]];
  return (
    <Grid
      middle={
        <Rise className="rw-b-tile">
          <p className="rw-kicker">Rewards</p>
          <h3>Every page earns points.</h3>
          <ul>
            {ladder.map((p) => (
              <li key={p.name}>
                <i style={{ background: TONE_BG[p.tone] }}>{PRIZE_ICONS[p.icon]}</i>
                <span>{p.name}</span>
                <b>{fmt(p.pts)}</b>
              </li>
            ))}
          </ul>
          <Link href="/rewards" className="btn sm">See all rewards <span className="arr" aria-hidden="true">→</span></Link>
        </Rise>
      }
    />
  );
}

/* C: no new card. One sentence in "Instant answer check" carries a link: the smallest change. */
function VariantC() {
  const right: Item[] = INCLUDED[1].map(([icon, title, text, delay]) =>
    title === "Instant answer check"
      ? [icon, title, <>{text} Every checked page also earns <Link href="/rewards" className="rw-inline">points toward rewards</Link>.</>, delay]
      : [icon, title, text, delay],
  );
  return <Grid right={right} />;
}

/* D: a full-width strip under the grid: the earn rule, a row of prizes, one link. */
function VariantD() {
  return (
    <Grid
      after={
        <Rise className="rw-d-strip">
          <p className="rw-d-pts"><b>+{PER_PAGE}</b><span>points for every finished page</span></p>
          <ul className="rw-d-prizes" aria-label="Some of the rewards">
            {PRIZES.filter((p) => ["toy", "card", "ticket", "paw", "tablet"].includes(p.icon)).map((p) => (
              <li key={p.name} style={{ background: TONE_BG[p.tone] }} title={p.name}>
                {PRIZE_ICONS[p.icon]}<span>{p.name}</span>
              </li>
            ))}
          </ul>
          <More>See all rewards</More>
        </Rise>
      }
    />
  );
}

/* E: the photo stays; a reward sticker is stuck on it, with a caption link under the photo. Playful. */
function VariantE() {
  return (
    <Grid
      middle={
        <Rise className="rw-e-mid">
          <div className="rw-e-photo">
            {PHOTO}
            <span className="rw-e-sticker" aria-hidden="true"><b>+{PER_PAGE}</b>points<br />a page</span>
          </div>
          <p className="rw-e-cap">Finished pages earn points toward toys, trips and more. <More>See the rewards</More></p>
        </Rise>
      }
    />
  );
}

const Now = () => <Grid />;

const VARIANTS = [
  { key: "now", name: "Live grid", C: Now },
  { key: "A", name: "Seventh card", C: VariantA },
  { key: "B", name: "Prize tile", C: VariantB },
  { key: "C", name: "Linked sentence", C: VariantC },
  { key: "D", name: "Strip under the grid", C: VariantD },
  { key: "E", name: "Sticker on the photo", C: VariantE },
];

function Switch() {
  const [key, change] = useVariant(VARIANTS.map((v) => v.key), "A", "#inc");
  const V = (VARIANTS.find((v) => v.key === key) ?? VARIANTS[1]).C;
  return (
    <>
      <V />
      <PrototypeSwitcher variants={VARIANTS} current={key} onChange={change} />
    </>
  );
}

export function IncludedRewardsPrototype() {
  return SHOW_PROTOTYPES ? <Switch /> : <VariantA />;
}

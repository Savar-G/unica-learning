"use client";

// PROTOTYPE ONLY (branch site/rewards-prototype): rewards in the "What you get each month" grid.
// Question: how does the grid answer the parent's doubt "how do you get my child to actually do this?"
// Round 1 kept C (linked sentence) and E (sticker on the photo). Round 2 moves the reward into the
// "Daily practice" card, because rewards are how the daily habit sticks.
// Switch with ?variant=now|C|E|C2|C3|E2|CE or the bottom bar (← →). "now" is the live grid.
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { IncludedCard, Section, SectionHeader, type IconName } from "@/ds";
import emo1 from "@/assets/img/emotion-1.jpg";
import { Knot, Rise, type Vars } from "./drawn";
import { INCLUDED, WHY } from "./sections";
import { PER_PAGE } from "./rewards-data";
import { PrototypeSwitcher, SHOW_PROTOTYPES, useVariant } from "./prototype-switcher";
import "./rewards-prototype.css";

type Item = [IconName, string, ReactNode, number, string?];
const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

const More = ({ children = "See the rewards" }: { children?: ReactNode }) => (
  <Link href="/rewards" className="rw-more">{children} <span aria-hidden="true">→</span></Link>
);

function Col({ items, first }: { items: Item[]; first?: ReactNode }) {
  return (
    <div className="col">
      {first}
      {items.map(([icon, title, text, delay, cls]) => (
        <IncludedCard key={title} icon={icon} title={title} className={`rise ${cls ?? ""}`.trim()} style={d(delay)}>{text}</IncludedCard>
      ))}
    </div>
  );
}

const PHOTO = (
  <div className="ph" style={{ aspectRatio: "3 / 4", borderRadius: 4 }}>
    <Image src={emo1} alt="A boy works on a paper page at his desk" sizes="(min-width: 980px) 300px, 92vw" placeholder="blur" />
  </div>
);

function Grid({ left = INCLUDED[0], right = INCLUDED[1], middle = <Rise>{PHOTO}</Rise> }: { left?: Item[]; right?: Item[]; middle?: ReactNode }) {
  return (
    <Section id="inc" aria-labelledby="incT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="What you get each month" title="Everything your child needs. Nothing they don't." titleId="incT" />
      </Rise>
      <div className="inc">
        <Col items={left} first={<IncludedCard icon="pencil" title={WHY[0][0]} className="rise m-only">{WHY[0][1]}</IncludedCard>} />
        {middle}
        <Col items={right} />
      </div>
    </Section>
  );
}

/** Replace the "Daily practice" card in the left column. */
const withDaily = (title: string, text: ReactNode, cls?: string): Item[] =>
  INCLUDED[0].map((it) => (it[1] === "Daily practice" ? [it[0], title, text, it[3], cls] : it));

function Sticker({ link = false }: { link?: boolean }) {
  const body = <><b>+{PER_PAGE}</b>points<br />a page</>;
  return link
    ? <Link href="/rewards" className="rw-e-sticker" aria-label="See the rewards">{body}</Link>
    : <span className="rw-e-sticker" aria-hidden="true">{body}</span>;
}

/* ---------------------------------------------------------------- round 1 */

/* C: one linked sentence in "Instant answer check". */
function VariantC() {
  const right: Item[] = INCLUDED[1].map(([icon, title, text, delay]) =>
    title === "Instant answer check"
      ? [icon, title, <>{text} Every checked page also earns <Link href="/rewards" className="rw-inline">points toward rewards</Link>.</>, delay]
      : [icon, title, text, delay],
  );
  return <Grid right={right} />;
}

/* E: a reward sticker on the photo, with a caption link. */
function VariantE() {
  return (
    <Grid
      middle={
        <Rise className="rw-e-mid">
          <div className="rw-e-photo">{PHOTO}<Sticker /></div>
          <p className="rw-e-cap">Finished pages earn points toward toys, trips and more. <More>See the rewards</More></p>
        </Rise>
      }
    />
  );
}

/* ---------------------------------------------------------------- round 2 */

/* C2: the reward lives in "Daily practice". Same grey card, one more sentence and a link. Quietest. */
function VariantC2() {
  return (
    <Grid
      left={withDaily(
        "Daily practice, rewarded",
        <>15-20 minutes a day, 5 days a week. Your child earns rewards for every page they finish and every week they keep the habit. <More>See the rewards</More></>,
      )}
    />
  );
}

/* C3: the card asks the parent's question out loud, on a soft orange card so it is found. */
function VariantC3() {
  return (
    <Grid
      left={withDaily(
        "How do we keep them going?",
        <>Rewards. 15-20 minutes a day, 5 days a week, and your child earns points for every finished page and every full week. They trade the points for rewards they pick, like toys, movie tickets or a zoo trip. <More>See the rewards</More></>,
        "rw-hl",
      )}
    />
  );
}

/* E2: E with the habit message in the caption. The grid cards stay as they are. */
function VariantE2() {
  return (
    <Grid
      middle={
        <Rise className="rw-e-mid">
          <div className="rw-e-photo">{PHOTO}<Sticker link /></div>
          <p className="rw-e-cap rw-e-cap-lg">Your child earns rewards as they finish their books and build a daily habit. <More>How rewards work</More></p>
        </Rise>
      }
    />
  );
}

/* CE: C2's card carries the message; the sticker on the photo is the visual hook and links too. */
function VariantCE() {
  return (
    <Grid
      left={withDaily(
        "Daily practice, rewarded",
        <>15-20 minutes a day, 5 days a week. Your child earns rewards for every page they finish and every week they keep the habit. <More>See the rewards</More></>,
      )}
      middle={<Rise className="rw-e-mid"><div className="rw-e-photo">{PHOTO}<Sticker link /></div></Rise>}
    />
  );
}

const Now = () => <Grid />;

const VARIANTS = [
  { key: "now", name: "Live grid", C: Now },
  { key: "C", name: "R1: Linked sentence", C: VariantC },
  { key: "E", name: "R1: Sticker on the photo", C: VariantE },
  { key: "C2", name: "Daily practice, rewarded", C: VariantC2 },
  { key: "C3", name: "How do we keep them going?", C: VariantC3 },
  { key: "E2", name: "Sticker + habit caption", C: VariantE2 },
  { key: "CE", name: "Habit card + sticker", C: VariantCE },
];

function Switch() {
  const [key, change] = useVariant(VARIANTS.map((v) => v.key), "C2", "#inc");
  const V = (VARIANTS.find((v) => v.key === key) ?? VARIANTS[3]).C;
  return (
    <>
      <V />
      <PrototypeSwitcher variants={VARIANTS} current={key} onChange={change} />
    </>
  );
}

export function IncludedRewardsPrototype() {
  return SHOW_PROTOTYPES ? <Switch /> : <VariantC2 />;
}

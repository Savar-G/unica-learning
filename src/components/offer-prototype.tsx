// PROTOTYPE - throwaway. Question: how should the home page show "30% off your first month"?
// Five variants on the real home page (/), switched with ?variant=A..E and the floating bar.
// Visual only: checkout and Stripe still charge CAD 99. Lives on site/first-month-offer-prototype, never main.
import { PLANS } from "@/lib/site";

export const OFFER_VARIANTS = {
  A: "Price card: struck price",
  B: "Announcement bar",
  C: "Hero sticker",
  D: "Coupon stub",
  E: "Charge timeline",
} as const;
export type OfferVariant = keyof typeof OFFER_VARIANTS;

export const isOfferVariant = (v: unknown): v is OfferVariant => typeof v === "string" && Object.hasOwn(OFFER_VARIANTS, v);

const FULL = PLANS.one.price;
const FIRST = (Math.round(FULL * 70) / 100).toFixed(2); // 69.30

const FEATURES = [
  "Free placement assessment",
  "Personalized math workbooks matched to your child's level and gaps, mailed home",
  "Your next book arrives before the current one runs out",
  "Progress reports after every check-in",
  "Delivery included. Cancel anytime",
];

function Cta() {
  return (
    <button className="btn" data-open data-src="price" data-plan="one">
      Choose math <span className="arr">→</span>
    </button>
  );
}

function Features() {
  return <ul>{FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>;
}

/* ---------------------------------------------------------------- hero meta, per variant */

export function heroMeta(v: OfferVariant): string[] {
  if (v === "A") return [`First month CAD ${FIRST}, then CAD ${FULL}/month`, "30-day money-back guarantee", "Cancel anytime"];
  if (v === "C") return [`CAD ${FULL}/month`, "30-day money-back guarantee", "Cancel anytime"];
  if (v === "E") return [`30% off your first month`, `Then CAD ${FULL}/month`, "Cancel anytime"];
  return [`CAD ${FULL}/month`, "30-day money-back guarantee", "Cancel anytime"];
}

/* ---------------------------------------------------------------- B: bar above the nav */

export function OfferBar({ variant }: { variant: OfferVariant }) {
  if (variant !== "B") return null;
  return (
    <div className="op-bar" role="note">
      <span><b>30% off your first month.</b> Your first month of math is CAD {FIRST} instead of CAD {FULL}.</span>
      <button type="button" className="op-bar-link" data-open data-src="offer-bar">Take free assessment <span aria-hidden="true">→</span></button>
    </div>
  );
}

/* ---------------------------------------------------------------- C: sticker on the hero photo */

export function HeroSticker({ variant }: { variant: OfferVariant }) {
  if (variant !== "C") return null;
  return (
    <div className="op-sticker" aria-label={`30% off your first month: CAD ${FIRST}`}>
      <span className="op-sticker-big">30% off</span>
      <span>your first month</span>
    </div>
  );
}

/* ---------------------------------------------------------------- pricing card, per variant */

export function OfferPlan({ variant }: { variant: OfferVariant }) {
  if (variant === "A") {
    return (
      <div className="plan hl op-card">
        <div className="plan-head">
          <span className="op-chip">30% off your first month</span>
          <h3>{PLANS.one.name}</h3>
          <p className="small">{PLANS.one.note}</p>
          <div className="op-was">CAD {FULL}</div>
          <div className="price">CAD {FIRST}<small> first month</small></div>
          <p className="op-then">Then CAD {FULL} a month.</p>
        </div>
        <Features />
        <Cta />
      </div>
    );
  }
  if (variant === "D") {
    return (
      <div className="op-ticket-row">
        <div className="plan hl op-card">
          <div className="plan-head">
            <h3>{PLANS.one.name}</h3>
            <p className="small">{PLANS.one.note}</p>
            <div className="price">CAD {FULL}<small> / month</small></div>
          </div>
          <Features />
          <Cta />
        </div>
        <div className="op-ticket" aria-label="First month offer">
          <span className="op-ticket-k">First month</span>
          <span className="op-ticket-big">30% off</span>
          <span className="op-ticket-price">CAD {FIRST}</span>
          <span className="op-ticket-small">Added for you at checkout. No code needed.</span>
        </div>
      </div>
    );
  }
  if (variant === "E") {
    return (
      <div className="plan hl op-card">
        <div className="plan-head">
          <h3>{PLANS.one.name}</h3>
          <p className="small">{PLANS.one.note}</p>
          <div className="price">CAD {FULL}<small> / month</small></div>
          <ol className="op-steps">
            <Step k="Today" v="CAD 0" t="Free assessment. Add your card." />
            <Step k="First book ships" v={`CAD ${FIRST}`} t="30% off your first month" hot />
            <Step k="Every month after" v={`CAD ${FULL}`} t="Cancel anytime" />
          </ol>
        </div>
        <Features />
        <Cta />
      </div>
    );
  }
  // B and C: the plain card, with one line under the price.
  return (
    <div className="plan hl op-card">
      <div className="plan-head">
        <h3>{PLANS.one.name}</h3>
        <p className="small">{PLANS.one.note}</p>
        <div className="price">CAD {FULL}<small> / month</small></div>
        <p className="op-then"><b>30% off your first month:</b> CAD {FIRST}.</p>
      </div>
      <Features />
      <Cta />
    </div>
  );
}

function Step({ k, v, t, hot = false }: { k: string; v: string; t: string; hot?: boolean }) {
  return (
    <li className={hot ? "is-hot" : undefined}>
      <span className="op-step-k">{k}</span>
      <b>{v}</b>
      <span className="op-step-t">{t}</span>
    </li>
  );
}

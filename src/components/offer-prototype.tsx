// PROTOTYPE - throwaway. Question: how should the home page show "30% off your first month"?
// Round 3 (r17): Savar chose H (red pen correction) but wants it more on brand, e.g. bold black.
// H stays as the reference; H1-H4 restyle it. Round 1 (B-E) is in commit 33ce853; round 2 (A, F-J) in 5385daf.
// Variants on the real home page (/), switched with ?variant= and the floating bar.
// Visual only: checkout and Stripe still charge CAD 99. Lives on site/first-month-offer-prototype, never main.
import { PLANS } from "@/lib/site";

export const OFFER_VARIANTS = {
  H: "Red pen (round 2)",
  H1: "Bold black",
  H2: "Yellow highlighter",
  H3: "Pencil-line strike",
  H4: "Black ink handwriting",
  A: "Struck price (round 1)",
  F: "Two prices side by side",
  G: "Receipt",
  I: "Offer band on the card",
  J: "Offer beside the hero button",
} as const;
export type OfferVariant = keyof typeof OFFER_VARIANTS;

export const isOfferVariant = (v: unknown): v is OfferVariant => typeof v === "string" && Object.hasOwn(OFFER_VARIANTS, v);

const FULL = PLANS.one.price;
const FIRST = (Math.round(FULL * 70) / 100).toFixed(2); // 69.30
const SAVE = (FULL - Number(FIRST)).toFixed(2); // 29.70

const FEATURES = [
  "Free placement assessment",
  "Personalized math workbooks matched to your child's level and gaps, mailed home",
  "Your next book arrives before the current one runs out",
  "Progress reports after every check-in",
  "Delivery included. Cancel anytime",
];

function Cta({ label = "Choose math" }: { label?: string }) {
  return (
    <button className="btn" data-open data-src="price" data-plan="one">
      {label} <span className="arr">→</span>
    </button>
  );
}

function Features() {
  return <ul>{FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>;
}

function Head() {
  return (
    <>
      <h3>{PLANS.one.name}</h3>
      <p className="small">{PLANS.one.note}</p>
    </>
  );
}

/* ---------------------------------------------------------------- hero, per variant */

export function heroMeta(v: OfferVariant): string[] {
  if (v === "J") return ["30-day money-back guarantee", "Delivery included", "Cancel anytime"];
  return [`First month CAD ${FIRST}, then CAD ${FULL}/month`, "30-day money-back guarantee", "Cancel anytime"];
}

/** J: the offer sits under the hero buttons, as a price block. */
export function HeroOffer({ variant }: { variant: OfferVariant }) {
  if (variant !== "J") return null;
  return (
    <div className="op-heroffer">
      <span className="op-heroffer-tag">30% off your first month</span>
      <span className="op-heroffer-row">
        <span className="op-heroffer-price">CAD {FIRST}</span>
        <span className="op-heroffer-was">CAD {FULL}</span>
      </span>
      <span className="op-heroffer-then">for your first month, then CAD {FULL} a month</span>
    </div>
  );
}

/* ---------------------------------------------------------------- pricing card, per variant */

export function OfferPlan({ variant }: { variant: OfferVariant }) {
  if (variant === "F") {
    return (
      <div className="plan hl op-card">
        <div className="plan-head">
          <Head />
          <div className="op-pair">
            <div className="op-pair-now">
              <span className="op-pair-k">First month · 30% off</span>
              <span className="op-pair-v">CAD {FIRST}</span>
            </div>
            <span className="op-pair-arrow" aria-hidden="true">→</span>
            <div>
              <span className="op-pair-k">Every month after</span>
              <span className="op-pair-v is-quiet">CAD {FULL}</span>
            </div>
          </div>
        </div>
        <Features />
        <Cta />
      </div>
    );
  }
  if (variant === "G") {
    return (
      <div className="plan hl op-card">
        <div className="plan-head">
          <Head />
          <div className="op-receipt" aria-label={`First month: CAD ${FIRST}`}>
            <p className="op-receipt-h">Your first month</p>
            <dl>
              <div><dt>Math workbooks</dt><dd>CAD {FULL.toFixed(2)}</dd></div>
              <div><dt>Delivery</dt><dd>CAD 0.00</dd></div>
              <div className="is-off"><dt>30% off your first month</dt><dd>-CAD {SAVE}</dd></div>
              <div className="is-total"><dt>You pay</dt><dd>CAD {FIRST}</dd></div>
            </dl>
            <p className="op-receipt-f">Then CAD {FULL} a month. Cancel anytime.</p>
          </div>
        </div>
        <Features />
        <Cta />
      </div>
    );
  }
  if (variant === "H" || variant === "H4") {
    return (
      <div className="plan hl op-card">
        <div className="plan-head">
          <Head />
          <div className={`op-pen${variant === "H4" ? " is-ink" : ""}`}>
            <div className="price op-pen-old">
              CAD {FULL}
              <svg className="op-pen-strike" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
                <path d="M4 30 C 50 22, 120 16, 196 8" />
              </svg>
            </div>
            <div className="op-pen-new" aria-label={`CAD ${FIRST} for your first month`}>
              <span>{FIRST}</span>
              <small>first month, 30% off!</small>
            </div>
          </div>
          <p className="op-then">Then CAD {FULL} a month.</p>
        </div>
        <Features />
        <Cta />
      </div>
    );
  }
  if (variant === "H1" || variant === "H2" || variant === "H3") {
    const style = { H1: "is-bold", H2: "is-mark", H3: "is-pencil" }[variant];
    return (
      <div className="plan hl op-card">
        <div className="plan-head">
          <Head />
          <div className={`op-ink ${style}`}>
            <div className="op-ink-old">
              CAD {FULL}
              {variant === "H3" && (
                <svg className="op-ink-pencil" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 27 C 40 24, 70 21, 102 19 S 168 13, 197 9" />
                </svg>
              )}
            </div>
            <div className="op-ink-new">
              <span className="op-ink-k">First month · 30% off</span>
              <span className="op-ink-v">{variant === "H2" ? <span className="mark is-in">CAD {FIRST}</span> : <>CAD {FIRST}</>}</span>
            </div>
          </div>
          <p className="op-then">Then CAD {FULL} a month.</p>
        </div>
        <Features />
        <Cta />
      </div>
    );
  }
  if (variant === "I") {
    return (
      <div className="op-band-card">
        <div className="op-band">
          <span className="op-band-big">30% off your first month</span>
          <span className="op-band-small">CAD {FIRST} for month one. Then CAD {FULL} a month.</span>
        </div>
        <div className="plan hl op-card">
          <div className="plan-head">
            <Head />
            <div className="price">CAD {FULL}<small> / month</small></div>
          </div>
          <Features />
          <Cta label="Claim 30% off" />
        </div>
      </div>
    );
  }
  // A and J: struck price.
  return (
    <div className="plan hl op-card">
      <div className="plan-head">
        <span className="op-chip">30% off your first month</span>
        <Head />
        <div className="op-was">CAD {FULL}</div>
        <div className="price">CAD {FIRST}<small> first month</small></div>
        <p className="op-then">Then CAD {FULL} a month.</p>
      </div>
      <Features />
      <Cta />
    </div>
  );
}

"use client";

// PROTOTYPE (throwaway, branch site/maya-side-prototype). Question: where do the sibling price and a referral offer
// sit around the pricing card? Every variant's markup is rendered by Pricing; this sets html[data-pricing] from
// ?pricing= and CSS shows one. Shift + arrow keys (or the upper bar) switch it.
import { useEffect, useState } from "react";
import { PrototypeSwitcher } from "./prototype-switcher";

export const PRICING_VARIANTS = [
  { key: "now", name: "Today: sibling box in the card" },
  { key: "P1", name: "Two boxes under the card" },
  { key: "P2", name: "Both boxes in the card" },
  { key: "P3", name: "Referral banner under the card" },
  { key: "P4", name: "Ways to save list" },
];

export function PricingSwitch() {
  const [v, setV] = useState("now");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("pricing");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prototype: read the URL once after hydration
    if (q && PRICING_VARIANTS.some((x) => x.key === q)) setV(q);
  }, []);
  useEffect(() => { document.documentElement.dataset.pricing = v; }, [v]);
  return <PrototypeSwitcher variants={PRICING_VARIANTS} current={v} onChange={setV} param="pricing" bottom={72} label="Pricing: " />;
}

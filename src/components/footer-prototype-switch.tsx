"use client";

// PROTOTYPE ONLY (branch site/footer-prototype). Shows one server-rendered ending variant at a time.
import { useEffect, type ReactNode } from "react";
import { PrototypeSwitcher, useVariant } from "@/components/prototype-switcher";

export function EndingSwitch({ variants, nodes, fallback }: { variants: { key: string; name: string }[]; nodes: Record<string, ReactNode>; fallback: string }) {
  const [key, setKey] = useVariant(variants.map((v) => v.key), fallback, ".fp-slot");

  // the pencil thread measures its knots on resize; re-measure after the ending changes height
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [key]);

  return (
    <>
      <div className="fp-slot" data-variant={key}>{nodes[key]}</div>
      <PrototypeSwitcher variants={variants} current={key} onChange={setKey} />
    </>
  );
}

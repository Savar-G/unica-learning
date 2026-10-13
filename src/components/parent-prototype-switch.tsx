"use client";

// PROTOTYPE ONLY (branch site/parent-copy-prototype). Shows one server-rendered parent-section variant at a time.
import { useEffect, type ReactNode } from "react";
import { PrototypeSwitcher, useVariant } from "@/components/prototype-switcher";

export function ParentSwitch({ variants, nodes, fallback }: { variants: { key: string; name: string }[]; nodes: Record<string, ReactNode>; fallback: string }) {
  const [key, setKey] = useVariant(variants.map((v) => v.key), fallback, ".pp-slot");

  // the pencil thread measures its knots on resize; re-measure after the section changes height
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [key]);

  return (
    <>
      <div className="pp-slot" data-variant={key}>{nodes[key]}</div>
      <PrototypeSwitcher variants={variants} current={key} onChange={setKey} />
    </>
  );
}

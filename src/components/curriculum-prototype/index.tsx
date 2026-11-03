// PROTOTYPE (throwaway, branch site/curriculum-prototype): six layouts of /curriculum, switched by ?variant=.
// Question: how should the page show the 30 levels so a parent understands them at once? Grade bands lead; levels follow.
// "0" is the live page, for comparison. The page renders this only outside Vercel production.
import { Suspense } from "react";
import { CurriculumPage, CurriculumShell, CurriculumHow, CurriculumEnd } from "@/components/curriculum-page";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { VariantD } from "./variant-d";
import { VariantE } from "./variant-e";
import { VariantF } from "./variant-f";
import "./prototype.css";

const VARIANTS = [
  { key: "0", name: "Live page today", C: null },
  { key: "A", name: "Pick a grade", C: VariantA },
  { key: "B", name: "Three drop-downs", C: VariantB },
  { key: "C", name: "The path", C: VariantC },
  { key: "D", name: "By topic", C: VariantD },
  { key: "E", name: "Three chapters", C: VariantE },
  { key: "F", name: "Search what they learn", C: VariantF },
] as const;

export function CurriculumPrototype({ variant }: { variant: string }) {
  const v = VARIANTS.find((x) => x.key === variant.toUpperCase()) ?? VARIANTS[0];
  const C = v.C;
  return (
    <>
      {C ? (
        // key: remount per variant, so the page's scroll reveals run again on the new content.
        <CurriculumShell key={v.key}><C how={<CurriculumHow />} end={<CurriculumEnd />} /></CurriculumShell>
      ) : <CurriculumPage key="0" />}
      <Suspense><PrototypeSwitcher variants={VARIANTS.map(({ key, name }) => ({ key, name }))} current={v.key} /></Suspense>
    </>
  );
}

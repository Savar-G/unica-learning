// "Help when they're stuck" (D-220, from prototype round C4 on branch site/maya-section-prototype): the header on
// its own lines (title on one line on wide screens, the lead under it), then the silent demo with the list of its
// steps beside it (under it on phones). Naming follows D-172: "AI Teaching Assistant", the name Maya, and no
// "voice call" wording. The video loops muted and starts when it scrolls into view, so the copy says the captions
// show what is said.
import { Section } from "@/ds";
import { Knot, Rise } from "./drawn";
import { GuidanceDemo } from "./guidance-demo";
import "@/ds/styles/guidance.css";

export function Guidance() {
  return (
    <Section id="guidance" aria-labelledby="guidanceT" className="gd">
      <Knot />
      <Rise className="gd-head">
        <p className="eyebrow">Help when they&apos;re stuck</p>
        <h2 id="guidanceT">Meet Maya, our AI Teaching Assistant.</h2>
        <p className="gd-lead">When your child is stuck on a workbook question, they call Maya and talk it through, one step at a time.</p>
      </Rise>
      <Rise>
        <GuidanceDemo />
      </Rise>
    </Section>
  );
}

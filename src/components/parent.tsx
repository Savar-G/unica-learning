// "Your commitment as a parent": four questions a parent asks, after How it works (D-075, variant D of round r9).
// Answers Randy Epp's review (2026-10-09): the page never said what the parent does.
// No parent-minute number and no starter guide in the box: we have neither yet.
import { Section, SectionHeader } from "@/ds";
import { PARENT_QA } from "@/lib/parent";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/parent.css";

export function Parent() {
  return (
    <Section id="parent" aria-labelledby="parentT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="For parents" title="Your commitment as a parent." titleId="parentT" />
      </Rise>
      <ul className="ask">
        {PARENT_QA.map(([q, a], i) => (
          <Rise as="li" key={q} d={(i % 2) * 0.08}>
            <span className="n">0{i + 1}</span>
            <h3>{q}</h3>
            <p>{a}</p>
          </Rise>
        ))}
      </ul>
    </Section>
  );
}

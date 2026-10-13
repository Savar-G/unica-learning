// "For parents": what we take off a busy parent's list (struck out), then what stays with them. After Pricing (D-095).
// D-098 (round r20 C, card C1 of r21) replaces the four question cards of D-075, after Mom's review (2026-10-12):
// busy parents pay a learning centre so they do not have to be involved.
// No parent-minute number: we have no data yet.
import { Section, SectionHeader } from "@/ds";
import { PARENT_LEAD, PARENT_NOT_YOURS, PARENT_NOTE, PARENT_TITLE, PARENT_YOURS } from "@/lib/parent";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/parent.css";

export function Parent() {
  return (
    <Section id="parent" aria-labelledby="parentT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="For parents" title={PARENT_TITLE} titleId="parentT" lead={PARENT_LEAD} />
      </Rise>
      <div className="duty">
        <ul className="duty-off" aria-label="What we do for you">
          {PARENT_NOT_YOURS.map(([job, how], i) => (
            <Rise as="li" key={job} d={i * 0.05}>
              <s>{job}</s>
              <span>{how}</span>
            </Rise>
          ))}
        </ul>
        <Rise className="duty-yours">
          <h3>What stays with you</h3>
          <ul>
            {PARENT_YOURS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>{PARENT_NOTE}</p>
        </Rise>
      </div>
    </Section>
  );
}

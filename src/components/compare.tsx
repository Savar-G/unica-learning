// "How we're different": a comparison table placed before Pricing.
// Every competitor cell is backed by .design/research/competitors-2026-10.md; re-check it before editing.
// Desktop: a real 5-column table, our column on a grainy wash. Under 700px each row stacks into a card
// (explicit table roles keep the semantics when CSS changes the display; see compare.css).
import { Section, SectionHeader } from "@/ds";
import { BRAND, PLANS } from "@/lib/site";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/compare.css";

const COLS = ["Kumon", "Private tutor", "Online practice apps", BRAND];

const ROWS: [string, string, string, string, string][] = [
  ["The material", "A set sequence of worksheets", "Tailored by the tutor", "Practice on a screen", "Matched to your child's level and gaps"],
  ["Adapts to pace and gaps", "Moves up at your child's own pace", "Yes, the tutor adjusts each session", "Yes, on screen", "Every book adapts to how they did"],
  ["Seeing where they're stuck", "Instructor review at the centre; scores in an app", "From the tutor, as they report it", "Reports on screen activity", "Gap report and solutions after every scan"],
  ["Works on paper", "Yes", "Depends", "No, on a screen", "Yes, 15-20 minutes a day"],
  ["Cost", "About $185-$260 per subject / month at Metro Vancouver centres, plus enrolment", "About $40-$100 / hour", "Free to about $20 / month", `From CAD ${PLANS.one.price} / month, delivery included`],
];

export function Compare() {
  return (
    <Section id="compare" aria-labelledby="cmpT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="How we're different" title="Personal like a tutor. Structured like Kumon. Priced like neither." titleId="cmpT" />
      </Rise>
      <Rise className="cmp" d={0.08}>
        <div className="cmp-in">
          <span className="cmp-wash" aria-hidden="true" />
          <table role="table" aria-labelledby="cmpT">
            <colgroup>
              <col className="c-lbl" />
              <col span={3} />
              <col className="c-us" />
            </colgroup>
            <thead role="rowgroup">
              <tr role="row">
                <td role="cell" />
                {COLS.map((c, i) => (
                  <th key={c} role="columnheader" scope="col" className={i === 3 ? "us" : undefined}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {ROWS.map(([label, ...cells]) => (
                <tr key={label} role="row">
                  <th role="rowheader" scope="row">{label}</th>
                  {cells.map((v, i) => (
                    <td key={COLS[i]} role="cell" className={i === 3 ? "us" : undefined}>
                      <span className="cmp-who" aria-hidden="true">{COLS[i]}</span>
                      <span className="val">{v}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Rise>
      <Rise className="cmp-after" d={0.12}>
        <p className="cmp-sticks"><strong>It comes back until it sticks.</strong> A skill your child missed comes back in new forms until they master it.</p>
        <p className="cmp-note">Competitor information from public sources, checked October 2026. Prices vary by centre and tutor.</p>
      </Rise>
    </Section>
  );
}

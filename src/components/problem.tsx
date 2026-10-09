// "The problem" section: one-size-fits-all learning, then the answer. Text only, same grid as .what.
import { BRAND } from "@/lib/site";
import { Eyebrow, Section } from "@/ds";
import { Knot, Rise } from "./drawn";

export function Problem() {
  return (
    <Section id="problem" aria-labelledby="problemT">
      <Knot />
      <div className="what">
        <Rise>
          <Eyebrow>The problem</Eyebrow>
          <h2 id="problemT" style={{ marginTop: 16 }}>Kids aren&apos;t one-size-fits-all. Learning shouldn&apos;t be either.</h2>
        </Rise>
        <Rise d={0.1}>
          <p className="big">
            Schools and standard programs put every student in the same box: the same material, the same pace, the same way of teaching. But kids learn differently, and when the pace is fixed, gaps add up. Miss one foundation and everything built on it gets harder.
          </p>
          <p className="big" style={{ marginTop: 24 }}>
            Your child needs learning built around them: their level, their pace, the way they learn. That&apos;s {BRAND}.
          </p>
        </Rise>
      </div>
    </Section>
  );
}

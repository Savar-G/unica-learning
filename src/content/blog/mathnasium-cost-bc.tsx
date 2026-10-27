// Blog post: /blog/mathnasium-cost-bc
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx. Rules: docs/blog-style.md.
import Link from "next/link";
import type { BlogMeta } from "@/lib/blog";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: BlogMeta = {
  slug: "mathnasium-cost-bc",
  title: "How much does Mathnasium cost in BC? Prices and what to ask",
  description:
    "Mathnasium cost in BC: Mathnasium Canada puts it at about $25-$35 a session, so 2-3 sessions a week is roughly $200-$455 a month. What to ask the centre.",
  category: "Comparing options",
  lead: "BC Mathnasium centres do not print their prices. Mathnasium Canada's own per-session range lets you estimate a month before you call.",
  published: "2026-10-27",
  updated: "2026-10-27",
  faqs: [
    {
      q: "How much is Mathnasium per month in BC?",
      a: "BC centres do not publish a monthly price. Mathnasium Canada says the cost is usually equivalent to $25 to $35 per session, and it recommends 2 to 3 sessions a week. That works out to roughly $200 to $315 a month at 2 sessions a week, and $300 to $455 at 3. Your centre gives the real figure after the free assessment.",
    },
    {
      q: "Does Mathnasium have an enrolment fee?",
      a: "Yes. Mathnasium Canada describes a flat enrolment fee, and BC centres such as North Vancouver describe a one-time enrolment fee plus a monthly membership. The amount is not printed. Some centres run offers on it, for example $100 off at Guildford in Surrey with a 6-month enrolment, until September 30, 2026.",
    },
    {
      q: "Is online Mathnasium cheaper than in person?",
      a: "No, not at the BC centres we checked. Mathnasium of North Vancouver and Mathnasium of Scott Road both say the membership price is the same online, in person or a mix of both.",
    },
    {
      q: "Is Mathnasium cheaper than Kumon?",
      a: "It depends on the centre and how often your child goes. Kumon BC centres listed $180 to $260 per subject per month in October 2026. Mathnasium's own range of $25 to $35 a session gives roughly $200 to $455 a month at 2 to 3 sessions a week. Ask both centres for a written price before you compare.",
    },
    {
      q: "Does Mathnasium need a long-term contract?",
      a: "Mathnasium of Scott Road in Surrey says it has no long-term contracts. Some offers do need a set length, such as the 6-month enrolment for the Guildford back-to-school offer. Ask your centre how much notice it needs before the next monthly charge.",
    },
  ],
  sources: [
    { label: "Mathnasium Canada: Contact us, FAQ \"What does Mathnasium cost?\"", url: "https://www.mathnasium.com/ca/contact-us", accessed: "2026-10-27" },
    { label: "Mathnasium of North Vancouver: centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/northvancouver", accessed: "2026-10-27" },
    { label: "Mathnasium of Scott Road (Surrey): centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/scottroad", accessed: "2026-10-27" },
    { label: "Mathnasium of Richmond BC: centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/richmondbc", accessed: "2026-10-27" },
    { label: "Mathnasium of Guildford: Save $100 this back-to-school season", url: "https://www.mathnasium.com/ca/math-centres/guildford/news/back-school", accessed: "2026-10-27" },
    { label: "Kumon of Vancouver - Marpole: centre page, Pricing and Fees", url: "https://www.kumon.com/vancouver-marpole/aboutcenter", accessed: "2026-10-27" },
    { label: "Kumon of Surrey - Fraser Heights: centre page, Pricing and Fees", url: "https://www.kumon.com/surrey-fraser-heights/aboutcenter", accessed: "2026-10-27" },
    { label: "Sylvan Learning of Surrey & Newton: membership pricing", url: "https://www.sylvanlearning.com/locations/ca/bc/surrey-tutoring/surrey-newton/pricing/", accessed: "2026-10-27" },
  ],
  related: ["/resources/kumon-vs-mathnasium", "/blog/sylvan-vs-kumon", "/resources/kumon-cost-bc", "/resources/tutor-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>Mathnasium Canada says its cost is usually equal to $25-$35 per session.<Cite n={1} /></>,
          <>It recommends 2-3 sessions a week, billed as a flat monthly membership, plus an enrolment fee.<Cite n={1} /><Cite n={2} /></>,
          <>That is roughly $200-$315 a month at 2 sessions a week and $300-$455 at 3 (our estimate from Mathnasium&apos;s range).</>,
          <>BC centre pages do not print a price. You get a quote after the free assessment.<Cite n={4} /></>,
          <>Online and in-person memberships cost the same at the BC centres we checked.<Cite n={2} /><Cite n={3} /></>,
        ]}
      />

      <p>
        If you searched for Mathnasium prices in Vancouver, Surrey or Richmond, you probably found no number. BC Mathnasium centres
        explain how they charge but leave the price for the visit. Mathnasium Canada does give a range per session, and it says how
        often it wants children to come. With those two facts you can estimate a month before you book the assessment.
      </p>

      <Section title="How Mathnasium charges" id="how-it-charges">
        <p>
          Mathnasium works like a gym membership, in its own words: a flat enrolment fee, then regular visits.<Cite n={1} /> BC
          centres describe the same model. North Vancouver lists a flat monthly membership and a one-time enrolment
          fee.<Cite n={2} /> Scott Road in Surrey adds that it has no long-term contracts.<Cite n={3} />
        </p>
        <p>
          Every child starts with a diagnostic assessment. The centre uses it to build a learning plan and a recommended number of
          sessions a week, and Richmond says it sets the plan during the free assessment.<Cite n={2} /><Cite n={4} /> Mathnasium
          teaches math only, from kindergarten to grade 12.<Cite n={3} />
        </p>
      </Section>

      <Section title="What a month of Mathnasium costs in BC" id="monthly-cost">
        <p>
          Mathnasium Canada says the cost is usually equal to $25-$35 per session, and that it varies by program and
          area.<Cite n={1} /> It recommends 2-3 sessions a week: fewer slows progress, it says, and more can tire a
          child out.<Cite n={1} /> A month has 4 to 5 weeks, so here is what that range adds up to:
        </p>
        <DataTable
          caption="Estimated Mathnasium cost per month, from Mathnasium Canada's per-session range"
          columns={["Sessions a week", "Sessions a month", "At $25 a session", "At $35 a session"]}
          rows={[
            ["2", "8-9", "$200-$225", "$280-$315"],
            ["3", "12-13", "$300-$325", "$420-$455"],
          ]}
          note={<>Our arithmetic from the range on Mathnasium Canada&apos;s FAQ, read October 27, 2026.<Cite n={1} /> The enrolment fee comes on top. Your centre&apos;s price can differ.</>}
        />
        <p>
          Centres also run offers. Mathnasium of Guildford in Surrey offered $100 off enrolment until September 30, 2026, with a
          6-month enrolment required.<Cite n={5} /> If a centre offers a discount, ask how long it ties you in.
        </p>
      </Section>

      <Section title="How that compares with Kumon, Sylvan and a tutor" id="compare">
        <DataTable
          caption="Listed BC prices for other options, October 2026"
          columns={["Option", "Price as listed", "How it is billed"]}
          rows={[
            ["Mathnasium (estimate)", "About $200-$455 a month", "Monthly membership, 2-3 sessions a week"],
            ["Kumon, Vancouver - Marpole", "$230-$260 per subject a month", "Monthly, per subject"],
            ["Kumon, Surrey - Fraser Heights", "$180-$200 per subject a month", "Monthly, per subject"],
            ["Sylvan, Surrey & Newton", "$56-$69 a session", "Per session, billed monthly"],
          ]}
          note={<>Sources: Mathnasium Canada<Cite n={1} />, Kumon centre pages<Cite n={6} /><Cite n={7} />, Sylvan centre page<Cite n={8} />. Each centre sets its own price.</>}
        />
        <p>
          Kumon is a different kind of program: short daily worksheets, mostly done at home, with two centre visits a week. Our{" "}
          <Link href="/resources/kumon-vs-mathnasium">Kumon vs Mathnasium guide</Link> compares the methods, and{" "}
          <Link href="/blog/sylvan-vs-kumon">Sylvan vs Kumon</Link> covers Sylvan. For one-on-one help, see{" "}
          <Link href="/resources/tutor-cost-bc">what a tutor costs in BC</Link>.
        </p>
      </Section>

      <AssessmentCta slug="blog-mathnasium-cost-bc">
        Before you pay for a plan, see where your child is. Our free online math assessment shows their math level and gaps.
      </AssessmentCta>

      <Section title="What to ask your Mathnasium centre" id="questions">
        <Callout label="Take this list to the assessment" tone="sun">
          <ul>
            <li>What is the monthly price for the number of sessions you recommend for my child?</li>
            <li>How much is the enrolment fee, and is there an offer on it now? Does the offer need a set number of months?</li>
            <li>How long is each session, and how many children does one instructor work with at a time?</li>
            <li>How much notice do you need before the next monthly charge if we stop?</li>
            <li>Can I see a written price list before I sign?</li>
          </ul>
        </Callout>
        <p>
          Write the answers down for each centre you visit. Prices and offers differ from one centre to the next, even within the
          same city.
        </p>
      </Section>

      <Section title="Is it worth it for your child?" id="worth-it">
        <p>
          That depends on what your child needs. A child who is stuck on one topic may need a few weeks of explanation, not a
          long membership. A child who needs steady practice may do well with something at home. Know your child&apos;s level and
          gaps first, then pick the option and the number of sessions that match.
        </p>
        <p>
          Unica Learning is one home option: a free online math assessment, then paper workbooks made for your child&apos;s level and
          mailed home, with no drive to a centre. See <Link href="/compare">how we compare</Link> with learning centres and
          tutors.
        </p>
      </Section>
    </>
  );
}

// Plain-text summaries for AI assistants and agents: /llms.txt (llmstxt.org) and /pricing.md.
// Facts come from the same constants as the page, so the files cannot drift from it.
import { FAQ } from "@/lib/faq";
import { PARENT_NOT_YOURS, PARENT_NOTE, PARENT_YOURS } from "@/lib/parent";
import { SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";
import { BRAND, FIRST_MONTH_OFF, PLANS, cad, firstMonth } from "@/lib/site";
import { SUPPORT_EMAIL } from "@/lib/contact";

const url = (path: string) => `${SITE_URL}${path}`;

export function pricingMarkdown(): string {
  return `# Pricing - ${BRAND}

Prices are in Canadian dollars. Delivery across Canada is included. There is one plan: math.

## ${PLANS.one.name} (${PLANS.one.note})
- Price: CAD ${PLANS.one.price} per month
- First month: ${FIRST_MONTH_OFF}% off, CAD ${cad(firstMonth(PLANS.one.price))}
- Includes: 2 personalized math workbooks a month, one every two weeks; the parent app (step-by-step help when your child is stuck, instant answer check, progress reports and worked solutions); delivery

## Terms
- The online math assessment is free and comes before any plan or card. Every family in Canada can take the free online math assessment. Start at ${url("/start")}
- After the report, BC families can choose the plan and add a card. Nothing is charged until the first workbook ships. Then the plan is charged monthly until you cancel.
- Families on another provincial curriculum (Alberta, Saskatchewan, Manitoba, Ontario) can join the workbook waitlist after the report, with no card.
- 30-day money-back guarantee, starting on the day of the first payment.
- Cancel anytime. Pause for a week, a month or longer.

More: ${url("/#price")}
`;
}

export function llmsTxt(): string {
  const faq = FAQ.map(({ question, answer }) => `### ${question}\n${answer}`).join("\n\n");
  const guides = RESOURCES.map(({ meta }) => `- [${meta.title}](${url(resourcePath(meta.slug))})`).join("\n");
  return `# ${BRAND}

> A personalized math learning program for children aged 6-12 (grades 1-7) in Canada. Each child gets paper workbooks made for them and adapted after every book. Math is CAD ${PLANS.one.price} a month, with ${FIRST_MONTH_OFF}% off the first month, delivery included.

${BRAND} is made in Vancouver, BC. A free online math assessment, taken on a laptop or tablet, finds each child's math level and gaps; the parent reads the report before choosing a plan. The child then works on paper workbooks for 15-30 minutes a day, 5 days a week; the parent uses a phone app to check answers, get step-by-step help when the child is stuck, and see progress. Every family in Canada can take the free math assessment. Books follow the BC curriculum today; Alberta, Saskatchewan, Manitoba and Ontario are next.

## How it works
1. Assess: your child takes the free math assessment online, on a laptop or tablet. The report shows their math level and gaps. You choose a plan after the report.
2. Deliver: we mail a workbook matched to your child's level and gaps.
3. Practice: your child works on paper for about 15-30 minutes a day, 5 days a week.
4. Scan: take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions.
5. Adapt: based on how they did, we choose and adjust the next workbook: more practice where they are struggling, and moving ahead where they are ready.
6. Repeat: the next book arrives before the current one runs out.

## What it takes from a parent
You do not have to:
${PARENT_NOT_YOURS.map(([job, how]) => `- ${job}. ${how}`).join("\n")}

What stays with you:
${PARENT_YOURS.map((t) => `- ${t}`).join("\n")}

${PARENT_NOTE}

## Who it is for
Parents in Canada with a child aged 6-12 who want math practice on paper, at the child's own level and pace, with little screen time for the child.

## Pricing
- ${PLANS.one.name} (${PLANS.one.note}): CAD ${PLANS.one.price} per month; first month ${FIRST_MONTH_OFF}% off (CAD ${cad(firstMonth(PLANS.one.price))})
- Free online math assessment before you choose a plan. Delivery across Canada included. 30-day money-back guarantee. Cancel anytime.
- Details: ${url("/pricing.md")}

## Pages
- [Home](${url("/")}): what ${BRAND} is, how it works, pricing and FAQ
- [Free math assessment](${url("/start")}): create a parent account and start the free online math assessment
- [Our story](${url("/our-story")}): why we built ${BRAND}
- [How we compare](${url("/compare")}): ${BRAND} side by side with school, private tutors, learning centres and online learning platforms
- [Rewards](${url("/rewards")}): how children earn points for finished pages and full weeks of practice, and trade them for prizes their parent approves
- [Sample report](${url("/sample-report")}): the report a parent gets after the free online math assessment, for a sample Grade 3 child working at a Grade 2 level
- [Pricing](${url("/pricing.md")}): plans and terms in plain text
- [Privacy](${url("/privacy")})
- [Terms](${url("/terms")})

## Guides
- [Guides for BC parents](${url("/resources")}): all guides by topic
${guides}

## FAQ

${faq}

## Contact
${SUPPORT_EMAIL}
`;
}

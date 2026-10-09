// Plain-text summaries for AI assistants and agents: /llms.txt (llmstxt.org) and /pricing.md.
// Facts come from the same constants as the page, so the files cannot drift from it.
import { FAQ } from "@/lib/faq";
import { SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";
import { BRAND, PLANS } from "@/lib/site";
import { SUPPORT_EMAIL } from "@/lib/contact";

const url = (path: string) => `${SITE_URL}${path}`;

export function pricingMarkdown(): string {
  return `# Pricing - ${BRAND}

Prices are in Canadian dollars. Delivery across Canada is included in every plan.

## ${PLANS.one.name} (${PLANS.one.note})
- Price: CAD ${PLANS.one.price} per month
- Includes: free placement assessment; 1 personalized workbook a month, about 20-25 pages; the parent app (step-by-step help when your child is stuck, instant answer check, progress reports and worked solutions); delivery

## ${PLANS.both.name} (${PLANS.both.note})
- Price: CAD ${PLANS.both.price} per month
- Includes: everything in One subject, with a math book and a reading book every cycle and one progress report for both

## Terms
- The placement assessment is free.
- BC families add a card at signup and pay nothing until the first workbook ships. Then the plan is charged monthly until you cancel.
- Families on another provincial curriculum (Alberta, Saskatchewan, Manitoba, Ontario) join a waitlist, with no card.
- 30-day money-back guarantee, starting on the day of the first payment.
- Cancel anytime. Pause for a week, a month or longer.

More: ${url("/#price")}
`;
}

export function llmsTxt(): string {
  const faq = FAQ.map(({ question, answer }) => `### ${question}\n${answer}`).join("\n\n");
  const guides = RESOURCES.map(({ meta }) => `- [${meta.title}](${url(resourcePath(meta.slug))})`).join("\n");
  return `# ${BRAND}

> Personalized math and reading workbooks for children aged 6-12 (grades 1-7) in Canada. Each paper workbook is made for one child, mailed home, and adapted after every book. From CAD ${PLANS.one.price} a month, delivery included.

${BRAND} is made in Vancouver, BC. A free placement assessment on paper finds each child's level and gaps. The child works on paper for 15-20 minutes a day, 5 days a week; the parent uses a phone app to check answers, get step-by-step help when the child is stuck, and see progress. Books follow the BC curriculum today; Alberta, Saskatchewan, Manitoba and Ontario are next.

## How it works
1. Assess: we send a free placement assessment on paper. It finds your child's level and where the gaps are.
2. Deliver: we mail a workbook matched to your child's level and gaps.
3. Practice: your child works on paper for about 15-20 minutes a day, 5 days a week.
4. Scan: take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions.
5. Adapt: based on how they did, we choose and adjust the next workbook: more practice where they are struggling, and moving ahead where they are ready.
6. Repeat: the next book arrives before the current one runs out.

## Who it is for
Parents in Canada with a child aged 6-12 who want math or reading practice on paper, at the child's own level and pace, with little screen time for the child.

## Pricing
- ${PLANS.one.name} (${PLANS.one.note}): CAD ${PLANS.one.price} per month
- ${PLANS.both.name}: CAD ${PLANS.both.price} per month
- Free placement assessment. Delivery across Canada included. 30-day money-back guarantee. Cancel anytime.
- Details: ${url("/pricing.md")}

## Pages
- [Home](${url("/")}): what ${BRAND} is, how it works, pricing and FAQ
- [Our story](${url("/our-story")}): why we built ${BRAND}
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

// Plain-text summaries for AI assistants and agents: /llms.txt (llmstxt.org) and /pricing.md.
// Facts come from the same constants as the page, so the files cannot drift from it.
import { FAQ } from "@/lib/faq";
import { PARENT_NOT_YOURS, PARENT_NOTE, PARENT_YOURS } from "@/lib/parent";
import { SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";
import { blogPath, BLOG_POSTS } from "@/lib/blog";
import { BRAND, PLANS, cad } from "@/lib/site";
import { SUPPORT_EMAIL } from "@/lib/contact";

const url = (path: string) => `${SITE_URL}${path}`;

export function pricingMarkdown(): string {
  return `# Pricing - ${BRAND}

Prices are in Canadian dollars. Delivery across Canada is included. There is one plan: math.

## ${PLANS.one.name} (${PLANS.one.note})
- Price: CAD ${cad(PLANS.one.price)} per month
- First month: free
- Includes: 2 personalized math workbooks a month, one every two weeks; the Unica app for parents to scan finished pages and see progress and for children to talk with the Teaching Assistant when stuck; delivery

## Terms
- The online math assessment is free and comes before any plan or card. Every family in Canada can take the free online math assessment. Start at ${url("/start")}
- After the report, families across Canada can choose the plan and add a card. Nothing is charged when the card is added. The first month is free, starting when the first workbook ships; the monthly price is charged on day 30, then monthly until you cancel.
- Cancel before day 30 and you pay nothing. A reminder email comes 7 days before the first charge, with a link to manage or cancel the plan.
- Cancel anytime. Pause for a week, a month or longer.

More: ${url("/#price")}
`;
}

export function llmsTxt(): string {
  const faq = FAQ.map(({ question, answer }) => `### ${question}\n${answer}`).join("\n\n");
  const guides = RESOURCES.map(({ meta }) => `- [${meta.title}](${url(resourcePath(meta.slug))})`).join("\n");
  const posts = BLOG_POSTS.map(({ meta }) => `- [${meta.title}](${url(blogPath(meta.slug))}): ${meta.published}`).join("\n");
  return `# ${BRAND}

> A personalized math learning program for children aged 5 to 14 (Kindergarten to Grade 9) in Canada. Each child gets paper workbooks made for them and adapted after every book. Math is CAD ${cad(PLANS.one.price)} a month after a free first month, delivery included.

${BRAND} is made in Vancouver, BC. A free online math assessment, taken on a laptop or tablet, finds each child's math level and gaps; the parent reads the report before choosing a plan. The child then works on paper workbooks on their own for 15-30 minutes a day, 5 days a week. The parent uses the app to scan finished pages and see progress. When the child is stuck, they can use the parent's phone to talk with the Teaching Assistant. Families across Canada can sign up for workbooks. Each book is matched to the child's level and gaps; province-specific curriculum alignment is expanding.

## How it works
1. Assess: your child takes the free math assessment online, on a laptop or tablet. The report shows their math level and gaps. You choose a plan after the report.
2. Deliver: we mail a workbook matched to your child's level and gaps.
3. Practice: your child works on paper on their own for about 15-30 minutes a day, 5 days a week.
4. Scan: you scan the finished pages in the Unica app. We mark the work, show you the gaps, and give the solutions.
5. Adapt: based on how they did, we choose and adjust the next workbook: more practice where they are struggling, and moving ahead where they are ready.
6. Repeat: the next book arrives before the current one runs out.

## What it takes from a parent
You do not have to:
${PARENT_NOT_YOURS.map(([job, how]) => `- ${job}. ${how}`).join("\n")}

What stays with you:
${PARENT_YOURS.map((t) => `- ${t}`).join("\n")}

${PARENT_NOTE}

## Who it is for
Parents in Canada with a child aged 5 to 14 who want math practice on paper, at the child's own level and pace, with little screen time for the child.

## Pricing
- ${PLANS.one.name} (${PLANS.one.note}): CAD ${cad(PLANS.one.price)} per month; first month free
- Free online math assessment before you choose a plan. Delivery across Canada included. First month free. Cancel anytime.
- Details: ${url("/pricing.md")}

## Pages
- [Home](${url("/")}): what ${BRAND} is, how it works, pricing and FAQ
- [Free math assessment](${url("/start")}): create a parent account and start the free online math assessment
- [Our story](${url("/our-story")}): why we built ${BRAND}
- [How we compare](${url("/compare")}): ${BRAND} side by side with private tutors, learning centres and online learning platforms
- [Rewards](${url("/rewards")}): how children earn points for finished pages and full weeks of practice, and trade them for prizes their parent approves
- [Sample report](${url("/sample-report")}): the report a parent gets after the free online math assessment, for a sample Grade 3 child working at a Grade 2 level
- [Pricing](${url("/pricing.md")}): plans and terms in plain text
- [Privacy](${url("/privacy")})
- [Terms](${url("/terms")})

## Guides
- [Guides for BC parents](${url("/resources")}): all guides by topic
${guides}

## Blog
- [Blog](${url("/blog")}): posts for parents, newest first
${posts}

## FAQ

${faq}

## Contact
${SUPPORT_EMAIL}
`;
}

// Plain-text summaries for AI assistants and agents: /llms.txt (llmstxt.org) and /pricing.md.
// Facts come from the same constants as the page, so the files cannot drift from it.
import { FAQ } from "@/lib/faq";
import { PARENT_NOT_YOURS, PARENT_NOTE, PARENT_YOURS } from "@/lib/parent";
import { SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";
import { blogPath, BLOG_POSTS } from "@/lib/blog";
import { ADDITIONAL_CHILD_PRICE, BRAND, OFFER_ENDS, PLANS, cad } from "@/lib/site";
import { SUPPORT_EMAIL } from "@/lib/contact";

const url = (path: string) => `${SITE_URL}${path}`;

export function pricingMarkdown(): string {
  return `# Pricing - ${BRAND}

Prices are in Canadian dollars. Delivery across Canada is included. There is one plan: math.

## ${PLANS.one.name} (${PLANS.one.note})
- Price: CAD ${cad(PLANS.one.price)} per month
- First month: free
- Offer ends: ${OFFER_ENDS}
- Each additional child: CAD ${cad(ADDITIONAL_CHILD_PRICE)} per month
- Includes: 2 personalized math workbooks a month, one every two weeks; the Unica website, where parents scan finished pages with a phone and see progress, and where children in Grade 3 and up can chat with the Teaching Assistant; delivery

## Terms
- The online math assessment is free and comes before any plan or card. Every family in Canada can take the free online math assessment. Start at ${url("/start")}
- After the report, BC-curriculum families can choose the plan and add a card. Other curricula can join the workbook waitlist without a card. Nothing is charged when the card is added. The first month is free, starting when the first workbook arrives at your home; the monthly price is charged on day 30, then monthly until you cancel.
- Cancel before day 30 and you pay nothing. A reminder email comes 7 days before the first charge, with a link to manage or cancel the plan.
- Cancel anytime. Once the first workbook arrives, you can pause from your account for up to 8 weeks a year, or contact us to arrange a pause.

More: ${url("/pricing")}
`;
}

export function llmsTxt(): string {
  const faq = FAQ.map(({ question, answer }) => `### ${question}\n${answer}`).join("\n\n");
  const guides = RESOURCES.map(({ meta }) => `- [${meta.title}](${url(resourcePath(meta.slug))})`).join("\n");
  const posts = BLOG_POSTS.map(({ meta }) => `- [${meta.title}](${url(blogPath(meta.slug))}): ${meta.published}`).join("\n");
  return `# ${BRAND}

> A personalized math learning program for children aged 5 to 14 (Kindergarten to Grade 9) in Canada. Each child gets paper workbooks made for them and adapted after every book. Math is CAD ${cad(PLANS.one.price)} a month after a free first month, delivery included.

${BRAND} is made in Vancouver, BC. A free online math assessment, taken on a laptop or tablet, finds each child's math level and gaps. The assessment is open across Canada. BC-curriculum families can choose a plan after the report. Other curricula can join the workbook waitlist without a card. A child on the program works on paper workbooks on their own for 15-30 minutes a day, 5 days a week. The parent scans finished pages with a phone on the Unica website and sees progress on the parent dashboard there; there is nothing to install. Children in Grade 3 and up can type to the Teaching Assistant for help. Each book is matched to the child's level and gaps; province-specific curriculum alignment is expanding.

## How it works
1. Assess: your child takes the free math assessment online, on a laptop or tablet. The report shows their math level and gaps. BC-curriculum families can choose a plan after the report. Other curricula can join the workbook waitlist.
2. Deliver: we mail a workbook matched to your child's level and gaps.
3. Practice: your child works on paper on their own for about 15-30 minutes a day, 5 days a week.
4. Scan: you take a photo of each finished page with your phone, on the Unica website. We mark the work, show you the gaps, and give the solutions.
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
- [Math program pricing](${url("/pricing")}): monthly prices, sibling discount, free first month, payment timing and cancellation
- [How the free assessment works](${url("/math-assessment")}): what it checks, how to start and what the report includes
- [Home](${url("/")}): what ${BRAND} is, how it works, pricing and FAQ
- [Free math assessment](${url("/start")}): create a parent account and start the free online math assessment
- [Our story](${url("/our-story")}): why we built ${BRAND}
- [How we compare](${url("/compare")}): ${BRAND} side by side with private tutors, learning centres and online learning platforms
- [What's included](${url("/whats-included")}): everything a child gets, in the order it happens: the free assessment, the workbook, the AI Teaching Assistant, page scanning, the parent dashboard and the next workbook
- [Curriculum](${url("/curriculum")}): the 30 levels from Kindergarten to Grade 9 and what a child works on at each level
- [Rewards](${url("/rewards")}): how children earn points for finished pages and full weeks of practice, and trade them for prizes their parent approves
- [Sample report](${url("/sample-report")}): the report a parent gets after the free online math assessment, for a sample Grade 3 child working at a Grade 2 level
- [Pricing](${url("/pricing.md")}): plans and terms in plain text
- [Contact](${url("/contact")}): send us a question about the free assessment, plans or your account
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

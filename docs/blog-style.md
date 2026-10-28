# Blog style guide

Every post on `/blog` follows this guide, whether a person or the weekly routine (`docs/blog-automation.md`) writes it. `src/lib/blog.test.ts` checks the rules that a machine can check. The rest is on the writer.

## Who reads it

A parent of a child in Kindergarten to Grade 9, in Canada, most often in BC. Many read English as a second language. They searched a question, for example "my child is struggling with math", "sylvan vs kumon" or "how to teach multiplication". They want the answer, not a sales page.

## What a post is for

1. Answer the search question better than the pages that rank today: more specific, more Canadian, more current, with real numbers.
2. Earn the click to the free online math assessment, once in the middle and once at the end (the layout adds the end).

The post is not an ad. Mention Unica only where it is the honest next step, at most twice in the body, and never in the title or the first paragraph.

## Structure

- **Title (H1, also the SEO title):** the primary search phrase near the start, in the words parents type. 70 characters or fewer (the layout adds " | Unica Learning"). No clickbait, no year unless the post holds prices.
- **Description:** 120-155 characters. Answer the question in brief and name the angle (BC, Canada, a price, a grade).
- **Lead:** one sentence under the H1 that tells the reader what they get.
- **Opening:** a `KeyFacts` box with 3-5 short, concrete lines (numbers, dates, names), then one or two short paragraphs that answer the question directly. A reader who stops here should have their answer.
- **Body:** 4-7 `Section` blocks. Phrase each H2 as the follow-up question a parent asks next. Short paragraphs (2-4 sentences). Bullets for steps and lists. A `DataTable` when the reader compares options, prices or grades. A `Callout` for one practical tip.
- **Middle CTA:** one `AssessmentCta`, after the section where knowing the child's level matters, with one line of text that fits that section.
- **Links:** at least one `Link` to another page on the site (a `/resources` guide, another post, `/compare` or `/sample-report`). List 2-4 of them in `related`.
- **FAQ:** 3-6 questions in `meta.faqs`, taken from "People also ask" and autocomplete phrasing. Plain-text answers of 2-4 sentences that make sense alone (they become FAQPage structured data).
- **Sources:** at least 3 in `meta.sources`, each cited in the body with `<Cite n={...} />`. Prefer the primary source: the BC Ministry of Education, a school district, Statistics Canada, a provider's own price page, a peer-reviewed study. Give each source its accessed date.
- **Length:** 1,200-2,000 words in the body. Longer only when the query needs it (a comparison of many options).

## Voice

- Plain words, short sentences, active voice. "Practice 10 minutes a day", not "Consistent daily engagement is key".
- Concrete beats general: a grade, a topic, a price, a minute count, a BC place name.
- Talk to the parent as "you" and about "your child".
- Write in Canadian English: centre, colour, program, grade 3 (not 3rd grade), math (not maths).
- One idea per paragraph. Cut any sentence that the reader would not miss.
- Never write these filler words and phrases (the test fails on them): delve, tapestry, embark, unlock, unleash, game-changer, elevate, seamless, empower, "navigate the", "in today's", fast-paced, ever-evolving, "it's important to note", "in conclusion", "look no further", "rest assured", plethora, myriad, supercharge, journey, realm, "dive into", "deep dive", crucial, holistic, robust, leverage, cutting-edge, revolutionize.
- No em dashes or en dashes. Use a comma, a colon, a hyphen or a new sentence.
- No rhetorical questions in a row, no "Whether you're X or Y", no "Here's the thing", no closing summary paragraph that repeats the post.

## Facts and claims (binding, from `DESIGN.md`)

- No proof we do not have: no ratings, review counts, family counts, testimonials or outcome percentages for Unica.
- No performance claims for Unica ("improves grades", "proven"). Research claims about learning in general need a cited source and must say what the source found, not more.
- Competitors may be named in blog posts under the `/resources` rule (D-074, extended to `/blog` by D-152): facts from the provider's own pages, cited and dated; prices "as listed in <Month Year>" and "varies by centre"; no disparagement, no claims about anyone's outcomes, no logos or testimonial quotes. When a provider does not publish a price, say so and tell the parent to ask.
- In headlines and kickers, Unica is "a personalized math learning program", not "workbooks". In the body, "workbook" can name what arrives in the mail.
- Facts about Unica come from the site itself (`src/lib/site.ts`, `src/lib/faq.ts`, `/llms.txt`): ages 5 to 14, Kindergarten to Grade 9, a free online math assessment on a laptop or tablet, paper workbooks mailed home, the price and offer on the home page. Never invent a feature.
- Never write "Pagewise".

## Topic choice

Topics come from `docs/blog-topics.md`. A post must not target the main query of an existing `/resources` guide or post; link to that page instead.

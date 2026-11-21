# Facts file: true claims about Unica Learning

Every agent that writes customer-facing words reads this file first: the weekly blog routine, ad copy, social posts, outreach, emails, and any page copy. Use only claims from the tables below. `DESIGN.md` bans claims we cannot prove. This file is the list of claims we can.

## How to use this file

- Take a claim as written. Do not make it stronger. Do not add a number, a date, a guarantee or a result that is not here.
- Each row has a source (a file and line, or a decision number) and the date a person last checked it against the code. A claim that is older than the code it cites must be checked again before use.
- A row marked `unverified: flag state` rests on a feature switch whose production value no agent could read (switches live in Vercel and in the database, and agents have no way to read their values). Do not use such a claim in an ad, an email or outreach until Savar or the Platform lead confirms the switch.
- To use a new claim, add it here first, with its source. Add the source in the same pull request as the copy.
- Money is in Canadian dollars (CAD). The test `src/lib/facts.test.ts` checks the prices, the free month, the pause limit and the contact details in this file against the code, so a price change in `src/lib/site.ts` fails the test until this file matches.

Checked date for every row: 2026-11-14.

## What the product is

| Claim you may use | Source | Checked |
|---|---|---|
| Unica Learning is a personalized math learning program for children aged 5 to 14, Kindergarten to Grade 9, in Canada. | `src/lib/site.ts:48` (HERO), `src/lib/ai-summary.ts:41` | 2026-11-14 |
| In headlines, kickers, ads and social posts, call it "a personalized math learning program". In a blog body, "workbook" may name the paper book that arrives in the mail. | `AGENTS.md` (marketing copy rule), `docs/blog-style.md` | 2026-11-14 |
| Unica mails paper workbooks made for your child. You scan the finished pages with your phone, Unica marks them, and an AI Teaching Assistant helps when your child is stuck. unverified: flag state (`SCAN_PAGES_ENABLED`, `SCAN_MARKING_ENABLED`, `MAYA_CHAT_ENABLED`); use the same conditions as the marking and Maya rows below. The home page already publishes this claim. | `src/lib/site.ts:48` (HERO.lead) | 2026-11-14 |
| The program is for math. Reading is planned for later. | `src/lib/faq.ts:17`, `src/lib/site.ts:11` | 2026-11-14 |
| Unica is made in Vancouver, BC. | `src/lib/ai-summary.ts:43` | 2026-11-14 |
| Unica works alongside school. It does not replace school. | `DESIGN.md` (compare page note, D-114) | 2026-11-14 |

## Ages, grades and curricula

| Claim you may use | Source | Checked |
|---|---|---|
| The program is for Kindergarten to Grade 9, ages 5 to 14. | `src/lib/site.ts:14` (PLANS.one.note) | 2026-11-14 |
| The workbooks follow the British Columbia (BC) curriculum today. | `src/lib/faq.ts:20`, `src/app/(site)/terms/page.tsx:22` | 2026-11-14 |
| The paid program is open to families on the BC curriculum. Families on other curricula can join the workbook waitlist after the report, with no card. | `src/lib/faq.ts:18`, `src/app/(site)/pricing/page.tsx:21` | 2026-11-14 |
| The free assessment is open to families across Canada. | `src/lib/faq.ts:18`, `src/app/(site)/math-assessment/page.tsx` | 2026-11-14 |
| Each book is matched to the child's level and gaps, not only their grade. A child can start behind, at or ahead of their grade. | `src/lib/faq.ts:19`, `src/lib/faq.ts:20` | 2026-11-14 |
| The curriculum has 30 levels built from the BC curriculum, Kindergarten to Grade 9. | `src/lib/curriculum.ts:1` | 2026-11-14 |
| Province-specific alignment is expanding, so the books may not yet cover every topic in a local curriculum. | `src/app/(site)/pricing/page.tsx:52`, `src/lib/faq.ts:20` | 2026-11-14 |

## The free assessment and the report

| Claim you may use | Source | Checked |
|---|---|---|
| The assessment is free and online. No card is needed for the assessment or the report. | `src/app/(site)/math-assessment/page.tsx:21` | 2026-11-14 |
| The child takes it on a laptop or tablet, alone. | `src/app/(site)/math-assessment/page.tsx:21`, `src/lib/faq.ts:18` | 2026-11-14 |
| The questions start at the child's school grade and adapt to their answers. It also checks number facts. | `src/app/(site)/math-assessment/page.tsx:24` | 2026-11-14 |
| It covers numbers and operations, fractions, patterns, and shapes and measurement. | `src/app/(site)/math-assessment/page.tsx:24` | 2026-11-14 |
| The report shows the child's math level and gaps. It arrives by email and stays in the parent's account. | `src/lib/faq.ts:18`, `src/app/(site)/math-assessment/page.tsx:21` | 2026-11-14 |
| A sample report is public at `/sample-report`. | `DESIGN.md:33` (proof the page has), `src/app/(site)/sample-report` | 2026-11-14 |
| A parent can book a free 15-minute results call with a founder. unverified: flag state (`NEXT_PUBLIC_BOOKING_URL` can switch it off). | `src/lib/contact.ts:14` | 2026-11-14 |
| A progress preview on the report says "We can help [Name] reach a grade [n] level by [Month Year]". Code works out the grade and the date from the child's test and the real plan pace. Agents may quote this sentence form for a named child only from the code's number. Agents do not write their own outcome promise. | `DESIGN.md:34` (D-323), `src/lib/progress-preview.ts` | 2026-11-14 |

The child takes the assessment alone, in one sitting (Savar, 2026-11-14). If the child is interrupted, the saved answers wait for them; say "pick up where they left off" only for an interruption, never as a way to split the test.

## Workbooks mailed home

| Claim you may use | Source | Checked |
|---|---|---|
| Each child gets paper workbooks made for them. Each new book is built from how the child did in the last one. | `src/lib/faq.ts:7`, `src/lib/ai-summary.ts:41` | 2026-11-14 |
| The first book starts at the level and gaps the assessment finds. | `src/lib/faq.ts:19`, `src/app/(site)/pricing/page.tsx:32` | 2026-11-14 |
| Two paper workbooks arrive each month. | `src/app/(site)/pricing/page.tsx:33` | 2026-11-14 |
| The books are mailed home. Delivery is included, across Canada. | `src/lib/faq.ts:16`, `src/lib/faq.ts:27` | 2026-11-14 |
| The next book arrives before the current one runs out. | `src/lib/faq.ts:16` | 2026-11-14 |
| A child works on paper, on their own, for about 15 to 30 minutes a day, 5 days a week. | `src/lib/ai-summary.ts:48` | 2026-11-14 |
| Daily practice is screen-free. The assessment is online. The parent scans pages on the Unica website with a phone. Nothing needs to be installed. | `src/lib/faq.ts:15`, `src/lib/ai-summary.ts:43` | 2026-11-14 |
| If a family misses a few days, the next book picks up where the child is. If no new pages arrive, the next book reviews what the child last worked on. | `src/lib/faq.ts:22`, `src/lib/faq.ts:23` | 2026-11-14 |
| If a child is struggling, the next book focuses on the gap with extra practice. | `src/lib/faq.ts:14` | 2026-11-14 |
| Children earn points for every finished workbook page and every full week of practice. They trade the points for prizes the parent approves. | `src/app/(site)/rewards/page.tsx:10` | 2026-11-14 |

Do not promise a delivery date or a delivery time. No source gives one.

## Marking pages and the parent dashboard

| Claim you may use | Source | Checked |
|---|---|---|
| The parent takes a photo of each finished page with a phone, on the Unica website. Unica marks the work, shows the gaps, and gives the solutions. unverified: flag state (`SCAN_PAGES_ENABLED`, `SCAN_MARKING_ENABLED`). The home page already publishes this claim. | `src/lib/site.ts:54` (HERO.lead), `src/lib/faq.ts:6` | 2026-11-14 |
| Answers and solutions appear only after the pages are marked. | `src/lib/faq.ts:7` | 2026-11-14 |
| Steps are written on paper, so Unica sees how the child got there, not only the answer. | `src/lib/faq.ts:7` | 2026-11-14 |
| Marking uses AI to read the handwritten answers, and code checks the numeric answers. The AI marks the pages. A parent does not mark any question. | `src/app/(site)/privacy/page.tsx:38`, `src/lib/ai-summary.ts:49` | 2026-11-14 |
| A parent dashboard on the Unica website shows page scans, answer checks, solutions and progress reports. unverified: flag state (`PARENT_DASHBOARD_ENABLED`; the Progress tab is off). | `src/app/(site)/pricing/page.tsx:35` | 2026-11-14 |

Do not say that a human teacher marks every page. Do not say a parent marks or reviews answers.

## Maya, the AI Teaching Assistant

| Claim you may use | Source | Checked |
|---|---|---|
| Maya is Unica's AI Teaching Assistant. When a child is stuck on a workbook question, Maya helps them work it out, one step at a time. | `.design/decisions.md` D-342, `src/lib/faq.ts:12` | 2026-11-14 |
| Maya starts with hints. She asks the child to try the next step. She can show an easier example on a shared board, and she sends the child back to the page. | `src/lib/faq.ts:7`, `src/lib/faq.ts:12`, D-342 | 2026-11-14 |
| Maya already has the question the child is working on. | `src/lib/faq.ts:12`, D-342 | 2026-11-14 |
| Maya is for Grade 3 and up. | D-341, `src/app/(site)/pricing/page.tsx:38` | 2026-11-14 |
| Maya is an AI, not a person or a teacher, and she can make a mistake. Maya will say when she cannot teach a question yet. | `src/app/(site)/terms/page.tsx:27`, `src/lib/faq.ts:12`, `src/lib/faq.ts:13` | 2026-11-14 |
| A parent reads a notice and agrees before a child's first chat with Maya. | `src/app/(site)/terms/page.tsx:28`, D-251 | 2026-11-14 |
| Typed chat with Maya opens when the family's plan starts, for Grade 3 and up. A child can send up to 60 messages a day. unverified: flag state (`MAYA_CHAT_ENABLED`, and whether any real family has a started plan). | `docs/maya-chat.md`, `src/app/(site)/terms/page.tsx:29` | 2026-11-14 |
| Maya stops the math when a child writes something that suggests they may not be safe. | `src/app/(site)/terms/page.tsx:29` | 2026-11-14 |

Voice calls with Maya are not released to families. See "Never say" below. Do not write that a child "calls" Maya in new copy.

## Price and the free month

| Claim you may use | Source | Checked |
|---|---|---|
| Math is CAD 79.99 a month for the first child. | `src/lib/site.ts:14` (PLANS), `src/lib/subscription-plan.ts` | 2026-11-14 |
| Each additional child is CAD 59.99 a month. | `src/lib/site.ts:19`, D-306, D-324 | 2026-11-14 |
| Delivery is included in every plan. Prices are in Canadian dollars. | `src/app/(site)/pricing/page.tsx:20`, `src/app/(site)/terms/page.tsx:20` | 2026-11-14 |
| The first month is free for 30 days. The 30 days start when the first workbook arrives at the family's home. This is the family's one free window: a sibling who starts inside it shares its end date (fewer than 30 days), and a sibling who starts after it pays at once. | `src/lib/site.ts:28` (TRIAL_DAYS), `src/app/(site)/pricing/page.tsx:45`, D-144 | 2026-11-14 |
| The free first month is a limited-time offer that ends Nov 30. After that date, do not write "first month free" unless `OFFER_ENDS` in `src/lib/site.ts` has moved and this file has moved with it. | `src/lib/site.ts:34` (OFFER_ENDS) | 2026-11-14 |
| On day 30 of the family's free window, Unica charges the monthly price for each child on a plan (a sibling who joined after the window is charged at once). Charges then repeat each month until the parent cancels. | `src/app/(site)/pricing/page.tsx:46`, `src/app/(site)/terms/page.tsx:37` | 2026-11-14 |
| Unica emails the parent 7 days before the first charge, with a link to manage or cancel the plan, when the plan starts with at least 7 days of free time left. | `src/app/(site)/terms/page.tsx:37`, `src/lib/plan-reminder.ts:6`, D-222 | 2026-11-14 |
| Nothing is charged when the parent adds a card. A card is added after the report, only if the family wants to continue. | `src/app/(site)/pricing/page.tsx:45`, `src/lib/faq.ts:25` | 2026-11-14 |
| A sibling who starts inside the family's free window gets only the time that is left in it. A sibling who starts after the window pays at once. | `docs/plan-controls.md` (Family admission, D-306), D-324 | 2026-11-14 |
| Unica Learning costs less than a typical learning centre. BC learning centre pages list about CAD 170 to 220 per subject a month. | `src/lib/faq.ts:9`, `DESIGN.md:41` (D-114) | 2026-11-14 |

Do not write "money-back guarantee". The free month replaced it (`src/lib/site.ts:26`).

## Cancel, pause and delete

| Claim you may use | Source | Checked |
|---|---|---|
| A parent can cancel at any time. The parent signs in and uses the Cancel plan button on the plan page, uses the link in the reminder email, or emails contact@unicalearning.com. | `src/app/(site)/terms/page.tsx:45`, D-222 | 2026-11-14 |
| If a parent cancels during the free first month, the parent pays nothing. A cancellation takes effect at the end of the month the family is in. | `src/app/(site)/terms/page.tsx:45`, D-222 | 2026-11-14 |
| After the first workbook arrives, a parent can pause one child from the account for up to 8 weeks a year. The next book starts where the child left off. | `src/lib/plan-pause.ts:16`, `src/lib/faq.ts:21`, D-247 | 2026-11-14 |
| A parent can delete one child or the whole family from the account. Deleting stops the plans at once. There is no refund for time already paid. A copy of each test without names is kept. | `src/app/(site)/terms/page.tsx:32`, D-247, D-119 | 2026-11-14 |
| A parent can ask Unica to delete the family's data at any time. | `src/lib/faq.ts:24`, `src/app/(site)/terms/page.tsx:34` | 2026-11-14 |

## Referrals

| Claim you may use | Source | Checked |
|---|---|---|
| A family can share its permanent referral code or link. A family that has never paid enters the code before its first payment. It keeps its free month and gets 50% off one paid month for each enrolled child. After that family's first successful nonzero subscription payment, the referring family gets the same benefit. Separate referrals give separate discounted months. Rewards never expire. unverified: flag state (the Stripe webhook events and key permissions that referral payments need must be confirmed live; `docs/referrals.md` says to verify both before release). The pricing page and the FAQ already publish this claim. | `docs/referrals.md`, `src/app/(site)/pricing/page.tsx:28`, `src/lib/faq.ts:5`, `src/app/(site)/terms/page.tsx:39` | 2026-11-14 |

Use the pricing page wording. Keep the full rules on `/terms#referrals`. Do not use referrals in an ad or in outreach until the payment path is confirmed live.

## Privacy and the child's data

| Claim you may use | Source | Checked |
|---|---|---|
| Card details are held by the payment provider. Unica does not store them. | `DESIGN.md:35` | 2026-11-14 |
| Unica uses a child's work to plan the next book and to show progress. Unica does not sell it. A parent can ask for it to be deleted at any time. | `src/lib/faq.ts:24` | 2026-11-14 |
| The signup collects the parent's name, email and password (or Google sign-in), and each child's first name, grade and curriculum. | `DESIGN.md:35` (D-082) | 2026-11-14 |
| A child's drawings are stored privately. The parent and the authorized Unica team can see them after sign-in. | `src/app/(site)/privacy/page.tsx:35`, `DESIGN.md:35` (D-084) | 2026-11-14 |
| A private photo of a finished workbook page loses its location and camera details. Unica does not keep the original camera file. The parent can delete the photo at any time. | `src/app/(site)/privacy/page.tsx:32` | 2026-11-14 |
| Before a family is deleted, a copy of each test is kept without names, contact details, drawings, typed work or free text, and with no link to the family. | `DESIGN.md:35` (D-119) | 2026-11-14 |
| Unica counts visits to public pages with no cookie and no IP address. | `src/app/(site)/privacy/page.tsx:59` | 2026-11-14 |
| Unica does not send account names, email addresses or account identifiers to the AI that reviews a child's work. | `src/app/(site)/privacy/page.tsx:39` | 2026-11-14 |
| Maya's chat and call requests go through LiveKit to the company that runs Maya's AI model. LiveKit says that neither it nor these companies log, store or train on these requests. | `src/app/(site)/privacy/page.tsx` (Companies that help us), LiveKit Inference docs (zero data retention, read 2026-11-20), D-348 | 2026-11-20 |

Name no provider outside `/privacy`. Write "our payment provider" and "an AI service", not the company names.

## Company

| Claim you may use | Source | Checked |
|---|---|---|
| The brand is Unica Learning. | `src/lib/site.ts:2` (BRAND), `src/lib/contact.ts:1` | 2026-11-14 |
| The mailing address is 16557 87A Ave, Surrey, BC V4N 5B2. | `src/lib/contact.ts:3` (MAILING_ADDRESS) | 2026-11-14 |
| The support email is contact@unicalearning.com. The website is unicalearning.com. | `src/lib/contact.ts:7`, `src/lib/contact.ts:6` | 2026-11-14 |
| The founders are Savar and Cedric. Their names go on `/our-story` and on founder-signed emails only, not on the home page. | `src/lib/contact.ts:5` (FOUNDERS_SENDER_NAME), `DESIGN.md:33` (D-060) | 2026-11-14 |
| The company was incorporated as Unica Learning Inc. in November 2026 (federal corporation, effective 2026-11-06). The site and legal pages still say "Unica Learning" with no "Inc.". Use "Unica Learning" in all copy until `/terms` and `/privacy` name the legal entity. | vault note on the incorporation, `src/lib/contact.ts:1` | 2026-11-14 |

## Never say

### Copy rules (binding, from `DESIGN.md`)

- No proof we do not have: no ratings, review counts, family counts, press logos, outcome percentages or testimonials. The one exception is the home page parent reviews strip, with exact words, a role label and no name (D-338). (`DESIGN.md:33`)
- Outcome claims are allowed (D-323) only as the code-computed progress preview. Do not invent a result, a grade gain or a date. (`DESIGN.md:34`)
- Name no competitor brand outside `/resources` and `/blog`. Compare against categories: learning centres, private tutors and online practice apps. Where a competitor is named, cite their own page, give a date, and do not disparage them. (`DESIGN.md:41`, `DESIGN.md:42`, D-064, D-074, D-152)
- Never write "Pagewise". The brand is Unica Learning. (`AGENTS.md`)
- Do not map one curriculum level to one grade. Show a grade only as a rough band. (`src/lib/curriculum.ts:1`)
- Do not write "money-back guarantee". Do not promise a delivery time. Do not call the plan "workbooks" in marketing copy.
- Write in plain language. Name no ticket, decision number, file path or flag in customer words.

### Built in code but not released: do not advertise

Each row below has a feature that exists in the repo and is off, held for approval, or only partly open. Do not write about it as if families have it.

| Feature | Why you must not advertise it | Source |
|---|---|---|
| Voice calls with Maya | `docs/maya-voice.md` says the privacy text and the notice must change and the notice version must rise before the first family call. D-293 puts voice after chat. The FAQ, the hero parent note and `/llms.txt` already say "call Maya" (D-343), and `/terms` also describes voice. Treat voice as unverified: flag state (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and the voice worker). Do not repeat the claim in new copy until Savar confirms it. | `docs/maya-voice.md:140`, D-293, D-336, D-343 |
| Maya chat for every family | Chat opens for a child with a started plan, or for families an admin lists. Test families have it too. unverified: flag state (`MAYA_CHAT_ENABLED`). | `docs/maya-chat.md` |
| Progress tab in the parent dashboard | Off until the skill map review (#194). | `AGENTS.md` (`PROGRESS_TAB_ENABLED`) |
| Parent dashboard for every family | The switch stays off until Savar approves. Today families with an open plan and test families get it. unverified: flag state (`PARENT_DASHBOARD_ENABLED`). | `AGENTS.md`, D-249 |
| Monthly summary email | Off until Savar approves real-parent email. | `AGENTS.md` (`MONTHLY_SUMMARY_EMAIL_ENABLED`) |
| Scan reminder emails | Test-only until the family launch. The privacy page says "when scan reminders become available". | `AGENTS.md` (`WORKBOOK_SCAN_REMINDERS_ENABLED`), `src/app/(site)/privacy/page.tsx:34` |
| Fix mistakes with Maya after a marked page | Stays disabled until S9 and #337 are released. | `DESIGN.md:101` |
| Reading program | Planned for later. Math only today. | `src/lib/faq.ts:17` |
| Workbooks for curricula outside BC | Waitlist only. | `src/lib/faq.ts:18` |
| A first-month discount stacked with the free month for a referred family beyond what the pricing page says | The rules are in the terms. Do not paraphrase them. | `docs/referrals.md` |

## Open conflicts to settle

These are places where the code, the site copy and the decision records disagree. A person must settle them. Agents use the safer reading until then.

1. Voice: settled 2026-11-14. Savar keeps the existing voice copy on the FAQ, the home parent note, `/llms.txt` and `/terms`; do not remove it. Family voice is still not released (#992), so do not add voice to new copy until it is.
2. "One sitting": settled 2026-11-14. Savar says the assessment is done in one sitting. The assessment page line "They can pause and return to their saved answers" describes what happens after an interruption.
3. The free month ends Nov 30 (`OFFER_ENDS`). After that, the FAQ, the terms and every "first month free" line must change together with this file.
4. The legal entity: Unica Learning Inc. exists, but the site still says "Unica Learning". Safer reading: use "Unica Learning".

## Private customer activity (pending hosted setup)

- The new activity implementation records signed-in visits and scanner/Maya attempts only after optional-analytics consent. It links fixed safe labels and owned references to the family. It hides optional records after 90 days and removes up to 10,000 expired records in each daily keepalive run. Service failure or backlog can delay removal. Private team notes are separate, bounded to 2,000 characters and deleted with the linked family or child. Sources: `src/lib/customer-activity.ts`, `src/lib/customer-activity-client.ts`, `src/app/api/account/activity/route.ts`, `supabase/migrations/20261117040357_customer_activity.sql`, `docs/customer-activity.md`. Status on 2026-11-16: implementation only; hosted setup and browser review pending.

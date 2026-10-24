# BC ad test - launch plan (decided with Savar, 2026-10-17)

Measure: cost per finished assessment. A saved card is a customer (CAC shown when one exists).
Budget: CAD 100 total. Meta CAD 60 (two ad sets, CAD 30 lifetime each). Google Search CAD 40 lifetime.
Run: 14 days, starting after PR 1 (ad tracking) merges. Location: British Columbia.
Offer: 30% off the first month (CAD 69.30), then CAD 99 a month. Replaced on 2026-10-24, see Round 2.

## Round 2 (2026-10-24): first month free

The offer changed to the first month free, then CAD 79.99 a month (D-144). Savar paused both platforms. The old ads were paused, because their text named the old offer. The new ads went into the same ad sets and ad groups, with the same audiences and budgets. Round 1 results stay on the paused ads; compare rounds by utm_content, not by date alone.

Round 1 result (2026-10-19 to 2026-10-23): Meta A (photo-led) 25 landing page views at CA$0.43; Meta B (program for one) 14 at CA$0.75; Google 8 clicks for CA$12.04. 0 signups.

Test question: does the free month alone bring clicks, or must parents first see what they get? Both Meta ads use the same photo and layout, and both show the offer. Only the emphasis changes.

Creatives: FigJam board "Personalized Learning, Delivered" (fLyAJsC68ezugsmkH3oRGh), frames "LIVE · Meta A/B · ... feed 1080x1350" and "... story 1080x1920". Exports: ~/Documents/unica-ads-2026-10/free-month/. The story frames keep the top 250 px and the bottom 420 px clear. "Workbooks" was changed to "Practice" in the kicker and the first feature (copy rule: the product is a math learning program).

Meta settings on both new ads: Advantage+ creative, AI images, crop-and-expand, website summaries, website highlights, site links, carousel, video slideshow and related media are off. Website summaries were turned off because Meta's summary still said "30-day guarantee".

| Ad | Final URL |
|---|---|
| Meta A, offer first | https://unicalearning.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=bc-launch-test&utm_content=offer-first |
| Meta B, program first | https://unicalearning.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=bc-launch-test&utm_content=program-first |
| Google, made for your child | same as round 1 with `utm_content=made-for-your-child-free` |
| Google, starts where your child is | same as round 1 with `utm_content=starts-where-free` |

Meta A, "A - offer first (free month)", ad set "A - photo-led", image: offer-led (big "Free", headline "A math learning program made for your child.")
- Primary text: Try a personalized math learning program free for a month. For ages 6-12 in BC. Your child starts with a free online math assessment, and we build their practice from it: real paper, mailed home. First month free, then CAD 79.99 a month. Cancel anytime.
- Headline: First month free
- Description: Then CAD 79.99 a month. Cancel anytime.

Meta B, "B - program first (free month)", ad set "B - program for one", image: program-led (headline "A math program built around your child.", three numbered features, the offer at the bottom)
- Primary text: A math program built around your child, ages 6-12 in BC. It starts with a free online math assessment. Then we mail practice built for their level every two weeks. When they are stuck, they get help out loud on that exact question. Scan a page to see what is right and what to work on. First month free, then CAD 79.99 a month.
- Headline: A math program built around your child
- Description: First month free. Cancel anytime.

Google: 6 new responsive search ads (2 each in Grade help, Tutoring and Alternatives; bulk file ~/Documents/unica-ads-2026-10/google-bulk/7-free-month-ads.csv), copies of round 1 with these changes:
- Headline "First Month 30% Off" is now "First Month Free".
- Headline "30-Day Money-Back Guarantee" is now "Then CAD 79.99 a Month".
- Description "...mail practice on real paper each month." is now "...mail paper practice every 2 weeks."
- Description "First month CAD 69.30 (30% off), then CAD 99 a month. Cancel anytime." is now "First month free, then CAD 79.99 a month. Cancel anytime."
- Description "30-day money-back guarantee. Mailed to your door." is now "Help out loud when your child is stuck. Paper practice mailed to your door."
- Description "30-day money-back guarantee. A personalized math learning program for ages 6-12." is now "Try it free for a month. A personalized math learning program for ages 6-12."

## Links (UTM)

| Ad | Final URL |
|---|---|
| Meta A, photo-led | https://unicalearning.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=bc-launch-test&utm_content=photo-led |
| Meta B, program for one | https://unicalearning.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=bc-launch-test&utm_content=program-for-one |
| Google A, made for your child | https://unicalearning.com/?utm_source=google&utm_medium=cpc&utm_campaign=bc-launch-test&utm_content=made-for-your-child |
| Google B, starts where your child is | https://unicalearning.com/?utm_source=google&utm_medium=cpc&utm_campaign=bc-launch-test&utm_content=starts-where |

## Meta

Campaign: "Unica - BC launch test", objective Traffic, optimization Landing page views (needs the pixel).
Two ad sets, same audience, CAD 30 lifetime each, one ad each:
- Location: British Columbia (people living in). Age 25-54. Advantage+ audience, suggestion: parents with children aged 6-12.
- Placements: Advantage+. Button: Learn more. Images: a-feed.png / a-story.png and b-feed.png / b-story.png.

Ad A (photo-led)
- Primary text: A personalized math learning program for ages 6-12. Your child takes a free online math assessment, and we build a plan from it. Practice on real paper, mailed to your door. First month CAD 69.30 (30% off), then CAD 99 a month. Cancel anytime.
- Headline: Free math assessment for your child

Ad B (program for one)
- Primary text: A program made for one child: yours. It starts with a free online math assessment, so the practice starts where your child is. Real paper, real pencil, mailed home. First month CAD 69.30, then CAD 99 a month. 30-day money-back guarantee.
- Headline: Math practice made for your child

## Google Search

Campaign: "Unica - BC launch test - Search", CAD 40 total (about CAD 2.86 a day), Maximize clicks, max CPC CAD 3.
Networks: Search only (no Display, no search partners). Location: British Columbia, "Presence: people in or regularly in".
Conversions: account_created (Lead), report_open, card_saved (primary).

Ad groups and phrase-match keywords:
- Tutoring: "math tutor vancouver", "math tutor surrey", "math tutor burnaby", "math tutor for kids", "math tutor bc", "elementary math tutor"
- Grade help: "grade 1 math help" through "grade 7 math help", "math help for kids", "math practice for kids"
- Alternatives: "kumon alternative", "kumon cost", "kumon price", "alternative to kumon"
Negative keywords: jobs, job, hiring, free, printable, worksheet pdf, online games, salary, volunteer.
No competitor name appears in ad text (D-064).

Responsive search ad A (made for your child) - headlines (max 30 chars):
Math Program Made for Your Kid | Free Online Math Assessment | Personalized Math Program | Ages 6-12, BC Curriculum | Real Paper, Mailed Home | First Month 30% Off | 30-Day Money-Back Guarantee | Cancel Anytime | A Plan Built From Their Test | Unica Learning
Descriptions (max 90 chars):
- A personalized math learning program for ages 6-12. Start with a free online assessment.
- We build a plan from your child's assessment and mail practice on real paper each month.
- First month CAD 69.30 (30% off), then CAD 99 a month. Cancel anytime.
- 30-day money-back guarantee. Mailed to your door.

Responsive search ad B (starts where your child is) - headlines:
Starts Where Your Child Is | A Program Made for One Child | Free Math Assessment Online | Practice Built for Their Level | Real Paper, Real Pencil | First Month 30% Off | Ages 6-12 in BC | 30-Day Money-Back Guarantee | Mailed to Your Door | Unica Learning
Descriptions:
- Your child takes a free online math assessment. The practice starts where they are.
- Real paper, real pencil, mailed home. A math program made for one child: yours.
- First month CAD 69.30 (30% off), then CAD 99 a month. Cancel anytime.
- 30-day money-back guarantee. A personalized math learning program for ages 6-12.

## Checks
- Day 3: problems only (rejected ads, no spend, broken links).
- Day 7: if one Meta ad clearly leads on cost per landing page view and assessment starts, propose moving the rest of the Meta budget to it (Savar approves).
- Day 14: final report - cost per finished assessment per ad and per platform; CAC if a card was saved.
- At each check: write spend per ad into ad_spend (PR 2).

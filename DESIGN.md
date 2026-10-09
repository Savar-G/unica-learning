# DESIGN.md - unica-learning-landing-page

> Status: v3. Page story and look approved by Savar 2026-10-04 (no objection); hero copy decided (D-024); hero layout C chosen (D-029); option A parked as a draft (D-030). Built from Savar's FigJam board "Personalized Learning, Delivered" (2026-10-03). v3 copy and sections come from Cedric's notes on the "Landing Page V3" section of the same board, with Savar's answers (2026-10-08, D-056 to D-061).
> Last updated: 2026-10-09 (v3; "How we're different" as three panels, D-067)

## Job

**User:** A parent in Canada with a child aged 6-12. They pay for, or have priced, tutoring or a math app, and they worry about screen time.

**Situation:** They arrive from a Product BC Slack post, a Reddit thread or a direct link, usually on a phone, with under a minute of attention.

**Job to be done:** In 15 seconds, know what this is (math and reading workbooks made for their child, mailed home, that adapt from a photo of the finished pages). Feel that it is a real, serious product. Reserve a subscription.

**Success evidence:** Paid reservations from targeted traffic (pass bar in the research doc: 10+). Secondary: a 5-second test where a parent can say "workbooks made for my kid, mailed home, they adapt".

## Scope

**In:** One landing page with a working reserve flow, a mobile assessment button, optional analytics, an "Our story" page (`/our-story`, D-060), and supporting 404, thank-you, privacy, and terms pages (D-054).

**Out:** The product itself, parent dashboard, accounts, and blog.

## Source constraints

- References: Savar's FigJam board (Primer, Ello, Squirrel AI, Outschool) with his notes; see `.design/references.json`.
- Brand: Unica Learning, on every customer-facing page and as the legal name on privacy and terms (D-056). The domain is `unicalearning.com` (bought on Vercel 2026-10-08; www redirects to it; PR #26).
- Offer: math and reading, ages 6-12, delivery across Canada included (D-052). One subject CAD 59 a month; math + reading CAD 99 a month (D-046). Each month: 1 workbook per subject, about 20-25 pages; 15-20 minutes a day, 5 days a week; a photo check-in partway through each book, so the next book ships before the current one ends; a progress report and worked solutions after every check-in (D-061). Books follow the BC curriculum first: BC families add a card at signup and pay nothing until the first workbook ships; every other curriculum joins the waitlist (D-053).
- Real product posture: no "pilot", "beta" or "test" wording (D-012).
- No proof we do not have: no ratings, review counts, family counts, press logos, outcome percentages or testimonials. Until real customer references exist, proof = sample pages, clear price, a free placement assessment, a 30-day money-back guarantee, cancel anytime. No founder names or student status on the home page. The founder story, names and "two students" appear only on `/our-story` (D-060, narrows D-040).
- Comparative and performance claims: Competition Act s.74.01(1)(b) requires an adequate and proper test before a claim about a product's performance. The page makes no research claims; the paper belief is stated as "We believe paper and pencil build stronger learning." (D-039). Never a claim about our results.
- Children's privacy: the booking form collects parent contact details, the selected offer, the child's grade, and the school curriculum. The form does not collect a child's name or completed workbook photos. Card details stay on Stripe.
- Companion app (D-062): parents use a phone app to scan a problem their child is stuck on (step-by-step explanation for the parent), to check answers on a finished page, and for check-ins and progress reports. The child works on paper; the app is for the parent. Screen-time copy says this. The privacy page must say what the app does with photos of the child's work before launch.

## Positioning rules

- Name no competitor brand. Compare against categories only: learning centres, private tutors and online practice apps, in the "How we're different" section (learning centres and private tutors only, D-068), the FAQ "How is this different from a learning centre?" and the `/our-story` letter (D-059, D-064). Keep claims general and true for the category ("About $200+ per subject / month"); sources in `.design/research/competitors-2026-10.md`. Everywhere else, show the difference as what we do: paper, at home, made for one child, it adapts.
- Lead with emotion and a bold claim, but name the product in the line under it. The section right after the hero answers "What is [Brand]?" by naming the problem first: the same box (D-058). Curriculum copy says the books cover the school curriculum at the child's pace and move ahead when ready; province availability lives in the FAQ.
- End on a bold claim: "This is what learning should be like." It carries three lines: "Every child learns differently. Learning should adapt."; "No child should fall behind because the class moved on."; "Personal, on paper, and affordable." (D-057, replaces the D-016 beliefs).
- No learning styles anywhere (D-004), except the hero lead, where Savar chose to name them (D-066).

## Page story

Every section sets up the next one. A single pencil line connects the sections and the loop steps.

1. **Hero (D-029, option C; copy D-066).** Text above one large real photo of a child working at home. Small line: "Math and reading workbooks, ages 6-12". Headline: "Your child isn't a grade level." ("a grade level." in ink with the yellow highlighter). Lead: "Kids in the same grade are at different levels, move at different speeds, and learn in different ways. So every Unica workbook is made for one child: built around their level, pace, and learning style, then printed and mailed home." Buttons "Take free assessment" (D-041, kept by Savar) and "See how it works". Fact line: "From CAD 59/month · 30-day money-back guarantee · Cancel anytime".
2. **What is [Brand]? (D-058).** Full-width heading: "Schools and tutoring programs put every child in the same box." with the yellow highlighter on "the same box." Left: "Same material, same pace, same teaching. Miss [word] and every lesson after it gets harder." (the word rotates through 16 math and reading topics). Right: "Your child needs learning built around them: their level, their pace. That's [Brand]." No grey text. Three rows: math and reading for ages 6-12 (covers the school curriculum at the child's pace and moves ahead when they are ready, so they see new topics before their class does), starts at their level, mailed to your door.
3. **How it works (D-057, D-063).** Six cards in a grid, with no connecting line or animation:
   1. **Assess:** We send a free placement assessment on paper. It finds your child's level and where the gaps are. The parent returns it by photo (D-042).
   2. **Deliver:** We mail a workbook matched to your child's level and gaps.
   3. **Practice:** Your child works on paper for about 15-20 minutes a day.
   4. **Scan:** Take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions so your child can understand what went wrong.
   5. **Adapt:** Based on how they did, we choose and adjust their next workbook: more practice where they're struggling, and moving ahead where they're ready.
   6. **Repeat:** Your next book arrives before the current one runs out, so there's never a gap. Then the loop starts again. In italics: "Struggling with fractions? Your next book focuses on fractions."
4. **Why choose [Brand]?** 3-4 cards that state what we do. No names of alternatives.
5. **What you get each month (D-061, D-062).** Six cards, 3 + 3 around one photo: workbooks (1 per subject, about 20-25 pages), daily practice (15-20 minutes, 5 days a week), delivery before the current book ends, "Stuck? Scan it." (the parent scans the problem in our app and sees every step, explained, so they can walk the child through it), "Instant answer check" (scan a finished page, see what is right in seconds; each scan also helps plan the next book), progress reports and worked solutions in the app.
6. **The emotional banner.** Real photos drift around one centred line: "A workbook made for one child: yours." "No two [Brand] books are the same. Each one starts where your child is, and moves on when they're ready."
7. **Our promise (D-044, D-060).** "Try it with nothing to lose." A nameless line (made in Vancouver by a small team who grew up on paper workbooks), a link "Read why we built it" to `/our-story`, and two cards: 30-day money-back guarantee and fits your family's schedule. The free assessment and cancel anytime are stated in pricing.
8. **How we're different (D-059, D-064, D-067, D-068).** "Personal like a tutor. Structured like a learning centre. Priced like neither." The headline becomes three panels: private tutor ("Personal.", about $40-$100 an hour), learning centre ("Structured.", about $200+ per subject a month) and [Brand] ("Personal and structured.", CAD 59 for one subject a month, delivery included). Each panel has a mono label, a one-word trait, one large price, and one or two sentences of what you get. The two other panels are soft grey with grey prices; ours is white with the featured plan's grainy wash (D-037). On phones the panels stack and ours comes first. No table.
9. **Price and reserve.** Both plan cards are white; Math + Reading stands out with a grainy colour wash rising from the bottom (D-037). No savings badge and no fine print under the cards; the charge timing is stated in checkout. Two plans: one subject CAD 59 a month, math + reading CAD 99 a month, delivery included, cancel anytime, a 30-day money-back guarantee stated once above the cards (D-043, D-057). A BC family adds a card at booking on Stripe's hosted page and is charged nothing. The first month is charged when the first workbook ships, then monthly until they cancel (D-053).
10. **FAQ (D-057).** First: how the work is checked, what if it is not right, how this differs from a learning centre, what if my child struggles a lot. Then: screen time, who it is for, the free assessment, what the books cover, curriculum, breaks, missed days, missed photos, the child's work, why we ask for a card, cancelling, delivery.
11. **Closing claim.** The three lines above, "This is what learning should be like.", then "Take free assessment" and "See pricing".

**Our story page (`/our-story`, D-060).** A letter: "Why we built [Brand]". Cedric's text (two students who grew up on workbooks; learning centres worked but were expensive and one-size-fits-all; tutoring was personal but cost $50-$100 an hour; we built the middle). Founder tiles for Savar Gupta and Cedric Tanafranca (initials until real photos arrive), "What we believe", all four promise cards, the sign-off "Savar and Cedric", and a "Take free assessment" button that opens the booking dialog. Linked from the promise section and the footer; listed in the sitemap.

## Visual language

**Look (warm, D-034):** Polar Signals' system in our own colours, so the page no longer reads like Primer. One white background for the whole page (no alternating bands), so the pencil line runs unbroken (D-036); no grid rails. Cards (steps, what's included, team) are soft grey; colour fields sit in contained panels. Grainy gradient fields (sunflower, peach, sky, mint) behind the hero photo, the emotional section, the "Why choose" cards and the closing. Soft grey cards with a small coloured square on the corner. Square-ish controls (6 px corners). Many real photos of children.

**Typography:** Geist for headlines (light 300, sentence case, tight tracking) and text; Geist Mono for labels, with an orange square marker. In the hero, "Personalized. Delivered." is grey and "Mastered." is ink with the yellow highlighter.

**Delight (Ello):** Micro animations on scroll: a mono word chip that swaps (fractions, reading, long division, new words); photos and workbook pages that drift; cards that lift; sections that rise in; the hero colour field moves slowly.

**Connection (Squirrel AI, Outschool):** An orange pencil line runs down the page margin and draws itself on scroll.

**Imagery:** Real children with real paper workbooks at home. No drawn worksheets, covers, mailers or phone mockups until the real workbook exists (D-045). The hero is one real photo with no floating cards (D-048). Mockups: Unsplash photos (`.design/assets/stock/CREDITS.md`), and AI-generated images only where stock cannot show the product. Launch photos: D4.

**Motion rules:** Motion explains or delights; it never blocks reading. With reduced motion on, the page shows the end states.

## Behavior and states

- The primary action opens the reserve flow: plan, child's grade (1-7), parent name, email, Canadian postal code, school curriculum, then, for the BC curriculum, review and "Add card" on Stripe Checkout in setup mode (card saved, CAD 0 charged). Every other curriculum saves a waitlist entry right after the details step, with no card (D-053).
- States: idle, invalid input, submitting, redirect to Stripe, card status checked on `/thank-you`, card not saved (back at `/?card=cancelled`, with "Add card" to return to the same Stripe page), reserved but Stripe unavailable, waitlist, and save error with retry. Stripe shows card errors on its own page. Completed requests use `/thank-you`.
- Optional analytics records visits and form steps only after explicit acceptance. Rejecting analytics leaves booking available. Analytics does not receive the parent's name, email, postal code, or child's grade. Session recordings and automatic input capture stay off.
- Customer text uses plain language. Public pages have no development notes or draft labels. Provider names appear only in the privacy disclosure, with a plain explanation.
- Privacy and terms identify Unica Learning (D-056) and give savar.gupta1922@gmail.com for support, privacy requests, cancellations and refunds (D-055). Both pages stay out of search results. Never invent a business address.
- The 30-day money-back guarantee starts on the day of the first payment (D-055). State this in the promise, FAQ, booking review, terms and payment-page text.
- The mobile assessment button uses the existing primary button below 700 px. Hide it while the booking dialog or cookie banner is open. Reserve space for it at the end of the page.

## Responsive and accessibility

- Mobile first (375 px), then tablet and desktop (1440 px).
- WCAG 2.2 AA contrast (yellow tiles carry dark text only), visible focus, full keyboard use, alt text that describes the real photo.

## What this is not

- Not mascots, illustrated hills or a cartoon world (Ello's motion yes, its characters no).
- Not dark gradients, glowing app mockups, purple AI palette or sparkle icons.
- Not the round 1 look: muted paper tones and a quiet editorial page.
- Not Primer's system (serif Title Case, hairline grid, flat primary tiles): same industry, too close (D-034).
- Not Polar Signals' own palette or ▲ marker (D-035).
- Not invented proof of any kind.

## Acceptance criteria

- [ ] In a 15-second test, a parent can say what arrives, who it is for and that it adapts.
- [ ] No competitor brand is named; category comparisons stay general and true (D-064).
- [ ] Every research claim has a citation; no claim about our own results.
- [ ] The reserve flow works end to end with all listed states.
- [ ] Rendered evidence at 375, 768 and 1440 px; keyboard pass; reduced-motion pass.

## Open decisions

- D4 Launch photos (own shoot with consent, or keep stock/AI).
- D8/D3 Checkout: BC card saved with Stripe Checkout in setup mode (D-053). Open: how the first month is charged when the first workbook ships (today by hand: a CAD 59 or 99 monthly subscription on the Stripe customer; later a script or webhook).

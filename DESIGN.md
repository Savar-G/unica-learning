# DESIGN.md - ai-workbooks-landing-page

> Status: v3. Page story and look approved by Savar 2026-10-04 (no objection); hero copy decided (D-024); hero layout C chosen (D-029); option A parked as a draft (D-030). Built from Savar's FigJam board "Personalized Learning, Delivered" (2026-10-03). v3 copy and sections come from Cedric's notes on the "Landing Page V3" section of the same board, with Savar's answers (2026-10-08, D-056 to D-061).
> Last updated: 2026-10-08 (v3)

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

## Positioning rules

- Name competitors only in three places: the "How we're different" table, the FAQ entry "How is this different from Kumon?" and the `/our-story` letter (D-059). Every competitor claim needs a dated public source in `.design/research/competitors-2026-10.md`; state facts, not judgments, and say that prices vary by centre. Everywhere else, show the difference as what we do: paper, at home, made for one child, it adapts.
- Lead with emotion and a bold claim, but name the product in the line under it. The problem section comes right after the hero (D-058); the section after it answers "What is [Brand]?" in plain words.
- End on a bold claim: "This is what learning should be like." It carries three lines: "Every child learns differently. Learning should adapt."; "No child should fall behind because the class moved on."; "Personal, on paper, and affordable." (D-057, replaces the D-016 beliefs).
- No learning styles anywhere (D-004).

## Page story

Every section sets up the next one. A single pencil line connects the sections and the loop steps.

1. **Hero (D-029, option C; copy D-057).** Text above one large real photo of a child working at home. No small line above the headline. Headline: "Personalized. Delivered. Mastered." Sub-headline: "Same grade. Different levels. Different pace." Lead: "Personalized math and reading workbooks, made for your child and matched to their level and gaps. Mailed home and adapted after every book." Buttons "Take free assessment" (D-041) and "See how it works". Fact line: "Math and reading · Ages 6-12 · From CAD 59/month · 30-day money-back guarantee".
2. **The problem (D-058).** "Kids aren't one-size-fits-all. Learning shouldn't be either." Fixed pace in schools and standard programs lets gaps add up; your child needs learning built around their level and pace. Ends "That's [Brand]."
3. **What is [Brand]?** Math and reading workbooks made for your child, mailed home. Your child works on paper. You snap the finished pages, and the next workbook adapts. Ages 6-12.
4. **How it works (D-057).** A loop where step 6 returns to step 2:
   1. **Assess:** We send a free placement assessment on paper. It finds your child's level and where the gaps are. The parent returns it by photo (D-042).
   2. **Deliver:** We mail a workbook matched to your child's level and gaps.
   3. **Practice:** Your child works on paper for about 15-20 minutes a day.
   4. **Scan:** Take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions so your child can understand what went wrong.
   5. **Adapt:** Based on how they did, we choose and adjust their next workbook: more practice where they're struggling, and moving ahead where they're ready.
   6. **Repeat:** Your next book arrives before the current one runs out, so there's never a gap. Then the loop starts again.
   A short italic note under the steps: "Struggling with fractions? Your next book focuses on fractions."
5. **Why choose [Brand]?** 3-4 cards that state what we do. No names of alternatives.
6. **What you get each month (D-061).** Five cards around one photo: workbooks (1 per subject, about 20-25 pages), daily practice (15-20 minutes, 5 days a week), delivery before the current book ends, photo check-ins partway through each book, progress reports with worked solutions after every check-in.
7. **The emotional banner.** Real photos drift around one centred line: "A workbook made for one child: yours." "No two [Brand] books are the same. Each one starts where your child is, and moves on when they're ready."
8. **Our promise (D-044, D-060).** "Try it with nothing to lose." A nameless line (made in Vancouver by a small team who grew up on paper workbooks), a link "Read why we built it" to `/our-story`, and two cards: 30-day money-back guarantee and fits your family's schedule. The free assessment and cancel anytime are stated in pricing.
9. **How we're different (D-059).** "Personal like a tutor. Structured like Kumon. Priced like neither." A table: Kumon, private tutor, online practice apps and [Brand], by material, adapting, seeing where they're stuck, paper, and cost. Our column carries the colour wash. On phones each row becomes a card. Footnote with the source date; the line "It comes back until it sticks." under the table.
10. **Price and reserve.** Both plan cards are white; Math + Reading stands out with a grainy colour wash rising from the bottom (D-037). No savings badge and no fine print under the cards; the charge timing is stated in checkout. Two plans: one subject CAD 59 a month, math + reading CAD 99 a month, delivery included, cancel anytime, a 30-day money-back guarantee stated once above the cards (D-043, D-057). A BC family adds a card at booking on Stripe's hosted page and is charged nothing. The first month is charged when the first workbook ships, then monthly until they cancel (D-053).
11. **FAQ (D-057).** First: how the work is checked, what if it is not right, how this differs from Kumon, what if my child struggles a lot. Then: screen time, who it is for, the free assessment, what the books cover, curriculum, breaks, missed days, missed photos, the child's work, why we ask for a card, cancelling, delivery.
12. **Closing claim.** The three lines above, "This is what learning should be like.", then "Take free assessment" and "See pricing".

**Our story page (`/our-story`, D-060).** A letter: "Why we built [Brand]". Cedric's text (two students who grew up on workbooks; Kumon worked but was expensive and one-size-fits-all; tutoring was personal but cost $50-$100 an hour; we built the middle). Founder tiles for Savar Gupta and Cedric Tanafranca (initials until real photos arrive), "What we believe", all four promise cards, the sign-off "Savar and Cedric", and a "Take free assessment" button that opens the booking dialog. Linked from the promise section and the footer; listed in the sitemap.

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
- [ ] Competitors are named only where D-059 allows, and every competitor claim has a dated source.
- [ ] Every research claim has a citation; no claim about our own results.
- [ ] The reserve flow works end to end with all listed states.
- [ ] Rendered evidence at 375, 768 and 1440 px; keyboard pass; reduced-motion pass.

## Open decisions

- D4 Launch photos (own shoot with consent, or keep stock/AI).
- D8/D3 Checkout: BC card saved with Stripe Checkout in setup mode (D-053). Open: how the first month is charged when the first workbook ships (today by hand: a CAD 59 or 99 monthly subscription on the Stripe customer; later a script or webhook).

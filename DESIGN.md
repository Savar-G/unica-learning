# DESIGN.md - ai-workbooks-landing-page

> Status: v2. Page story and look approved by Savar 2026-10-04 (no objection); hero copy decided (D-024); hero layout C chosen (D-029); option A parked as a draft (D-030). Built from Savar's FigJam board "Personalized Learning, Delivered" (2026-10-03).
> Last updated: 2026-10-08

## Job

**User:** A parent in Canada with a child aged 6-12. They pay for, or have priced, tutoring or a math app, and they worry about screen time.

**Situation:** They arrive from a Product BC Slack post, a Reddit thread or a direct link, usually on a phone, with under a minute of attention.

**Job to be done:** In 15 seconds, know what this is (math and reading workbooks made for their child, mailed home, that adapt from a photo of the finished pages). Feel that it is a real, serious product. Reserve a subscription.

**Success evidence:** Paid reservations from targeted traffic (pass bar in the research doc: 10+). Secondary: a 5-second test where a parent can say "workbooks made for my kid, mailed home, they adapt".

## Scope

**In:** One landing page with a working reserve flow, a mobile assessment button, optional analytics, and supporting 404, thank-you, privacy, and terms pages (D-054).

**Out:** The product itself, parent dashboard, accounts, and blog.

## Source constraints

- References: Savar's FigJam board (Primer, Ello, Squirrel AI, Outschool) with his notes; see `.design/references.json`.
- Offer: math and reading, ages 6-12, delivery across Canada included (D-052). One subject CAD 59 a month; math + reading CAD 99 a month (D-046). Books follow the BC curriculum first: BC families add a card at signup and pay nothing until the first workbook ships; every other curriculum joins the waitlist (D-053).
- Real product posture: no "pilot", "beta" or "test" wording (D-012).
- No proof we do not have: no ratings, review counts, family counts, press logos, outcome percentages or testimonials. Until real customer references exist, proof = sample pages, clear price, a free placement assessment, a 30-day money-back guarantee, cancel anytime. No founder names or student status anywhere on the site (D-040).
- Comparative and performance claims: Competition Act s.74.01(1)(b) requires an adequate and proper test before a claim about a product's performance. The page makes no research claims; the paper belief is stated as "We believe paper and pencil build stronger learning." (D-039). Never a claim about our results.
- Children's privacy: the booking form collects parent contact details, the selected offer, the child's grade, and the school curriculum. The form does not collect a child's name or completed workbook photos. Card details stay on Stripe.

## Positioning rules

- Never name a competitor or a category of alternative (no Kumon, no "centre tutoring", no "AI apps"). Show the difference as what we do: paper, at home, made for one child, it adapts (D-015).
- Lead with emotion and a bold claim, but name the product in the line under it. The section right after the hero answers "What is [Brand]?" in plain words.
- End on a bold claim: "This is what learning should be like." It carries three beliefs: learning belongs on paper, not on another screen; "We believe paper and pencil build stronger learning"; every child is different, so every workbook is too (D-016).
- No learning styles anywhere (D-004).

## Page story

Every section sets up the next one. A single pencil line connects the sections and the loop steps.

1. **Hero (D-029, option C).** Centred text over one large photo of a child working at home; a marked workbook page and a progress report ("Updated just now") float on the photo. On phones the report sits under the photo and the page is hidden. Small line: "The future of learning is on paper." Headline: "Personalized. Delivered. Mastered." Line under it: "Math and reading workbooks made for your child, mailed home, and adapted after every book." Real children with real workbooks. One primary action ("Take free assessment", D-041) and the line "Ages 6-12 · From CAD 59 a month · Delivery included".
2. **What is [Brand]?** Math and reading workbooks made for your child, mailed home. Your child works on paper. You snap the finished pages, and the next workbook adapts. Ages 6-12.
3. **How it works.** A loop where step 6 returns to step 2. Savar's wording:
   1. **Assess:** We send a free placement assessment on paper; it finds the child's level, strengths, gaps and misconceptions. The parent returns it by photo (D-042).
   2. **Deliver:** We create and mail a physical workbook personalized to what that child needs to work on.
   3. **Practice:** The child spends roughly 15-20 minutes per day working on paper.
   4. **Scan:** A parent takes a photo of the completed work.
   5. **Adapt:** The system analyzes the child's answers and updates their learning profile.
   6. **Repeat:** The next workbook is automatically personalized based on what the child has mastered, struggled with or needs to review.
4. **Why choose [Brand]?** 3-4 cards that state what we do. No names of alternatives.
5. **What's included.** A card grid: the placement test, the personalized workbook by mail ("Your next book arrives before the current one runs out."), the parent progress report ("updated continuously"; it must update after every scan), delivery, cancel anytime.
6. **The emotional section.** Real photos and handwritten workbook pages drift around one centred line about every child learning differently.
7. **Our promise (D-044).** "Try it with nothing to lose." A nameless line (made in Vancouver by a small team who grew up on paper workbooks) beside four cards: 30-day money-back guarantee, free assessment with nothing to pay today, fits your family's schedule (pause anytime, no penalty), cancel anytime. Privacy stays in the FAQ. It replaces the founders' section (D-040).
8. **Price and reserve.** Both plan cards are white; Math + Reading stands out with a grainy colour wash rising from the bottom (D-037). No savings badge and no fine print under the cards; the charge timing is stated in checkout. Two plans: one subject CAD 59 a month, math + reading CAD 99 a month, delivery included, cancel anytime, a 30-day money-back guarantee (D-043). A BC family adds a card at booking on Stripe's hosted page and is charged nothing. The first month is charged when the first workbook ships, then monthly until they cancel (D-053).
9. **FAQ.** Screen time, the free assessment, missed weeks, photos that stop, privacy, the money-back guarantee, cancelling.
10. **Closing claim.** "This is what learning should be like." Then the final "Take free assessment" button.

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
- Privacy and terms are visible drafts until the business contact, retention policy, and cancellation and refund procedures are confirmed. Both drafts stay out of search results. Never invent a business address.
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
- [ ] No competitor or category of alternative is named.
- [ ] Every research claim has a citation; no claim about our own results.
- [ ] The reserve flow works end to end with all listed states.
- [ ] Rendered evidence at 375, 768 and 1440 px; keyboard pass; reduced-motion pass.

## Open decisions

- D4 Launch photos (own shoot with consent, or keep stock/AI).
- D1 Brand name.
- D8/D3 Checkout: BC card saved with Stripe Checkout in setup mode (D-053). Open: how the first month is charged when the first workbook ships (today by hand: a CAD 59 or 99 monthly subscription on the Stripe customer; later a script or webhook).

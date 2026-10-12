# DESIGN.md - unica-learning-landing-page

> Status: v3. Page story and look approved by Savar 2026-10-04 (no objection); hero copy decided (D-024); hero layout C chosen (D-029); option A parked as a draft (D-030). Built from Savar's FigJam board "Personalized Learning, Delivered" (2026-10-03). v3 copy and sections come from Cedric's notes on the "Landing Page V3" section of the same board, with Savar's answers (2026-10-08, D-056 to D-061).
> Last updated: 2026-10-11 (v3; public launch of the free online math assessment, D-093)

## Job

**User:** A parent in Canada with a child aged 6-12. They pay for, or have priced, tutoring or a math app, and they worry about screen time.

**Situation:** They arrive from a Product BC Slack post, a Reddit thread or a direct link, usually on a phone, with under a minute of attention.

**Job to be done:** In 15 seconds, know what this is (math workbooks made for their child, mailed home, that adapt from a photo of the finished pages). Feel that it is a real, serious product. Start the free online math assessment, then choose a plan after the report (D-093).

**Success evidence:** Cards saved after the report, from targeted traffic (pass bar in the research doc: 10+). Secondary: a 5-second test where a parent can say "workbooks made for my kid, mailed home, they adapt".

## Scope

**In:** One landing page whose assessment links open the signup for the free online math assessment (`/start`, D-093), a mobile assessment button, the parent account pages (`/start`, `/sign-in`, `/account`), optional analytics, an "Our story" page (`/our-story`, D-060), a Resources section of SEO guides for BC parents (`/resources`, linked only from the footer, D-073), supporting 404, thank-you, privacy, and terms pages (D-054), the child's assessment test screens (D-083, D-088), and the parent's assessment report in the account and by email (D-084, D-087).

**Out:** The product itself, a parent dashboard beyond the assessment report, and a dated blog or news feed.

## Source constraints

- References: Savar's FigJam board (Primer, Ello, Squirrel AI, Outschool) with his notes; see `.design/references.json`.
- Brand: Unica Learning, on every customer-facing page and as the legal name on privacy and terms (D-056). The domain is `unicalearning.com` (bought on Vercel 2026-10-08; www redirects to it; PR #26).
- Offer: math, ages 6-12, delivery across Canada included (D-052). Reading comes later. For now one plan: math, CAD 99 a month, with 30% off the first month: CAD 69.30 (D-091) (D-090; was one subject CAD 139, math + reading CAD 229, D-046, D-077, D-079). Each month: 1 math workbook, about 20-25 pages; 15-20 minutes a day, 5 days a week; a photo check-in partway through each book, so the next book ships before the current one ends; a progress report and worked solutions after every check-in (D-061). Every family in Canada can take the free online math assessment, before any plan or card (D-081, D-093). Books follow the BC curriculum first: after the report, BC families choose the plan and add a card, and pay nothing until the first workbook ships; every other curriculum joins the workbook waitlist from the report (D-082).
- Real product posture: no "pilot", "beta" or "test" wording (D-012).
- No proof we do not have: no ratings, review counts, family counts, press logos, outcome percentages or testimonials. Until real customer references exist, proof = sample pages, clear price, a free online math assessment, a 30-day money-back guarantee, cancel anytime. No founder names or student status on the home page. The founder story, names and "two students" appear only on `/our-story` (D-060, narrows D-040).
- Comparative and performance claims: Competition Act s.74.01(1)(b) requires an adequate and proper test before a claim about a product's performance. The page makes no research claims; the paper belief is stated as "We believe paper and pencil build stronger learning." (D-039). Never a claim about our results.
- Children's privacy: the signup collects the parent's name, email, postal code and a password (or Google sign-in), and each child's first name, grade and curriculum (D-082). The assessment keeps the child's answers, times, typed work and drawings; drawings stay in private storage (D-084). Card details stay on Stripe. The old booking form (D-053) collected parent contact details, the offer, the child's grade and the curriculum; its records stay.
- Companion app (D-062): parents use a phone app to scan a problem their child is stuck on (step-by-step explanation for the parent), to check answers on a finished page, and for check-ins and progress reports. The child works on paper; the app is for the parent. Screen-time copy says this. The privacy page must say what the app does with photos of the child's work before launch.

## Positioning rules

- Name no competitor brand outside `/resources` (D-074). Compare against categories only: learning centres, private tutors and online practice apps, in the comparison cards under the plans (learning centres and private tutors only, D-068, D-076), the FAQ "How is this different from a learning centre?" and the `/our-story` letter (D-059, D-064). Keep claims general and true for the category ("About $200+ per subject / month"); sources in `.design/research/competitors-2026-10.md`. Everywhere else, show the difference as what we do: paper, at home, made for one child, it adapts.
- `/resources` guides may name competitors (D-074): facts from their own pages, cited and dated; prices "as listed in October 2026" and "varies by centre"; no disparagement, no claims about anyone's outcomes, no logos or testimonial quotes. The no-proof and no-performance-claim rules still apply.
- Say what we sell first, then the problem (D-070). The hero kicker names the product; the headline names the problem: the same box. Curriculum copy says the books cover the school curriculum and move ahead when the child is ready; province availability lives in the FAQ.
- End on a bold claim: "This is what learning should be like." It carries three lines: "Every child learns differently. Learning should adapt."; "No child should fall behind because the class moved on."; "Personal, on paper, and affordable." (D-057, replaces the D-016 beliefs).
- Learning styles may be named (D-070 removes the D-004 ban).

## Page story

Every section sets up the next one. A single pencil line connects the sections and the loop steps.

1. **Hero (D-029, option C; copy D-070).** Text above one large real photo of a child working at home. Kicker (D-092): "A personalized math learning program for ages 6-12." Headline, all in ink: "Schools and tutoring programs put every child in the same box." ("the same box." with the yellow highlighter). Lead: "Same material, same pace. Miss [word] and every lesson after it gets harder. Unica builds each workbook around your child's level, pace and learning style, then mails it home." (the word rotates through 16 math topics, D-092). Buttons "Take free assessment" (D-041, kept by Savar again for the launch, D-093), a link to `/start`, and "See how it works". The nav button stays "Free assessment" and also links to `/start`. Fact line: "First month CAD 69.30, then CAD 99/month · 30-day money-back guarantee · Cancel anytime" (D-090, D-091). No "What is [Brand]?" section; How it works comes next (D-070).
2. **How it works (D-057, D-063).** Six cards in a grid, with no connecting line or animation:
   1. **Assess:** Your child takes the free math assessment online, on a laptop or tablet. The report shows their math level and gaps. You choose a plan after the report (D-081, D-093). Photo: a girl and her mother at a laptop (loop-assess-1, the photo D-042 had replaced with a paper worksheet).
   2. **Deliver:** We mail a workbook matched to your child's level and gaps. It covers your school curriculum.
   3. **Practice:** Your child works on paper for about 15-20 minutes a day, 5 days a week.
   4. **Scan:** Take a photo of the finished pages. We mark the work, show you the gaps, and give the solutions so your child can understand what went wrong.
   5. **Adapt:** Based on how they did, we choose and adjust their next workbook: more practice where they're struggling, and moving ahead where they're ready, so they see new topics before their class does.
   6. **Repeat:** Your next book arrives before the current one runs out, so there's never a gap. Then the loop starts again. In italics: "Struggling with fractions? Your next book focuses on fractions."
3. **Your commitment as a parent (D-075).** Eyebrow "For parents". Four soft grey question cards, 2 x 2, each with a coloured corner square; the question is the large text, the answer two or three sentences: how much of my time it takes (about 15-20 minutes a day, 5 days a week, while the child works; sit with them the first week, then stay nearby and scan the pages), do I need to know how to teach it (no: scan the problem, the app shows every step), how to get started (same time and spot each day; do the first page together), what if they do not want to (keep it short and regular; the book starts at their level; pause if needed). No parent-minute number and no starter guide until both exist. Copy lives in `src/lib/parent.ts` and also feeds `/llms.txt`.
4. **Why choose [Brand]?** 3-4 cards that state what we do. No names of alternatives.
5. **What you get each month (D-061, D-062).** Six cards, 3 + 3 around one photo: workbooks (1 per subject, about 20-25 pages), daily practice (15-20 minutes, 5 days a week), delivery before the current book ends, "Stuck? Scan it." (the parent scans the problem in our app and sees every step, explained, so they can walk the child through it), "Instant answer check" (scan a finished page, see what is right in seconds; each scan also helps plan the next book), progress reports and worked solutions in the app.
6. **The emotional banner.** Real photos drift around one centred line: "A workbook made for one child: yours." "No two [Brand] books are the same. Each one starts where your child is, and moves on when they're ready."
7. **Our promise (D-044, D-060).** "Try it with nothing to lose." A nameless line (made in Vancouver by a small team who grew up on paper workbooks), a link "Read why we built it" to `/our-story`, and two cards: 30-day money-back guarantee and fits your family's schedule. The free assessment and cancel anytime are stated in pricing.
8. **Price and reserve, with how we're different (D-059, D-064, D-076).** Eyebrow "Pricing", headline "Personal like a tutor. Structured like a learning centre. Priced like neither." The page shows price in this one section; there is no separate "How we're different" section. One plan card, Math, full width (name, price and button on the left, features on the right; stacked on phones), with the grainy colour wash rising from the bottom (D-037, D-090). The first-month offer is marked like a teacher's correction (D-091): CAD 99 crossed out with a red pen line, "69.30" handwritten beside it in red (Caveat, the --pen font) with "first month, 30% off!", then "Then CAD 99 a month." No savings badge and no fine print under the cards; the charge timing is stated in checkout. One plan: math, CAD 99 a month (D-090), delivery included, cancel anytime, a 30-day money-back guarantee stated once above the cards (D-043, D-057). The card's first feature is "Free online math assessment and report, before you choose a plan", and its button is "Take free assessment" (D-041), a link to `/start` (D-093). After the report, a BC family adds a card on Stripe's hosted page and is charged nothing. The first month is charged when the first workbook ships, then monthly until they cancel (D-053 timing, D-082). Under the plan cards, three white cards compare [Brand], private tutor and learning centre (in that order). In each card the category name is the heading; the trait is a mono chip under it ("Personal and structured", "Personal", "Structured"); then one large price (CAD 99 for math a month, delivery included; about $40-$100 an hour; about $200+ per subject a month) and one or two sentences of what you get. All text is ink or ink-2, never grey. Our card has a thin gradient bar along its top edge (the D-037 colours) and a black chip; the other two have a clear border and a grey chip. On phones the cards stack and ours comes first. No table.
9. **FAQ (D-057).** First: how the work is checked, what if it is not right, how this differs from a learning centre, what if my child struggles a lot. Then: screen time, who it is for, the free assessment, what the books cover, curriculum, breaks, missed days, missed photos, the child's work, why we ask for a card, cancelling, delivery.
10. **Closing claim and footer (D-080).** One grainy colour field holds the three lines above (white cards), "This is what learning should be like.", "Take free assessment" and "See pricing", and below them the site footer: a white rounded card with the wordmark and tagline, three link columns (Learn: How it works, What you get, Pricing, FAQ; Company: Our story, Rewards, Resources; Help: Contact us, Privacy, Terms) and a mono fine-print row (copyright, made in Vancouver, 30-day money-back guarantee, cancel anytime, cookie settings). No photo strip. Every other page shows the same card in a shorter field, without the claim. The pencil line ends at the top corner of the field.

**Resources (`/resources`, D-073).** A hub ("Guides for BC parents") and one article per guide at `/resources/<slug>`. Content lives in `src/content/resources/<slug>.tsx` (meta + body built from `src/components/article.tsx` blocks); the registry is `src/lib/resources.ts`. Linked only from the site footer, never from the home page body. Each article: breadcrumb, category eyebrow, H1, one-line lead, updated date, key facts, sections, one inline "Take free assessment" panel (a link to `/start`), FAQ (FAQPage data), closing panel, related guides, numbered sources. Hub on phones: the seven grade guides are compact tiles, two per row. Target phrases come from BC search data (`.design/research/seo-demand/`).

**Our story page (`/our-story`, D-060).** A letter: "Why we built [Brand]". Cedric's text (two students who grew up on workbooks; learning centres worked but were expensive and one-size-fits-all; tutoring was personal but cost $50-$100 an hour; we built the middle). Founder tiles for Savar Gupta and Cedric Tanafranca (initials until real photos arrive), "What we believe", all four promise cards, the sign-off "Savar and Cedric", and a "Take free assessment" link to `/start`. Linked from the promise section and the footer; listed in the sitemap.

**Assessment test (the child's screens, D-083, D-088).** Split desk: the question and the answer on the left, the whiteboard on the right, one question per screen. On a laptop or tablet the screen does not scroll (checked at 1440x900, 1024x768 and 768x1024). Every tap target is 44 px or more.
1. Top bar: the wordmark on the left; progress in the middle as one segment per question (24, 36 or 42 by grade band; done in ink, the current one in tangerine), with a ring between the two halves for the break and quick facts; "n of N" on the right.
2. Left pane (soft grey, about 40% of the width): a round blue "read it to me" button beside the question in large text. Below it is the answer: multiple choice as full-width rows with a radio dot (the whole row is the target), or a large answer box with an on-screen number pad (the keyboard also works). Next is at the bottom: white text on the dark button. It stays off until there is an answer, and on a show-your-work question until the board has work.
3. Right pane (about 60%): the whiteboard, always open, full height, on dotted paper. Draw and Type, then pencil, eraser, undo and clear, sit in a side rail. Its label is "My work", with "Show your work for this one" on required questions and "Use it if it helps" on the others. If the child answers a required question without work, the board gets a tangerine outline and the left pane says "Now show your work on the board".
4. Halfway break: the left pane says "Halfway there, [Name]." with "Keep going" and "I am back from my break"; the right pane is a grainy colour field with a slow breathing circle (still with reduced motion).
5. Quick facts (60 seconds): a start screen first. Then the fact is large on the left, with a draining tangerine bar and the time, and a big number pad is on the right. Enter on an empty answer skips the fact. It ends with "Time is up!" and the count of facts done.
6. End screen: a full grainy colour field: "You did it, [Name]!" and "Your report will be emailed to your grown-up shortly."

On a tablet in portrait the panes stack: the question and the answer above, the whiteboard below (at least 360 px high), with multiple choice in two columns.

**Assessment report (account page and email, D-084, D-087).** A report card across the full page width, aligned with the site nav, with generous space between sections. Order:
1. Header table: child, school grade, date, curriculum; wordmark and "Math placement report" on the left; a 2 px ink rule below.
2. Overall: "[Name] is working at a grade [n] level." and one verdict sentence, in a rounded grainy colour band (sunflower, sky, mint) with the big K-8 ruler: the working level is a filled circle in the verdict colour (behind: tangerine, on grade: leaf, ahead: sky), the school grade a dashed ring, and the span between them tinted.
3. Context below the band: the FSA line for BC families with a child in grade 4 or 7 (labelled context, cited, "a different test"; never shown for other provinces), the comparison for the data stage (none below 100 takers per grade; bands with n at 100-399; a percentile with n at 400+), and the help warning when it applies.
4. Rows, each with its title and a one-line explanation on the left and the content on the right: By area (table: area and one-line note, a meter with three zones and a marker at the share right, the status chip, "x of y"; then the zone legend and the thresholds with "an early signal, not a final verdict"); Number facts (accuracy beside speed, never speed alone); [Name]'s work (three whiteboard images, each with the question, right or not, and a comment only when the review is sure); How we help (by verdict); Next step (BC: two plan buttons, nothing charged until the first workbook ships; other provinces: the waitlist).
5. A mono line with the date, question count, minutes and the curriculum measured against.

The email is one 600 px column: greeting, the level and verdict in the same colour band with the ruler, the FSA line (BC only) and the comparison line, the four areas with a meter, status and count, number facts, a line that says the child's work is in the full report (no work images in the email: the drawings stay in private storage and show only in the signed-in report, #67), how we help, one button (plan or waitlist) and a link to the full report. Every number is measured or carries its source. On tablets the rows stack (title above content) and the work shows two across.

**Reminder emails and unsubscribe (D-085, #73).** Three short emails in the look of the report email (one 600 px column, the wordmark, one dark button): "continue your test" (where the child stopped, and until when it can continue, in the family's time zone), "come back" (the test closed after 24 hours; the child starts again with new questions) and "start your test". Each ends with why the parent gets it, an unsubscribe link, the business name, the mailing address and the website (CASL). The unsubscribe page is a support page: the link turns reminders off in one click, with no sign-in, and says that the report email still comes.

## Visual language

**Look (warm, D-034):** Polar Signals' system in our own colours, so the page no longer reads like Primer. One white background for the whole page (no alternating bands), so the pencil line runs unbroken (D-036); no grid rails. Cards (steps, what's included, team) are soft grey; colour fields sit in contained panels. Grainy gradient fields (sunflower, peach, sky, mint) behind the hero photo, the emotional section, the "Why choose" cards and the closing. Soft grey cards with a small coloured square on the corner. Square-ish controls (6 px corners). Many real photos of children.

**Typography:** Geist for headlines (light 300, sentence case, tight tracking) and text; Geist Mono for labels, with an orange square marker. In the hero, "Personalized. Delivered." is grey and "Mastered." is ink with the yellow highlighter.

**Delight (Ello):** Micro animations on scroll: a mono word chip that swaps (fractions, reading, long division, new words); photos and workbook pages that drift; cards that lift; sections that rise in; the hero colour field moves slowly.

**Connection (Squirrel AI, Outschool):** An orange pencil line runs down the page margin and draws itself on scroll.

**Imagery:** Real children with real paper workbooks at home. No drawn worksheets, covers, mailers or phone mockups until the real workbook exists (D-045). The hero is one real photo with no floating cards (D-048). Mockups: Unsplash photos (`.design/assets/stock/CREDITS.md`), and AI-generated images only where stock cannot show the product. Launch photos: D4.

**Motion rules:** Motion explains or delights; it never blocks reading. With reduced motion on, the page shows the end states.

## Behavior and states

- The primary action is a normal link to `/start` (D-093), so it works without JavaScript, with the keyboard and in a new tab; a signed-in parent goes on to their account. `/start` asks for the parent's name, email, postal code and password (or Google sign-in) and the child's first name, grade and curriculum, with no plan question (D-082). The plan and the card come after the report: BC families choose the plan and add a card on Stripe Checkout in setup mode (CAD 0 charged); every other curriculum joins the workbook waitlist from the report.
- Password signup proves the email first (D-093): after "Create account", the same form area shows "We sent a code to [email]..." with a code field, "Confirm email", "send a new code" and "Change your details". The message is the same whether or not the email already has an account. No account data is written before the code: the code signs the parent in on that tab, then the form's password is set and the parent and first child are written in one step. States, all in the account form style: untouched, field errors (focus on the first), sending, code sent, wrong or expired code, new code sent, a code sent a moment ago (wait a minute), email not sent, many people signing up (retry without a new code), password not accepted (back to the form, password field focused), and an existing account ("This email already has an account, so the code signed you in. Nothing in your account changed.", on `/account`). Finishing gives the account a password that nobody knows, so on `/account/finish` a parent without Google also chooses a password ("Choose a password"); a password sign-in to an account with no family gets "For your safety, confirm your email before you finish." with a link to the reset email.
- Old booking returns (D-053) still land on `/thank-you`: only Stripe's own record confirms a saved card; `/?card=saved` shows "We could not check whether your card was added."; `/?card=cancelled` shows "Your card was not added." with nothing charged. Old receipts (waitlist, received request) keep their meaning. Every state except an unchecked card offers "Take free assessment"; the report's own card states stay on the report and in the account.
- Optional analytics records visits and signup steps only after explicit acceptance. Rejecting analytics leaves the assessment available. Analytics does not receive the parent's name, email, postal code, or child's grade. Session recordings and automatic input capture stay off.
- Customer text uses plain language. Public pages have no development notes or draft labels. Provider names appear only in the privacy disclosure, with a plain explanation.
- Privacy and terms identify Unica Learning (D-056) and give savar.gupta1922@gmail.com for support, privacy requests, cancellations and refunds (D-055). Both pages stay out of search results. Never invent a business address.
- The 30-day money-back guarantee starts on the day of the first payment (D-055). State this in the promise, FAQ, booking review, terms and payment-page text.
- The mobile assessment button ("Take free assessment", a link to `/start`) uses the existing primary button below 700 px. Hide it while a dialog or the cookie banner is open. Reserve space for it at the end of the page.

## Responsive and accessibility

- Mobile first (375 px), then tablet and desktop (1440 px).
- Phones (below 700 px) get a shorter page (D-072); 700 px and up stay as the page story describes. On phones: the hero photo is a 4:3 crop; How it works shows numbered rows without photos; "Why choose [Brand]?", the drifting-photo banner, the two promise cards, the closing belief cards are hidden; Included drops its photo, puts each icon beside its title, and starts with a "Real paper. Real pencil." card (the Why card 1 text); the FAQ shows six questions and a "More questions" button (44 px) that shows the rest and moves focus to question 7; the cut starts only after JavaScript runs, so without it every question shows. Section order stays the same as desktop, so reading and focus order match. Measured at 390x844: 10.0 screens, pricing on screen 6.6 (was 17.7 and 12.9). The parent section (D-075) shows on phones as four stacked cards and adds 1.3 screens: 11.4 screens, pricing on screen 8.0.
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
- [ ] The assessment path works end to end with all listed states: signup with the email code, the test, the report, then the card (BC) or the waitlist.
- [ ] Rendered evidence at 375, 768 and 1440 px; keyboard pass; reduced-motion pass.

## Open decisions

- D4 Launch photos (own shoot with consent, or keep stock/AI).
- D8/D3 Checkout: BC card saved with Stripe Checkout in setup mode (D-053). Open: how the first month is charged when the first workbook ships (today by hand: a CAD 99 monthly subscription on the Stripe customer, with a 30%-off coupon on the first invoice (D-091); later a script or webhook).

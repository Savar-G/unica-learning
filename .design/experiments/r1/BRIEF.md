# Round 1 brief: five hero + page options for "Paper that learns"

Read `../../../DESIGN.md` first (the approved contract). This file holds the fixed copy deck and the build rules. Every option uses this copy word for word; options differ in structure, composition, type and motion, not in claims.

## Build rules (all options)

- ONE self-contained file: `.design/experiments/r1/<letter>-<slug>.html`. Inline CSS and JS. External loads allowed only from Google Fonts. No frameworks, no images from the web, no AI-generated images.
- Full page, not just the hero: hero, comparison, how it works (6-step journey), what you see after every book, founders, pilot offer, FAQ, footer. The hero and the journey are where options differ most; the rest can be simpler but must be finished.
- Mobile first. Must look deliberate at 375 px and at 1440 px. The comparison table becomes stacked cards on mobile with row labels kept.
- Workbook pages are drawn in HTML/SVG (real-looking math: grade 3-5 fractions, multiplication, word problems; handwritten answers with one or two mistakes, red marks). Label each drawn page with a tiny caption "Stand-in for a photo of a real workbook" so no one mistakes it for a final photo.
- Palette posture: warm paper off-white background, ink-dark text, ONE accent reserved for marking and adaptation. No gradients behind content. No dark-mode hero.
- Type posture: an editorial display face for headlines (a serif or a distinctive grotesk), a clean neutral text face. Pick faces that suit your option's bet; do not default to Inter + Playfair.
- Motion: only where it explains the loop. Respect `prefers-reduced-motion` (static frames instead).
- Accessibility: semantic HTML, real buttons and links, visible focus, AA contrast, alt text or aria-labels on drawn pages.
- The reserve button opens a simple inline reservation form (parent name, email, child's grade 3/4/5, postal code). Submitting shows a success state: "You're on the list. We'll email you before the pilot starts to take the refundable deposit." No real network calls.
- Quality bar: brilliant.org (restraint, a real product visual, serif headline, white space), daylightcomputer.com and remarkable.com (paper as the future, real light), granola.ai (showing the real mechanism). It must not look AI-generated or templated.
- Forbidden: dark gradients, glowing mockups, purple, sparkle or magic-wand icons, robots, brains, emoji bullets, stock children on tablets, the words "AI-powered", "revolutionary", "personalized learning journey", "unlock", "supercharge". No testimonials, ratings, family counts or outcome claims. Never name Kumon; the column is "In-person centre tutoring".
- Wordmark: no brand name exists yet. Use the text "Working name" in small caps as the wordmark.

## Copy deck (use as written)

**Hero**
- Headline: Paper that learns.
- Subhead: A math workbook made for your child and mailed home. Snap the finished pages, and the next book adapts to what they missed.
- Meta line: Grades 3-5 · Vancouver pilot · CAD 49 a month, delivery included
- Primary button: Reserve a pilot spot
- Secondary link: See how it works
- Small print under the button: Refundable deposit. 10 families. Start date to be announced.

**Comparison**
- Heading: Not another screen. Not another drive.
- Intro: Kids already have apps and after-school centres. Here is what changes.
- Table (columns: AI learning apps | In-person centre tutoring | Paper that learns):
  - Where the work happens: On a screen | At a centre, on a schedule, plus homework | On paper, at home
  - Who checks the working: The app sees answers, not the working | An instructor | We mark every photographed page, working included
  - How it adapts: Inside the app | Starts at the child's level, then one fixed sequence | Every book is built from the last one, so two kids in the same grade get different books
  - Price: About USD 4-35 a month | About CAD 225 per subject a month | CAD 49 a month, delivery included

**How it works** (heading: How it works. Show as a loop: step 6 returns to step 2.)
1. Assess. Your child takes a short placement test online. It finds their level, strengths, gaps and misconceptions.
2. Deliver. We make a math workbook for what your child needs next and mail it home.
3. Practice. 15-20 minutes a day, on paper.
4. Scan. You photograph the finished pages with your phone.
5. Adapt. We mark every page and update your child's learning profile.
6. Repeat. The next workbook is built from what they mastered, missed or need to review. It arrives before the current one runs out.

**What you see after every book**
- What they got right.
- What keeps coming back, and why.
- What the next book will focus on.

**Who we are**
- Heading: We grew up on workbooks.
- Body: Savar and Cedric both did workbook programs as kids, and both know what too much screen time feels like. We are building the version we wish we had: the discipline of paper, with a book that learns.

**Pilot offer**
- Heading: Join the Vancouver pilot.
- Points: 10 families. Grades 3-5 math. CAD 49 a month, delivery included. Refundable deposit. Cancel any month.
- Button: Reserve a pilot spot

**FAQ**
- Is there any screen time? Your child works on paper. The only screen is your phone camera when you snap the finished pages, and an optional hint page if they get stuck.
- What if we miss a week? The next book picks up where your child is. Nothing is lost.
- What if we forget to send photos? We send a reminder. Until new pages arrive, the next book reviews what your child last worked on.
- How is the work marked? In the pilot, we mark every page by hand before the next book is made.
- What happens to my child's work? We use it only to make your child's next book. We never sell or share it, and you can ask us to delete it at any time.
- Can we cancel? Yes, any month.

**Footer**: Working name · Vancouver, BC · Contact email to be added

---
brand: "Unica Learning"
domain: "unicalearning.com"
look: "warm" # Applied via [data-look="warm"] in src/ds/styles/warm.css (overrides legacy Primer tokens in base.css)
status: "active"
last_updated: "2026-11-21"
tokens:
  colors:
    bg: "#ffffff"
    soft: "#faf9f7"
    card: "#f5f4f2"
    paper: "#fffdf7"
    ink: "#0c0c0e"
    ink_2: "#44444c"
    ink_3: "#8a8a93"
    line: "#e4e4e7"
    line_soft: "#ececef"
    btn: "#2b2622"
    accent: "#ff6a3d" # Decorative markers, eyebrow square, pencil thread, borders only (never white text)
    accent_soft: "#fff1ea"
    tang_ink: "#b43d12" # Accessible orange for white text on orange buttons (5.8:1)
    warn_text: "#b8410f" # Accessible dark tangerine for text on white/grey surfaces
    sun: "#ffc93c" # Highlighter stroke & badges (dark ink only)
    sky: "#5b8def" # Focus rings, "ahead" / "learning" state
    leaf: "#2fb37a" # "On grade" / "secure" / "done" state
    red: "#e0322b" # Handwritten offer strike & teacher correction marks only
  gradient_field:
    g1: "#ffc93c" # Sunflower
    g2: "#ff9466" # Peach
    g3: "#8fb4ff" # Sky
    g4: "#a6e8cb" # Mint
    base: "#ffd9b8" # Warm base tint
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, monospace"
    pen: "Caveat, cursive"
    kid: "Gochi Hand, cursive"
  spacing:
    container_max: "1280px"
    gutter: "clamp(16px, 4vw, 48px)"
    admin_scale: [4, 8, 12, 16, 24, 32, 48]
  radius:
    marketing_card: "4px"
    marketing_control: "6px"
    admin_card: "8px"
    parent_panel: "10px"
    child_control: "12px"
    parent_card: "20px"
    pill: "999px"
  breakpoints:
    phone: "700px"
    admin_drawer: "860px"
    tablet_nav: "900px"
    hero_stack: "980px"
    steps_three_col: "1080px"
    max_width: "1280px"
---

# DESIGN.md - Unica Learning

> Canonical visual system, surface rules, landing page blueprint, and binding copy guardrails for **Unica Learning** (`unicalearning.com`).
> Keep this file present-tense and under ~300 lines (~30 KB). Put product flows and backend rules in `docs/<topic>.md`, customer-facing factual claims in `docs/facts.md`, print workbook layout in `.design/workbooks/DESIGN.md`, and decision history in `.design/decisions.md`.

## 1. Visual Theme & Atmosphere

- **Warm, tactile, real-product aesthetic (D-034):** Clean light-mode grotesk typography (`Geist` + `Geist Mono`) paired with warm paper neutrals (`#faf9f7`, `#f5f4f2`) and tactile grainy colour fields (`sunflower`, `peach`, `sky`, `mint` + SVG fractal noise).
- **One unbroken white canvas:** Marketing pages stay on `#ffffff` throughout with no alternating grey bands and no side grid rails, so the thin orange pencil thread (`--accent`) connects sections smoothly down the left margin (D-036).
- **Real product as proof:** Product visuals show real sample workbooks, real report graphics, and real product flows with sample data (Leah and Kai) - never stock photos masquerading as UI, and never cartoon mascots.
- **Important CSS precedence note:** `src/ds/styles/base.css` still holds legacy Primer defaults (`Zodiak`/`Switzer` fonts, `999px` pill buttons, black `1px` borders, brighter hexes). Every active page runs inside `[data-look="warm"]` (`src/ds/styles/warm.css`), which overrides those tokens. **Always use `warm.css` values, never `:root` hex values from `base.css`.**

## 2. Color Palette & Semantic Roles

### Core Warm Tokens (`src/ds/styles/warm.css`)

| Token | Hex | Role & Usage Constraints |
|---|---|---|
| `--bg` | `#ffffff` | Primary page background across marketing, parent, child test, and admin. |
| `--soft` | `#faf9f7` | Subtle surface tint (admin sidebar, quiet parent panels, test left pane). |
| `--card` | `#f5f4f2` | Flat marketing cards (steps, parent duty card, personalization fork, sample notes). |
| `--paper` | `#fffdf7` | Drawn workbook pages only. |
| `--ink` | `#0c0c0e` | Primary text, headings, high-contrast marks. |
| `--ink-2` | `#44444c` | Secondary body copy, leads, nav links, table descriptions. |
| `--ink-3` | `#8a8a93` | Muted metadata, captions, inactive carousel quotes, step numbers. |
| `--line` | `#e4e4e7` | Standard 1 px structural borders and hairlines. |
| `--line-soft` | `#ececef` | Quiet inner dividers and secondary borders. |
| `--btn` | `#2b2622` | Primary dark button fill (warm charcoal; deepens to `--ink` on hover). |
| `--accent` / `--tang` | `#ff6a3d` | Eyebrow 9 px square, wordmark square, pencil thread, active accents, error/attention indicators. **Never place white text on `#ff6a3d`.** |
| `--tang-ink` | `#b43d12` | Accessible dark tangerine for **white text on orange action buttons** (5.8:1 contrast, `#1112`). |
| `--accent-soft` | `#fff1ea` | Warm orange tint for callouts, active desk rail item, open FAQ `+` button, selected options. |
| `--sun` | `#ffc93c` | Yellow highlighter stroke behind hero/pricing words, child avatar/number tiles. **Dark `--ink` text only.** |
| `--sky` | `#5b8def` | Global `:focus-visible` outlines (`2px` or `3px`), "ahead" verdict, "learning" status, Maya board strokes. |
| `--leaf` | `#2fb37a` | "On grade" / "secure" / "done" status, contact confirmation banner. |
| `--red` | `#e0322b` | Strictly reserved for handwritten red-pen offer strikethrough/price (`--pen`) and teacher marks on sample pages. |

### Surface-Specific Semantic Tints

- **Assessment report (`src/components/report.css`):** Secure `#146b45` on `#e3f5ec` (zone `#cdeedc`), Developing `#6e5200` on `#fff2c7` (zone `#ffe9a6`), Needs attention `#a8360f` on `#ffe6db` (zone `#ffd9cb`). Progress preview goal column uses `#fff8dc` with header `#ffe999` (and 8 distinct grade colours for workbook blocks).
- **Page results (`src/components/scan-page-results.css`):** Amber review markers `#d9770b` on `#fdf1e2` (text `#985200`), green right ticks `#16a06a`, primary CTA `--tang-ink`.
- **Child warning text (`test-base.css`, `desk.css`):** `--test-warn` / `--desk-warn: #b8410f`.
- **Admin chips (`src/components/admin.css`):** `color-mix` tints of `--leaf` (20% ok), `--sun` (32% warn), `--tang` (20% bad), `--sky` (16% info) over `#fff`.

### Grainy Gradient Fields

Built by layering `var(--noise)` (`feTurbulence` SVG, `220px` tile, `overlay` blend) over soft radial gradients of `--g1` (`#ffc93c`), `--g2` (`#ff9466`), `--g3` (`#8fb4ff`), and `--g4` (`#a6e8cb`) on `--card` or `--base` (`#ffd9b8`). Use **only** in contained signature panels:

1. Hero sample workbook panel (`.hwb-panel`, fades at bottom via mask).
2. Featured pricing plan card bottom wash (`.plan.hl`, D-037).
3. Home "How we compare" Unica column (`.hc-us-field`, D-219).
4. Closing claim + footer backdrop (`.ending-field`, D-080).
5. Assessment report overall level band (`.rpt-overall`) and child test break/message right pane (`.test-field`).

## 3. Typography Rules & Scale

### Font Families (`src/app/layout.tsx`)

| Variable | Font | Weights | Usage |
|---|---|---|---|
| `--sans` | `Geist` | 300, 400, 500, 600 | All headings, UI, and body copy. Wordmark uses `600` (marketing/admin) or `500` (parent). |
| `--mono` | `Geist Mono` | 400, 500 | Section eyebrows (`12–12.5px`), hero facts, metadata, form legends, footnotes, admin folder headers. |
| `--pen` | `Caveat` | 600 | Handwritten `"Free"` first-month offer beside struck-out price and red teacher notes on sample pages only. |
| `--kid` | `Gochi Hand` | 400 | Simulated child pencil answers and drawn cover names on sample workbook graphics only. |

### Marketing Type Scale (`warm.css`, `hero-workbook.css`)

- **Hero H1:** `clamp(40px, 4.7vw, 66px)`, weight `300`, line-height `1.03`, tracking `-0.035em`, sentence case, max `16ch`.
- **Section H2:** `clamp(32px, 4.2vw, 56px)`, weight `300`, line-height `1.06`, tracking `-0.035em`. Closing H2 scales up to `clamp(42px, 6vw, 88px)`.
- **Card / Subsection H3:** `19–32px`, weight `400–500`, tracking `-0.02em`.
- **Body & Lead:** Body `17px / 1.55` in `--ink`; lead `clamp(18px, 1.5vw, 21px) / 1.5` in `--ink-2` (`max-width: 30–36em`).
- **Eyebrow (`.eyebrow`):** `12.5px / 1.2` `--mono`, uppercase, `0.02em` tracking, prefixed with a `9×9px` `--accent` square.

### Parent Dashboard Typography (`src/ds/styles/parent-type.css`)

**Hard rule: no font weight above `500` anywhere inside Parent (`.pd-shell`).** Only weights `300`, `400`, and `500` are permitted, including nested buttons, `b`, `strong`, and `th`.

| Role | Size & Weight |
|---|---|
| Page title (`--parent-title-*`) | `clamp(30px, 3.4vw, 44px)`, weight `300`, tracking `-0.035em` |
| Large number (`--parent-number-weight`) | Weight `300` (e.g., `40px` current day, `24–26px` summary counts, `18px` ring number) |
| Section heading (`--parent-section-*`) | `20px`, weight `500`, in `--ink` |
| Named item (`--parent-item-weight`) | `16px`, max weight `500` (never exceeds section heading in size or weight) |
| Body & lead phrase (`--parent-body-*`) | `16px`, weight `400` (`500` or `--ink` for short lead callouts) |
| Supporting text (`--parent-support-*`) | `13px`, weight `400`, in `--ink-2` / `--ink-3` |
| Status & controls (`--parent-status/control-weight`) | Weight `500` (chips, buttons, disclosures, selects) |
| Eyebrows | `Geist Mono` with `9px` `--accent` square (Overview omits the eyebrow) |

## 4. The 4 Product Surfaces (+ Email Identity)

All surfaces share the Warm palette and Geist/Geist Mono typography, but intentionally differ in density, corner radius, and elevation. Never mix surface patterns across boundaries.

| Surface | Shell & CSS Entry | Cards & Corners | Elevation | Key Layout & Interaction Rules |
|---|---|---|---|---|
| **1. Marketing (`src/app/(site)`)** | `UnicaRoot` / `[data-look="warm"]` (`warm.css`, `support.css`) | Flat `--card` (`4px` radius, `20×20px` colour corner square on step/duty cards); buttons & inputs `6px`; review cards `18px` | Flat by default; soft shadows only on active review card, workbook sheets, footer card | White canvas with orange pencil thread. Support/SEO pages (`/our-story`, `/contact`, `/resources`, `/pricing`, `/math-assessment`) use `SupportPage` (`800px` max) or Resources article shell. |
| **2. Parent App (`/account`)** | `.pd-shell` (`parent-shell.css`, `parent-type.css`, `report.css`, `scan-page-results.css`) | Primary white cards `20px` radius + `--pd-shadow`; quiet secondary panels `--soft` + `1px var(--line)`, `10px` radius; `248px` white sidebar | Subtle layered shadow (`--pd-shadow`) on primary cards | Content centred at `1040px`. Sidebar holds logo + tabs (+ Feedback) only; active tab is `--soft`/`--ink`. Child pill & `"Open the desk"` pill sit in `.pd-top`. Below `900px`: sticky top header + bottom tab bar (max 5 items with `More` sheet). **Weight cap ≤ 500.** |
| **3. Child Surfaces (`/test`, `/tutor`)** | `.test-root` (`test-base.css`), `.desk-root` (`desk.css`) | `100dvh` no-scroll split screen; friendlier `12–16px` radii; `--soft` / `#f5f5f6` panes | Flat panes; light shadow on desk question card | **Every tap target ≥ 44px** (`52–56px` primary buttons). `3px solid var(--sky)` focus ring. Test: left question/answers (40%), right whiteboard/pad (60%), zero scroll at `1440×900`, `1024×768`, `768×1024`; portrait tablet stacks with whiteboard `≥ 360px` tall. Desk: `76px` left rail, Maya column, shared board; locked behind 4-digit parent PIN; never shows the word `"tutor"`. |
| **4. Admin (`/admin`)** | `.adm-root` (`admin.css`) | `1px var(--line)`, `8px` radius (`--r`); collapsible `248px`/`64px` `--soft` sidebar | Flat `1px` borders (active nav item gets `1px` white card shadow) | Strict spacing scale (`4/8/12/16/24/32/48px`), `15px` body, `1240px` max width. Page header: mono eyebrow, light H1, 1-line purpose, right-aligned actions. Global `"Show test families"` switch (off by default). Plain English only (raw IDs/JSON inside closed `"Technical details"`). |

- **Parent Email Identity (D-122, `src/lib/email-brand.ts`):** White `600px` single column, text wordmark with orange square at top, one dark CTA button where actionable, signature `"Thank you, The Unica Learning team"`, thin horizontal rule, business address on separate lines, `unicalearning.com`, reason for the email, and a CASL unsubscribe link where applicable. Report emails carry the same grainy level band + K–8 ruler and Progress preview (no private child drawings in emails). Hosted Auth templates live in `supabase/templates/`.

## 5. Layout, Spacing, Elevation & Motion

- **Grid & Container:** Marketing container `--max: 1280px` with full-bleed sections padded by `--pad-x: max(var(--gut), calc((100% - 1280px) / 2))`. Support pages use `800px` (`1280px` for `.support-wide` reports). Parent dashboard centres at `1040px`.
- **Buttons:** Primary `.btn` uses `--btn` (`#2b2622`), white text, `6px` radius, `13px 20px` padding (`10px 16px` for `.sm`), shifting to `--ink` + `translateY(-1px)` on hover. Secondary `.btn.ghost` uses `#fff` fill and `#d4d4d8` border (`--ink` on hover). Orange primary actions with white text (e.g., Page results `"Go through it together"`) use `--tang-ink` (`#b43d12`).
- **Inputs & Dialogs:** `1px` `#d4d4d8` borders, `6px` radius (`10px` on dialogs), focus ring `0 0 0 3px rgba(51,102,240,.25)` or `2px–3px solid var(--sky)`.
- **Motion Curves:** `--ease: cubic-bezier(.2,.8,.2,1)` for reveals/transitions; `--spring: cubic-bezier(.34,1.56,.64,1)` for interactive lifts.
- **LCP & Progressive Enhancement:** Hero entrance animates via pure CSS (`heroIn` / `heroImg`) so LCP never waits for JS. Scroll reveals (`.js .rise`) only hide elements after the inline `js` class runs.
- **Reduced Motion (`@media (prefers-reduced-motion: reduce)`):** Disable all transitions/animations, show final reveal/highlight states immediately, freeze grainy field drift, show Stageshow animation end frames, and stop Parent Reviews auto-rotation.

## 6. Component & Primitive Inventory (`src/ds`)

Reuse existing design-system components before adding new CSS:

- **Primitives (`src/ds/basics.tsx`):** `UnicaRoot` (sets `data-look="warm"`), `Logo` (wordmark + orange square), `Button`, `Eyebrow`, `Chip`, `Highlight` (yellow highlighter mark with noise blend), `Section`, `SectionHeader`, `Photo`.
- **Marketing Blocks (`src/ds/blocks.tsx`):** `Nav`, `Hero`, `StepGrid` / `StepCard` (with top-right 20 px colour square), `IncludedCard`, `PlanGrid` / `PlanCard` (supports red-pen `offer` strike and `.plan-family` sibling box), `FounderGrid` / `FounderCard`, `Faq`, `BeliefList`, `GradientPanel`.
- **Product Graphics (`src/ds/product.tsx`):** `WorkbookPage`, `WorkbookCover`, `CoverStack`, `Mailer`, `PhoneScan`, `ProgressReport`.
- **App Chrome & Shared UI (`src/components/`):** `SupportPage` (`support-page.tsx`), `ParentShell` (`parent-shell.tsx`), `AdminFrame` (`admin-frame.tsx`), `PageDeck` (`page-deck.tsx`, tap-to-zoom workbook pages), `StartLink` / `StartNote` (`start-link.tsx`).

## 7. Landing Page Blueprint (Source of Truth)

Rendered by `src/app/(site)/page.tsx` -> `src/components/landing.tsx` (`look="warm"`). Keep literal copy in code (`src/lib/site.ts`, `src/lib/parent.ts`, `src/lib/compare.ts`, `src/lib/faq.ts`) rather than duplicating wording here.

- **Nav (`sections.tsx`):** Wordmark + `How it works`, `What's included` (`/whats-included`), `Curriculum` (`/curriculum`), `Pricing`, `FAQ` + `"Free assessment"` button (`/start`).
- **Section order inside `<main>`:**
  1. **Hero (`sections.tsx`, `hero-workbook.tsx`):** Split 2-column grid. Left: plain grey kicker, light H1 with two yellow highlighter marks (`src/lib/site.ts` `HERO`), plain lead, primary `"Take free assessment"` (`/start`) + ghost `"What's included"` (`/whats-included`), 3-item mono facts row with coloured squares (no device note in hero). Right: grainy colour panel bleeding right and fading at bottom, holding Leah's straight sample workbook cover with spine fold (no props).
  2. **Statement (`sections.tsx`, `statement.css`):** Centred `300`-weight statement in `--ink-3` with the key personalization claim in `--ink`.
  3. **Parent Reviews (`parent-reviews.tsx`):** Centred `"Parent reviews"` eyebrow, `"Parents love us"` H2, spotlight carousel on white (no grey backdrop), hairline white cards with lifted active card, edge fade mask, quote + role label only (no names, stars, counts, photos, or review schema), prev/next 44 px arrows + dots, 3 s auto-advance pausing on hover or keyboard focus, swipe & arrow-key support, `"Shared with permission, names left out."`.
  4. **How it works (`how-it-works.tsx`):** 6 flat `--card` steps in a 3-col desktop / 2-col tablet grid with colour corner squares. Cards 01, 04, 05 run Stageshow product animations (`how-demos.tsx`); cards 02, 03, 06 show real Leah workbook spreads/covers.
  5. **Personalization (`personalization.tsx`):** `"Same grade. Different program."` Fork diagram (`Meet Leah and Kai`) with orange SVG branch lines splitting to two Grade 3 cards, each with interactive tap-to-zoom `PageDeck` workbook samples.
  6. **Guidance / Maya (`guidance.tsx`):** `"Help when they're stuck"` / `"Meet Maya, our AI Teaching Assistant."` Muted looping demo video (wide desktop, board-only on `<900px`) beside `"What Maya does"` 3×3 grid icons.
  7. **Our promise (`sections.tsx`):** `"Try it with nothing to lose."` Two-student Vancouver story (no founder names) + link to `/our-story`, paired with 2 `IncludedCard` promises (`First month free`, `Fits your family's schedule`).
  8. **Pricing (`sections.tsx`):** `"Pricing"` + limited-time `"Try it free for a month."` highlight + full-width featured `PlanCard` (grainy bottom wash, red-pen struck CAD 79.99 -> handwritten `"Free"`, white `.plan-family` sibling box at CAD 59.99, features list, `"See everything that's included ->"`, CTA + device note) + Grade 3+ Maya footnote + referral summary linking to `/terms#referrals`.
  9. **How we compare (`compare.tsx`, `compare.css`):** `"Tutor, learning centre or Unica?"` + link to `/compare`. 4-column table (Price a month + 4 traits): Private tutor, Learning centre (plain `--ink-2`), Unica (unbroken grainy colour field with white check discs; no badges or CTA buttons so it never reads as plan tiers).
  10. **For parents (`parent.tsx`, `parent.css`):** `"Less for you to do, not more."` Left: 5 parent duties struck through with a `2px` `--tang` line beside how Unica handles each. Right: `--card` summary (`"Your part takes about two minutes."`) with top-right colour square.
  11. **FAQ (`sections.tsx`, `faq-more.tsx`):** `"Questions, answered."` + `/contact` link, native `<details>` accordion with `+` button turning `--accent-soft` / `45deg` when open.
  12. **Closing & Footer (`sections.tsx`):** Pencil thread ends at `ThreadEnd` knot, then `.ending-field` grainy panel holding the 3 belief cards, `"This is what learning should be like."`, CTAs + device note, and the white rounded `.foot` card (wordmark, tagline, Instagram/Facebook/LinkedIn icons, 3 link columns `Learn` / `Company` / `Help`, mono fine-print row + cookie settings).
- **Sticky Mobile CTA (`landing.tsx`, `support.css`):** Fixed bottom bar below `700px` with device note + full-width `"Take free assessment"`, hidden while any `<dialog open>` or `[data-cookie-banner]` is visible.

## 8. Brand, Copy & Positioning Rules (Binding)

These rules govern all customer-facing pages, emails, ads, and blog posts. All factual claims must come from `docs/facts.md`.

- **Brand & posture:** Always write **Unica Learning** (`unicalearning.com`); never write `"Pagewise"`. Present as a real, serious product - never `"pilot"`, `"beta"`, or `"test"` wording for the program (D-012, D-056).
- **Marketing terminology:** In headlines, kickers, ads, and social posts, call Unica **"a personalized math learning program"** - not `"workbooks"` (`"workbook"` names the mailed paper book in body copy).
- **No invented proof (D-338):** Never use ratings, review counts, family counts, press logos, outcome percentages, or invented testimonials. Proof is sample pages, `/sample-report`, transparent price, free assessment, first month free, and cancel anytime. The sole testimonial exception is the home Parent Reviews strip (exact approved words, `"…"` for cuts, role label only, no names/stars/photos/review schema).
- **Outcome & performance claims (D-323):** Allowed only when computed by code from the child's test and real plan pace (e.g., `"We can help [Name] reach a grade [n] level by [Month Year]."` via `src/lib/progress-preview.ts`) and accompanied by how it was counted. Never invent results or dates. Keep the paper belief: `"We believe paper and pencil build stronger learning."`
- **Competitors (D-064, D-074, D-152):** Never name a competitor brand outside `/resources` and `/blog`. Elsewhere compare against categories only (learning centres, private tutors, online practice apps) using cited category facts (e.g., BC learning centres list about $170-$220 per subject/month, D-114). Unica works alongside school (never position against school). Inside `/resources` and `/blog`, named competitors require cited, dated facts from their own pages, no disparagement, no outcome claims, and no logos/testimonials.
- **Founders (D-060, D-146):** No founder names on the home page (`"two students"` is allowed). Savar Gupta and Cedric Tanafranca appear on `/our-story` and founder-signed emails only.
- **AI Teaching Assistant (D-150, D-172, D-293):** Use `"AI Teaching Assistant"` (name `"Maya"` may appear). Describe as a shared whiteboard where Maya explains and draws step-by-step and the child answers. Never advertise `"voice call"` in new copy (see `docs/facts.md` voice rule), and never use the word `"tutor"` in visible child/parent UI.
- **Offer & guarantee (D-144, D-306):** Offer is `"First month free"` (starts only on confirmed home delivery of Book 1, charged day 30 with a 7-day reminder; cancel anytime). Never write `"money-back guarantee"`. Never promise delivery dates.
- **Device note (D-134, D-157):** Place `"Your child takes the test on a laptop or tablet."` under every `"Take free assessment"` button **except** the hero and nav.
- **Privacy, data & providers (D-055, D-082, D-084, D-119):** Signup collects parent name, email, phone (D-322), and child first name, grade, and curriculum (no postal code). Card details stay on the payment provider. Child drawings stay in private storage and never appear in emails. Family deletion retains only an anonymized test copy (no names, contact details, drawings, or free text). Provider names (Stripe, Supabase, OpenRouter, etc.) appear **only** in `/privacy`. Support email is `contact@unicalearning.com`; `/privacy` and `/terms` stay `noindex`; never invent a business address.
- **Plain language & grade formatting:** Write `"Kindergarten"` / `"kindergarten"`, never `"grade 0"`. Use the child's name rather than gendered pronouns in generic templates. Never expose ticket numbers, decision IDs, file paths, feature flags, or raw hashes in customer or admin copy. Learning styles may be named (D-070).

## 9. Responsive & Accessibility Contract

- **Breakpoints:** Mobile-first from `375px` up to `1440px`:
  - `< 700px` (phone): sticky mobile assessment bar (with reserved bottom padding), 1-col stacked layouts, How it works collapses to numbered rows without pictures, Promise cards & Closing beliefs hide, FAQ shows first 6 items + 44 px `"More questions"` button (after JS loads), Compare keeps 3 columns with row labels spanning cols 1–2 and Unica spanning 2 rows so the grainy field never breaks.
  - `< 860px`: Admin sidebar becomes a slide-over drawer behind a `56px` top bar.
  - `< 900px`: Desktop nav links collapse; Parent dashboard switches from `248px` sidebar to sticky header + bottom tab bar; Guidance switches to board-only video; For parents stacks card under list; `/compare` 5-col table switches to 2-col picker.
  - `< 980px`: Hero stacks workbook below text.
- **Accessibility (WCAG 2.2 AA):**
  - Contrast: never put white text on `--accent` (`#ff6a3d`) or `--sun` (`#ffc93c`); use `--tang-ink` (`#b43d12`) for white-on-orange buttons and `--ink` on yellow.
  - Focus: visible `2px` (`3px` on child/page-results views) `--sky` or `--ink` `:focus-visible` outlines on every interactive element.
  - Targets: `≥ 44px` on all mobile controls, child test/desk controls, carousel buttons, and page-results markers.
  - Semantics & keyboard: primary CTAs are real `<a href="/start">` links (work without JS and in new tabs); forms focus the first invalid field on error; real product photos carry descriptive `alt` text.

## 10. Do's and Don'ts (Agent Guardrails)

- **DO** wrap marketing/support views in `<UnicaRoot>` (`data-look="warm"`) and import tokens/primitives from `src/ds`.
- **DO** respect the 4-surface boundaries (e.g., `4px` flat cards on marketing vs. `20px` shadowed cards in Parent vs. `8px` bordered cards in Admin).
- **DO** cap every font weight inside `.pd-shell` at `500` (`300 / 400 / 500` only).
- **DO** check `docs/facts.md` before writing any customer-facing number, price, or feature claim.
- **DON'T** copy `:root` hex values, serif fonts, or `999px` pill buttons from legacy `src/ds/styles/base.css`.
- **DON'T** use purple AI palettes, sparkle icons, dark-mode hero gradients, glowing mockups, cartoon mascots, or Primer-style black grid rails.
- **DON'T** add alternating grey background bands on marketing pages (breaks the white canvas and pencil thread).
- **DON'T** add `FAQPage`, `HowTo`, or `Review` structured data markup (D-319).
- **DON'T** hard-code hex colours, arbitrary spacing, or unverified product claims when a Warm token or `docs/facts.md` entry exists.

## 11. Related Docs Map

| Topic | Source of Truth |
|---|---|
| Approved customer claims & unreleased-feature bans | `docs/facts.md`, `src/lib/site.ts` |
| Decision log & visual prototype history (D-001+) | `.design/decisions.md` (search with `rg`), `.design/experiments/` |
| Print workbook visual system & page contract | `.design/workbooks/DESIGN.md`, `docs/workbook-rendering.md` |
| Parent dashboard, plan gate, billing, workbooks/answers | `docs/parent-dashboard.md`, `docs/plan-controls.md`, `docs/referrals.md`, `docs/parent-feedback.md` |
| Page scanning, AI marking & parent problem explanations | `docs/scan-pages.md`, `docs/scan-marking.md`, `docs/parent-problem-explanations.md` |
| Maya chat, notes, notice & voice | `docs/maya-chat.md`, `docs/parent-maya-notes.md`, `docs/maya-voice.md` |
| Assessment test blocks, signup, auth emails & first pages | `docs/assessment-blocks.md`, `docs/assessment-signup.md`, `docs/first-pages.md` |
| Admin customer activity, AI usage & delivery emails | `docs/customer-activity.md`, `docs/ai-usage.md`, `docs/workbook-delivery-emails.md` |
| Blog style & SEO rules | `docs/blog-style.md`, `AGENTS.md` |

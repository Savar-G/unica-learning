# Pagewise design system: how to build with it

Pagewise sells personalized paper math and reading workbooks for ages 6-12, mailed home. The look is "warm": white page, light Geist headlines, Geist Mono labels, grainy colour fields in sunflower, peach, sky and mint, soft grey cards, 6 px controls.

## Setup

Wrap every screen in `<PagewiseRoot>`. It sets `data-look="warm"` and every token below; without it, components render in browser defaults.

```jsx
const { PagewiseRoot, Nav, Hero, Button, photos } = window.Pagewise;

<PagewiseRoot>
  <Nav />
  <Hero imageSrc={photos.heroHome1} imageAlt="A boy writes in his workbook at home"
    actions={<><Button>Get started</Button><Button variant="ghost" arrow={false} href="#how">See how it works</Button></>} />
</PagewiseRoot>
```

## Styling idiom

Style with components first. For your own layout glue, use plain CSS with these tokens (all defined on the root):

| Token | Use |
|---|---|
| `var(--ink)`, `var(--ink-2)`, `var(--ink-3)` | text: primary, secondary, muted |
| `var(--line)`, `var(--card)`, `var(--soft)` | hairlines, grey card fill, off-white |
| `var(--accent)` | orange marker (eyebrow square, logo square) |
| `var(--sun)`, `var(--sky)`, `var(--tang)`, `var(--leaf)` | solid brand colours (workbook covers, small squares) |
| `var(--g1)`..`var(--g4)` | gradient field colours; combine with `var(--noise)` for grain |
| `var(--sans)`, `var(--mono)` | Geist and Geist Mono |
| `var(--gut)`, `var(--ease)`, `var(--spring)` | side gutter, standard easing curves |

Layout classes you may reuse: `sec` (section padding; prefer `<Section>`), `lead` (grey intro paragraph), `ctas` (button row), `meta` (mono fact line), `ph` (photo box).

## Rules

- Headlines are sentence case, light weight, and end with a period: "Six steps. One loop."
- Section openers are `<SectionHeader eyebrow="..." title="..." lead="..." />`.
- One page background (white). Put colour inside panels and cards (`GradientPanel`, `FeatureCard`, featured `PlanCard`), never as alternating full-width bands.
- Show the product with the drawn pieces (`WorkbookPage`, `WorkbookCover`, `Mailer`, `PhoneScan`, `ProgressReport`) and real photos from `photos`. No stock, AI or icon-illustrated children.
- Never name competitors. No invented ratings, reviews, user counts or outcome numbers.
- Grids own their children: `StepCard` inside `StepGrid`, `FeatureCard` inside `FeatureGrid`, `PlanCard` inside `PlanGrid`, `FounderCard` inside `FounderGrid`.

## Where the truth lives

Read `styles.css` (it imports `_ds_bundle.css`, the full stylesheet) before writing custom CSS, and each component's `.prompt.md` and `.d.ts` for props and examples.

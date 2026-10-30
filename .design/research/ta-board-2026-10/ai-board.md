# Maya: semantic math board research

Research date: 2026-10-29. Audience: the Maya implementation team.

Use a small semantic command language and a deterministic TypeScript layout core. Render ordered pen paths with SVG in the React 19 app. Use `perfect-freehand` for the child's ink. Use a stroke font for Maya's digits and notes. Keep the same path data for a later React Native renderer.

This is a research recommendation and a schema sketch. It is not an implementation or a measured product result. The requested scope is ages 6-12 and grades 1-7 math. The description of the yellow column, red carry arrow, blue digits, and green answer came from the task. No reference video or image was supplied for inspection.

## Method and evidence limits

I used Keenable `search_web_pages` first. I set `published_after` to `2026-01-01` for current agent and tutor searches. I read primary documentation, source files, license files, and accounts written by the project authors. All web sources cited in this report were read on **2026-10-29**. A publication date is stated separately when the source supplied one.

Keenable returned rate-limit errors on some requests. Some old Skia documentation addresses returned HTTP 404. I then used the current maintainer documentation. I used a web fetch for OpenType.js after a Keenable retrieval failure. The Keenable text extraction of the raw EMS Tech SVG returned unrelated image text. I rejected that extraction. I read the XML bytes through the GitLab API instead.

I did not run tutor demos, a browser, a renderer, or an LLM evaluation. Product descriptions establish what the authors report. They do not establish learning outcomes, error rates for Maya, or mobile performance. No paid research service, hosted application write, or source change was required.

Before checking the recommendation, use these conditions to reject it:

- Reject the vocabulary if a required teaching step needs a model-supplied screen coordinate.
- Reject the layout if a carry, borrow, rule, or arrow covers an unrelated digit at a supported size.
- Reject the font if the required glyphs are absent or children cannot distinguish the digits.
- Reject the player if interruption leaves the spoken explanation ahead of the visible board.
- Reject the shared board if Maya's undo, clear, or eraser changes the child's ink without an explicit child action.

## Existing code at the requested reference

I read each of the five files with `git show origin/main:<path>`. The local `origin/main` reference was `96497f91ec507c9e5a877d1376202565a3e48606`. I did not fetch or change a reference. These findings describe that local reference, not the dirty working copy or a newly queried remote head.

| File and lines at that commit | What exists | Reuse decision |
| --- | --- | --- |
| [`src/lib/whiteboard.ts:10-34`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/whiteboard.ts#L10-L34) | `Stroke` contains `erase`, `w`, and `pts`. `BoardEvent` records strokes, undo, and clear. `BoardState` has visible strokes, typed text, the event log, and an optional start time. | Reuse the child ink model and event-log pattern through an adapter. Add object ownership and semantic objects in a separate Maya model. |
| [`src/lib/whiteboard.ts:50-103`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/whiteboard.ts#L50-L103) | Pure pointer rules reject palms. A pen can replace an active touch. A recent pen blocks touch for 3 seconds. | Reuse the rules. Native input must supply equivalent pointer information. This source read does not prove native palm rejection. |
| [`src/lib/whiteboard.ts:127-147`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/whiteboard.ts#L127-L147) | `exportFrame` calculates a bounded image crop around pen strokes. | Reuse its approach for a child-work export. A lesson board needs bounds for math objects and annotations as well. |
| [`src/lib/whiteboard.ts:151-215`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/whiteboard.ts#L151-L215) | Draft encoding rounds coordinates. Version 2 stores event times against a time origin. Decoding restores times and accepts old drafts without timings. | Reuse the versioning and recovery pattern. Give Maya sessions a separate key and version. Do not store lesson data under test-question keys. |
| [`src/lib/strokes.ts:11-129`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/strokes.ts#L11-L129) | Version 1 JSON records board width, height, and stroke, undo, and clear events. A point is `[x,y,t]`. Recording makes time monotonic. Validation checks bounds. `fitStrokes` reduces point density to meet a byte limit. | Reuse the child recording codec and validation ideas. Keep the version 1 reader intact. Use a new lesson format for semantic commands, colors, authors, object IDs, and speech cues. |
| [`src/lib/strokes.ts:143-183`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/strokes.ts#L143-L183) | `boardAt(t)` rebuilds visible strokes at a time. Undo removes the last stroke. Clear removes all visible strokes. `storedBoard` reconstructs the final board and recording clock for a revisit. | Reuse deterministic replay and recovery concepts. Add an indexed lesson timeline rather than scanning an entire long call on every animation frame. |
| [`src/components/whiteboard.tsx:70-131`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/components/whiteboard.tsx#L70-L131) | PNG export uses separate ink and white-background canvases. Local storage keeps drafts. | Reuse the export separation and failure handling. Browser storage, DOM, and image export belong in web adapters. |
| [`src/components/whiteboard.tsx:153-249`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/components/whiteboard.tsx#L153-L249) | The component handles device pixel ratio, resize, pointer capture, coalesced pointer samples, incremental painting, and recording times. | Reuse input handling where suitable. The current component has one ink owner and one tool state. It is not a shared tutor scene. |
| [`src/components/board-paint.ts:18-39`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/components/board-paint.ts#L18-L39) | Canvas paints constant-width polylines with round ends. Erasing uses `destination-out`. Ink is one fixed dark color. | Keep for the existing test and recording reader. Maya needs color, opacity, layers, semantic bounds, and path animation. |
| [`src/components/stroke-replay.tsx:50-113`](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/components/stroke-replay.tsx#L50-L113) | Replay loads a signed recording URL on demand. It supports pause, seek, speeds 1/2/4, resize, and timed canvas repaint. | Reuse the player controls and clock pattern. Add stroke interpolation, speech timing, command groups, cancellation, and ownership. |

Both x and y use **board width** as their unit. Y is not a fraction of board height. This preserves shape during resize. `w` remains a CSS-pixel width. A new adapter must respect both choices. See the comments and types in [whiteboard.ts](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/whiteboard.ts#L6-L14).

The component samples pen pressure once when a stroke starts. It does not keep pressure at every point. Do not pass a stored `[x,y,t]` tuple directly to `perfect-freehand`: that library interprets its third value as pressure. Convert the point format first. The present replay also selects completed points up to a time. It does not interpolate a new endpoint between samples. These facts follow from [the pointer code](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/components/whiteboard.tsx#L203-L241), [the recording type](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/strokes.ts#L11-L18), and [the replay function](https://github.com/Savar-G/unica-learning/blob/96497f91ec507c9e5a877d1376202565a3e48606/src/lib/strokes.ts#L143-L155).

The source comments describe private JSON storage beside a PNG drawing. They describe admin replay and restoring the child's own test. This read did not inspect upload routes, storage policies, or live storage. Reuse of those storage permissions for voice lessons remains unconfirmed. The existing PNG and stroke format also lack semantic meaning and author identity. They cannot be the full Maya session record.

## What existing projects establish

### tldraw Teach and the agent starter kit

tldraw's account, published 2026-09-22, describes Teach as a single-request experiment. The later starter kit adds planning, canvas navigation, and review. It gives the model viewport bounds, a screenshot, and shape data. It also checks canvas problems such as text overlap. This is useful evidence that shape JSON alone does not solve spatial reasoning. It is not a measured coordinate-error rate. [tldraw engineering account](https://tldraw.dev/blog/harnessing-the-agents).

The starter kit uses typed actions with validation and application code. Its model-facing shapes include `shapeId`, a type discriminator, and shape properties. Its examples still include x and y. It has less detailed shape summaries for the viewport and clusters outside it. Helpers check existing IDs, new IDs, and coordinate offsets. Alignment, stacking, and distribution are separate actions. Thus, this kit does **not** establish a coordinate-free math protocol. It supplies useful patterns for validation, object references, and board summaries. [Agent starter kit documentation](https://tldraw.dev/starter-kits/agent).

The same engineering account describes a later general canvas agent that writes editor code. That direction serves broad canvas editing. Maya has a smaller, predictable set of school math tasks. Arbitrary generated editor code would weaken validation and native portability. The recommendation here is a deliberate restriction for Maya, not a claim that the latest tldraw architecture uses only fixed tools.

License distinction: the SDK is source available under the tldraw license. Commercial production requires the appropriate license. Some example code has an MIT license, but that does not make the SDK MIT. [Official license guide](https://tldraw.dev/community/license).

### Excalidraw AI and diagram conversion

Excalidraw's text-to-diagram introduction contains a generation service and a Mermaid path. Its documented conversion API accepts Mermaid source and creates a simplified element representation. The element converter then builds complete editor elements. This separates a textual diagram description from layout. [Introduction commit](https://github.com/excalidraw/excalidraw/commit/14845a343bdc59b1304d02d90457a372b0b909ca), [conversion API](https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api).

The general element API still requires shape type and x/y position. It can bind arrows by object ID and size a container from its label. Stable references require care: its documented converter regenerates IDs by default. These are editor details that a Maya adapter would have to handle. The editor does not supply arithmetic semantics. [Element API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton).

Use the Mermaid approach as a precedent for semantic input followed by code layout. Mermaid flowcharts are not a solution for carries, borrows, or long division. A sketch style also does not imply ordered handwriting animation. Excalidraw is MIT licensed, but font assets retain their own licenses. [Excalidraw repository](https://github.com/excalidraw/excalidraw).

### ChalkTalk: a close command-language example

The author describes relative placement and named parts in a voice teaching board. The source confirms a Zod action union for writing, word groups, boxes, arrows, tables, bars, lists, marks, and removal. Placement uses named regions or relations to an earlier ID. This is a close precedent for the proposed Maya protocol. [Action schema](https://github.com/Danialmoa/chalktalk/blob/8809cf6cdaa51da33887d8182fb86b73742a9791/src/lesson/schema.ts), [layout source](https://github.com/Danialmoa/chalktalk/blob/8809cf6cdaa51da33887d8182fb86b73742a9791/src/board/layout.ts).

In the author's post, published 2026-10-19, raw placement failed and a box-only vocabulary produced unsuitable teaching diagrams. The author also reports malformed streamed JSON and timing errors when drawing duration used a speech-length estimate. Crucial limit: the post lists real stroke handwriting as future work. Its existing fade effects do not prove that requirement. These are author reports, not independently repeated measurements. [ChalkTalk development account](https://dev.to/danial_mo/chalktalk-a-whiteboard-tutor-that-draws-like-a-teacher-and-lets-you-raise-your-hand-4jmd).

For Maya, use exact object-part references. Do not copy substring targets without a disambiguation rule. A number or word can occur more than once. Also reject an invalid required drawing step before speaking about it. Silently dropping a bad action can leave a child listening to an explanation of an absent drawing.

### Tutori: geometry belongs in code

The author's account, published 2026-06-12, reports overlapping labels and inconsistent geometry when the model placed primitive shapes. The project moved toward composite operations, deterministic placement, capacity checks, and generated layout cases. It reports a voice tutor that draws in steps. Its reported layout results concern that project's cases. They do not prove Maya's arithmetic layouts, font quality, or speech synchronization. [Tutori development account](https://huggingface.co/blog/build-small-hackathon/tutori).

The useful design lesson is specific: a model should request a complete mathematical representation rather than assemble it from unrelated lines. For Maya, `columns` and `division` should reserve all required writing space before animation starts.

### Khanmigo: confirmed product behavior, undisclosed drawing schema

Khan Academy's 2026 announcement confirms interactive math and science diagrams. A learner can move a line segment and the tutor can respond. The article does not disclose its tool schema, renderer, coordinate policy, or pen-stroke format. It also does not establish Maya's proposed simultaneous voice and handwriting behavior. These technical details remain **unconfirmed**. [Khan Academy announcement](https://blog.khanacademy.org/new-ai-tools-bring-interactive-diagrams-and-targeted-practice-thanks-to-khan-academys-partnership-with-google-org/).

No inspected source establishes a production-ready, reusable package that combines semantic elementary arithmetic, ordered handwriting, child ink, and both web and native renderers. This is a bounded search result, not proof that no such package exists.

## Stroke rendering and font options

### Separate glyph shape from pen motion

Store each glyph as ordered open pen paths. Store its advance width, actual bounds, baseline, and stroke order. A glyph can require several pen lifts. One font glyph is not necessarily one continuous pen stroke.

For an open path of length `L`, a web SVG renderer can set `stroke-dasharray` to `L L` and reduce `stroke-dashoffset` from `L` to zero. Use `fill="none"` and round stroke ends. Split each pen-down subpath into a separate path and schedule it in order. SVG resets the dash pattern at each subpath. One unsplit multi-subpath glyph can therefore reveal several strokes together. [SVG painting specification, dashing section](https://www.w3.org/TR/SVG2/painting.html#StrokeDashing).

That animation rule is a proposed use of the SVG standard. The standard defines dashing, not handwriting order. The font import must provide the order. Use measured path length or a shared TypeScript length calculation. Keep browser `getTotalLength()` out of the portable layout core.

| Option | Confirmed capability | Commercial license and limitation | Decision for Maya |
| --- | --- | --- | --- |
| Classic Hershey data | Vector paths with pen-up information. Several type styles and symbols exist. | The inspected distribution permits commercial use with its acknowledgements and a restriction on conversion to the NTIS format. Do not apply a blanket public-domain claim to every package. [Distribution notice](https://github.com/kamalmostafa/hershey-fonts/blob/master/hershey-fonts.notes). | Useful reference and fallback. Some styles look technical. Check the exact selected glyph set. |
| Relief SingleLine | Open SVG paths and other open-path exports. The web WOFF2 export has closed outlines. [Author repository](https://github.com/isdat-type/Relief-SingleLine). | OFL 1.1 permits commercial bundling with its conditions. Preserve notices and the font license. Respect any reserved names when modifying. [License](https://github.com/isdat-type/Relief-SingleLine/blob/main/OFL.txt). | Clean fallback for legibility. Use the open SVG data. It is a sans serif design, not proof of a tutor handwriting style. |
| EMS Tech | The SVG metadata identifies a stroke derivative of Architects Daughter. Digits, Latin notes, multiplication, and division glyphs exist in the inspected bytes. [Font file](https://gitlab.com/oskay/svg-fonts/-/blob/master/fonts/EMS/EMSTech.svg). | Metadata states SIL OFL. The collection explains individual font credits and licenses. [Collection](https://gitlab.com/oskay/svg-fonts). | Best initial font candidate for a handwritten appearance. Audit stroke order and small carry digits before adoption. |
| Other EMS fonts | The collection includes Casual Hand, Pancakes, Readability, and others with different source fonts. [Collection and credits](https://gitlab.com/oskay/svg-fonts). | Read each selected SVG's metadata. The collection's license does not make every font identical. | Alternatives if Tech fails legibility. No visual preference test was run. |
| Handwriting OTF/TTF converted to paths | OpenType.js exposes glyph paths, advances, and bounds. [OpenType.js](https://github.com/opentypejs/opentype.js). | The parser is MIT. The font has its own license. Converting a font does not remove that license. | An ordinary outline gives a filled letter boundary, not the original pen route. A dash traces the boundary. Natural writing needs an authored centerline or a timed mask as well. |
| `perfect-freehand` | Pure TypeScript turns sampled pen points into a pressure-sensitive outline polygon. The output is independent of the renderer. [Author documentation](https://github.com/steveruizok/perfect-freehand). | MIT. Preserve the notice. It is neither a font nor a math layout engine. | Use for child ink. Use stable point sampling and options. Do not dash the outline polygon and call it pen motion. |
| Rough.js | Produces sketch-style lines, curves, polygons, ellipses, and SVG paths. It supports canvas and SVG. [Author repository](https://github.com/rough-stuff/rough). | MIT. It does not create handwriting text or teaching semantics. | Optional for circles and arrows. Keep mathematical rules and small digits clean. |

The EMS Tech source probe used the [GitLab raw-file API](https://gitlab.com/api/v4/projects/12941474/repository/files/fonts%2FEMS%2FEMSTech.svg/raw?ref=master). It returned HTTP 200 and 48,932 bytes. SHA-256: `6da30b0e44022a07043204f6936ba929a3cf756609921a48ce1a7309a5270775`. XML inspection confirmed paths for `0-9`, `+`, ASCII `-`, `×`, `÷`, `=`, parentheses, period, percent, and lowercase `a-z`. It found **no U+2212 minus** and **no U+2713 check mark**. Supply those as owned geometric paths. Do not silently omit them. No raster or child readability test was run.

Some glyphs retrace segments. For example, the inspected multiplication glyph follows part of its path twice. Its path data proves a route exists, not that this route matches a primary-school teacher's pen order. Review the small required glyph set before extending it. Keep the source font and notices with any derived path asset. Treat a converted reusable glyph table as font software, not merely a picture.

Rough.js has a generator that works without a drawing context and exports path information. Generate each decoration once. Keep its paths or a fixed seed with the session. Regeneration must not change the drawing during replay. An adapter can use those paths on native later, but the native bundling of Rough.js was not tested. [Generator documentation](https://github.com/rough-stuff/rough/wiki/RoughGenerator).

For `perfect-freehand`, the output is a filled outline. Reveal it with an advancing centerline mask, or draw the outline of the input prefix. The latter can change the recent end shape as new samples arrive. Use it for live child input. For Maya's fixed-width glyphs, open paths with dashing are simpler and more predictable.

## Math layout: build a small engine

MathML 3 already defines useful concepts for school arithmetic: aligned number stacks, shifted row groups, carries, crossed-out entries, and long division. Use these ideas when naming internal objects. The standard is a layout reference, not a stroke player. [W3C elementary math specification](https://www.w3.org/TR/MathML3/chapter3.html#presm.elementary).

MathJax's current documentation describes experimental support for `mstack`, `mlongdiv`, and related tags through a conversion extension. It does not give a handwritten pen route. KaTeX supports fractions, arrays, and other typeset expressions. These remain useful for a text alternative or an optional static equation. Neither inspected source establishes the required editable carry and borrow scene. [MathJax MathML support](https://docs.mathjax.org/en/latest/input/mathml.html), [KaTeX supported functions](https://katex.org/docs/supported.html).

I did not find a maintained handwritten elementary-math layout package that meets all the stated requirements. Build a limited engine with explicit notation rules. Do not build a general TeX engine.

| Representation | Deterministic layout rule | Important cases |
| --- | --- | --- |
| Column addition and subtraction | Align decimal places on a fixed digit grid. Reserve an operator cell, a rule, an answer row, and annotation lanes above operands. | Different operand lengths, a new leading carry, decimals, zero placeholders, several operands, and borrow chains such as `402 - 187`. |
| Column multiplication | Reserve operand rows, a work row for each multiplier digit, and the final answer row. Tie each work row to a multiplier place. | Partial products, visible zero placeholders, several carry lanes, and a separate decimal-placement explanation. Never infer place shift from arbitrary spaces in text. |
| Long division | Align quotient slots to dividend places. Reserve a bracket and repeated product, rule, remainder, and bring-down rows. | `156 ÷ 12`, an internal zero such as `1005 ÷ 5`, a remainder, decimal extension, and the school's notation convention. |
| Fractions and mixed numbers | Measure numerator and denominator. Center both over a bar wider than their actual bounds. Reserve a whole-number slot. | Improper fractions, unlike denominators, a mixed number, equivalent fractions, and a zero denominator rejection. |
| Number lines | Convert exact rational values into positions between bounded endpoints. Generate ticks and labels from a fixed interval. | Negative numbers, fractions, decimals, backward jumps, and several jump lanes. Never send pixel positions to the model. |
| Place-value models and arrays | Lay out base-ten units, rods, and flats by count. Use fixed rows and columns for arrays. | Exchange one ten for ten ones, group totals, fractional units, and display limits for large counts. |
| Simple grade 6-7 diagrams | Use named geometry templates and mathematical values. Map a coordinate grid's mathematical points through a scale. | Distinguish mathematical `(x,y)` values from screen coordinates. Geometry and chart support need separately bounded schema variants. |

Use exact decimal or rational values in the core. For example, store `0.1` as a decimal string or as `1/10`. Repeated binary floating-point addition must not choose number-line labels or tick positions. Preserve written zeros when the lesson needs them.

Each object produces an anchor map. A column object can expose its whole ones column, the top operand's ones cell, the answer row, and a carry slot. A fraction exposes its numerator, denominator, and bar. A number line exposes values and intervals. Mark and arrow commands resolve these anchors after layout.

Measure actual glyph bounds as well as advances. A stroke can extend beyond its advance. Include stroke thickness, carry lanes, arrow lanes, and highlighted bounds in collision checks. Reject overflow or start a new teaching page. Do not keep shrinking digits until they fit.

Freeze the page's logical layout while the child writes. A viewport resize may scale or pan the scene. It must not move an object away from ink the child wrote beside it. Keep a stable transform from child ink into page units. Reserve lower work rows before a division step begins. When those rows are full, continue on another page with an explicit relation to the prior work.

## Proposed vocabulary: 15 commands

This section is a new proposal. It is not a schema copied from an existing product.

The model selects math objects, visible steps, and semantic targets. The application selects coordinates, spacing, stroke widths, fonts, and timing. No model command accepts raw SVG, HTML, JavaScript, a path string, or screen coordinates.

| Command | Main fields | Meaning |
| --- | --- | --- |
| `columns` | `id`, `operation`, named `operands`, `place` | Create an aligned addition, subtraction, or multiplication problem. Reserve work and answer slots. Reveal the operands and rule only. |
| `division` | `id`, `dividend`, `divisor`, `place` | Create a long-division problem and its empty quotient/work slots. Do not reveal the answer. |
| `fraction` | `id`, `numerator`, `denominator`, optional `whole`, `place` | Create a fraction or mixed number. Expose each part as a target. |
| `number_line` | `id`, `min`, `max`, `tick`, `place` | Create a bounded line with exact-value ticks. |
| `model` | `id`, a closed `kind` variant, `place` | Create `base_ten`, `array`, `fraction_strip`, `geometry`, or `coordinate_grid`. Each variant has its own bounded fields. |
| `write` | `id`, `text`, `place`, `ink` | Add a short literal note or simple linear equation. Stable word indices allow exact note targets. |
| `put` | `target`, `value`, `ink` | Reveal a value in an existing writable cell, row, or named slot. The object determines its position. |
| `regroup` | `id`, `objectId`, `rowId`, `kind`, `from`, `to` | Carry or borrow one unit from an adjacent place. The row identifies the answer/work calculation for a carry or the operand for a borrow. The core calculates the values and crossed-out digits. It can draw the transfer arrow. |
| `mark` | `id`, `target`, `style`, `ink` | Add `highlight`, `circle`, `underline`, `strike`, or `check`. Keep this annotation separately addressable. |
| `arrow` | `id`, `from`, `to`, optional `label`, `ink` | Connect two semantic targets. The engine chooses the route and endpoints. |
| `jump` | `id`, `lineId`, `fromValue`, `toValue`, optional `label` | Draw a number-line jump in an available lane. Values determine its endpoints. |
| `remove` | `objectId` | Remove a Maya object or annotation by ID. Reject a removal that would detach protected child ink. |
| `undo` | `transactionId` | Undo an eligible committed Maya command group. Restore values, annotations, and visibility together. |
| `clear` | `pageId`, `scope` | Clear Maya annotations or Maya objects on a page. Preserve the child's ink. The child UI owns an explicit whole-page clear. |
| `focus` | `target` | Bring a named object or part into view. The application decides the camera transform. |

These commands cover the listed board needs and common grade 1-7 representations. They do not constitute an audited curriculum map. The `model` variants must remain closed, typed schemas. Do not turn `model` into a generic drawing instruction with arbitrary properties.

### References and validation

Use object IDs supplied at creation. Operand and work-row IDs are local to their parent. The core returns the exact list of valid rows, parts, and writable slots after each creation command. The model receives this semantic summary before it writes further commands. It must not invent a division row name that the core has not returned.

Use structured targets rather than a string that the model must parse. For example:

```json
{
  "objectId": "sum1",
  "part": "cell",
  "rowId": "answer",
  "column": "ones"
}
```

Each `part` has an exact selector schema. `whole` needs only an object ID. `column` needs a place name. `cell` needs a row ID and a place name. `slot` needs a returned slot ID. Other variants include `row`, `numerator`, `denominator`, `bar`, `word`, `value`, and `interval`. Note words use indices, not matching text. Repeated digits and repeated words therefore remain distinct.

The `model` variants also expose stable parts. An array exposes row, column, and item indices. A fraction strip exposes section indices. A base-ten model exposes named groups and units. A geometry template exposes its named vertices, edges, and angles. A coordinate grid accepts mathematical values within declared bounds. These selectors do not accept display positions.

Support place names from millions through thousandths initially. A new leading carry slot is part of the reserved grid. Extend the enum only when a real case requires it. A number-line value is mathematical data, not a screen position.

Validate each complete command before changing the scene. Check schema, ownership, object kind, target existence, writable state, math constraints, glyph coverage, and capacity. A failed command returns a typed error and the valid targets. Do not silently invent a nearby target or coerce an invalid value.

### JSON Schema sketch

This valid JSON fragment shows the strict target boundary and command discrimination. It expands two commands. The other 13 commands require their own branches from the vocabulary table before implementation. It is deliberately **not** a complete production schema. Add string, array, and integer bounds to every branch. Adapt the schema to the selected model provider's supported structured-output subset.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "PlaceName": {
      "enum": ["millions", "hundred_thousands", "ten_thousands", "thousands", "hundreds", "tens", "ones", "tenths", "hundredths", "thousandths"]
    },
    "Target": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["objectId", "part"],
          "properties": {
            "objectId": {"type": "string", "minLength": 1, "maxLength": 64},
            "part": {"const": "whole"}
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["objectId", "part", "column"],
          "properties": {
            "objectId": {"type": "string", "minLength": 1, "maxLength": 64},
            "part": {"const": "column"},
            "column": {"$ref": "#/$defs/PlaceName"}
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["objectId", "part", "rowId", "column"],
          "properties": {
            "objectId": {"type": "string", "minLength": 1, "maxLength": 64},
            "part": {"const": "cell"},
            "rowId": {"type": "string", "minLength": 1, "maxLength": 64},
            "column": {"$ref": "#/$defs/PlaceName"}
          }
        }
      ]
    },
    "Ink": {"enum": ["blue", "red", "green", "yellow", "black"]}
  },
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id", "target", "style", "ink"],
      "properties": {
        "op": {"const": "mark"},
        "id": {"type": "string", "minLength": 1, "maxLength": 64},
        "target": {"$ref": "#/$defs/Target"},
        "style": {"enum": ["highlight", "circle", "underline", "strike", "check"]},
        "ink": {"$ref": "#/$defs/Ink"}
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "target", "value", "ink"],
      "properties": {
        "op": {"const": "put"},
        "target": {"$ref": "#/$defs/Target"},
        "value": {"type": "string", "minLength": 1, "maxLength": 24},
        "ink": {"$ref": "#/$defs/Ink"}
      }
    }
  ]
}
```

The application must reject `put` on a whole object or a whole column when that target is not writable. JSON Schema alone cannot establish that a referenced object exists or that an answer is correct. The object-specific validator supplies those checks.

Placement also uses a closed union. Examples are `{"region":"main"}`, `{"below":"sum1"}`, `{"rightOf":"sum1"}`, and `{"near":{"objectId":"sum1","part":"cell","rowId":"answer","column":"ones"},"side":"right"}`. Only the engine converts these requests to grid positions. Reject cyclic relations and references to deleted objects.

### Example: 27 + 39 = 66

This sequence is original proposal data. The engine reserves carry slots, lays out blue operands, and holds the answer cells empty. Commands run in order. A controller may group related commands into one undo transaction.

```json
[
  {
    "op": "columns", "id": "sum1", "operation": "add",
    "operands": [{"id": "top", "value": "27"}, {"id": "bottom", "value": "39"}],
    "place": {"region": "main"}
  },
  {
    "op": "mark", "id": "onesGlow",
    "target": {"objectId": "sum1", "part": "column", "column": "ones"},
    "style": "highlight", "ink": "yellow"
  },
  {
    "op": "put",
    "target": {"objectId": "sum1", "part": "cell", "rowId": "answer", "column": "ones"},
    "value": "6", "ink": "green"
  },
  {
    "op": "regroup", "id": "carry1", "objectId": "sum1", "rowId": "answer", "kind": "carry",
    "from": "ones", "to": "tens"
  },
  {
    "op": "put",
    "target": {"objectId": "sum1", "part": "cell", "rowId": "answer", "column": "tens"},
    "value": "6", "ink": "green"
  },
  {
    "op": "mark", "id": "answerCheck",
    "target": {"objectId": "sum1", "part": "row", "rowId": "answer"},
    "style": "check", "ink": "green"
  }
]
```

The `regroup` renderer draws the red transfer arrow and the small carry `1`. It computes the value from the operands and current carries. The ones highlight stays behind the writing. The check appears beside the completed green answer. This reproduces the requested elements without model-supplied coordinates. It does not claim a visual match to the unseen demo.

For subtraction, a `borrow` transfers one unit from the next higher place in the selected operand. It preserves the original glyph, draws a strike, and writes the replacement in its reserved lane. For `402 - 187`, first borrow hundreds into tens, then tens into ones. Keep both transfers and each crossed-out state in the event log. Do not replace the original operand string and lose the teaching history.

`put` can reveal multiplication partial-product rows and division product/remainder slots. The core checks each arithmetic step. A child may still write a wrong answer as raw ink. Do not reinterpret that ink as a validated `put` value or show a success check until its meaning and correctness are established.

### Delivery, history, and pen ownership

The application adds a transport envelope with `sessionId`, `turnId`, `commandId`, `transactionId`, `expectedRevision`, `schemaVersion`, `pageGeneration`, and `penEpoch`. The model need not invent transport metadata. Object IDs remain the model's references within that envelope.

- Apply a command only after its JSON is complete and all checks pass. Stream complete commands or complete small batches. Never render a half-parsed digit.
- Deduplicate by `commandId`. The same ID with a different payload is an error. A reconnect must not draw a second carry.
- Record both committed commands and presentation progress. The player must know which strokes the child has actually seen.
- Undo names a committed transaction. It reverses that transaction's values and owned annotations together. Reject unsafe undo when later commands depend on it, or undo the known dependent group atomically.
- `remove` deletes a named Maya annotation or object. An annotation ID permits removal of only the yellow highlight, for example.
- `clear` has explicit `maya_annotations` and `maya_objects` scopes. Neither scope changes child ink. Increment the page generation after a clear. Reject late commands for an earlier generation.
- When the child takes the pen, cancel or pause pending Maya drawing. Change the pen epoch. Accept fresh Maya drawing only when the application returns ownership. Late model output from the old epoch must fail.

Keep generated ink and child ink on separate layers. A child's eraser changes the child layer. A Maya annotation never erases source math or the child's writing. A whole-page child action can clear both only through a separate explicit UI action.

For voice, attach application-owned cue IDs to command groups. Use the speech system's actual audio position or supplied timing events. Do not assume that an estimated text duration is a word alignment. If the provider supplies only clip duration, synchronize at sentence or step boundaries and state that precision. On interruption, keep the visible completed strokes, stop pending speech, and cancel unseen steps. Resume from acknowledged visible state rather than replaying the whole turn.

## Portable implementation approach

Keep these boundaries independent:

1. **Command validation and reducer.** Pure TypeScript receives complete commands and the current semantic state. It returns a new state or a typed error.
2. **Math and layout.** Pure TypeScript calculates exact values, fixed grid positions, named anchors, bounds, and writing paths. It receives font metrics and layout constants as data.
3. **Presentation timeline.** Pure TypeScript maps a supplied playhead time to visible path lengths and event states. It does not read the wall clock or audio device itself.
4. **Platform adapters.** React DOM, Canvas, native SVG, or Skia draw paths and capture input. Storage and audio drivers remain here.

A renderer-neutral path record should contain a stable ID, owner, object/part reference, ordered pen segments, bounds, color, width in logical units, layer, and presentation cues. Keep the semantic scene beside these paths. Flattened vectors alone cannot tell Maya which marks are a carry or a denominator.

Cache final paths and cumulative segment lengths. Animate the active stroke. Keep completed strokes static. Generate fixed variation once per object. Never use fresh random perturbation during animation, seek, resize, or replay.

| Platform | Recommended implementation | Evidence and limits |
| --- | --- | --- |
| React 19 web now | Native SVG paths for Maya's math and writing. Use a separate child-ink layer with `perfect-freehand`. A canvas input layer can retain the current coalesced pointer handling. Use one shared page transform. | Native SVG needs no canvas-editor React dependency. The SVG standard defines path dashing. No integration build or input-latency measurement was run. |
| Expo later, normal scene size | Thin `react-native-svg` renderer for the same path records. Use a native gesture adapter for child input. | Expo documents Path, ClipPath, interactivity, and animation support. It includes native SVG in Expo Go. Use `expo install` for the selected SDK. Browser CSS animation does not transfer automatically. [Expo SVG documentation](https://docs.expo.dev/versions/latest/sdk/svg/), [library repository](https://github.com/software-mansion/react-native-svg). |
| Expo later, dense scenes or demanding input | Skia path renderer using the same pen segments. Use path trimming for open strokes. Use a suitable mask or prefix outline for pressure ink. | Current maintainer docs accept SVG path data and expose normalized `start`/`end` trim values. [Skia path documentation](https://wcandillon.github.io/react-native-skia/docs/shapes/path/). No native benchmark was run. |

Skia documentation and package names are changing. The current repository redirects from Shopify to the maintainer repository and distinguishes current and v2 documentation. The inspected v2 install page states React 19 and React Native 0.79 minimums. Select the Expo-compatible version at implementation time. Do not copy an old installation command into the plan as a verified native dependency set. [Maintainer repository](https://github.com/wcandillon/react-native-skia), [v2 installation guide](https://wcandillon.github.io/react-native-skia/v2/docs/getting-started/installation/).

An initial SVG renderer gives the web app a direct path to native SVG. Skia remains an alternative if measurements justify it. Neither requires a new layout engine. Tldraw and Excalidraw remain useful references for interaction and protocol ideas. Their complete editor scene formats should not become Maya's portable domain model.

## Required verification before implementation approval

These are proposed checks. They were not run during this research task.

| Subsystem | What would prove the recommendation wrong | Check and evidence required |
| --- | --- | --- |
| Commands | A valid teaching step requires raw screen geometry, or repeated IDs create extra objects. | Run complete scripted lessons for all listed representations. Retry commands immediately. Test deleted and wrong-kind targets. Count every accepted, rejected, and duplicated command. |
| Layout | Digits overlap, place values misalign, or new work moves child ink. | Generate operand and annotation cases. Include `27 + 39`, `999 + 1`, `402 - 187`, `23 × 14`, `156 ÷ 12`, `1005 ÷ 5`, decimal arithmetic, mixed fractions, and negative/fractional number lines. Inspect bounds and rendered outputs at narrow phone, tablet, and desktop sizes. |
| Font | A required symbol is missing, or small digits cannot be read. | Audit the complete required glyph set. Inspect the actual pen route for every digit and operator. Test small carry digits and distinctions such as `1/l`, `0/O`, and `6/8` with intended readers. |
| Ink and ownership | Maya changes child strokes, or a late command draws after pen transfer. | Draw and transfer the pen concurrently. Test erase, undo, clear, interruption, and reconnect with no artificial delay. Preserve separate author records. |
| Replay and audio | A resumed call changes completed geometry or mentions an unseen carry. | Seek, pause, interrupt during a glyph, resize, reload, and reconnect while speech and drawing run. Compare visible-state acknowledgements with the audio playhead and persisted events. |
| Native renderer | Shared geometry renders differently or input becomes delayed. | Run the same saved scene and timeline on the chosen Expo version, iOS, and Android. Measure input latency and frame time. A web result does not close this check. |

The code read proved that the existing test board has recoverable timed child strokes and deterministic replay rules. It did not prove Maya's semantic layout, multi-author editing, speech synchronization, or native behavior. The source research established feasible components and relevant prior approaches. It did not establish a complete ready-made Maya board.

## Recommendation and top risks

Adopt the **15-command semantic vocabulary** above as the starting proposal. Use named object parts and strict complete-command validation. Have code calculate carry, borrow, and layout values. Keep typed representations for each math model. Test the vocabulary on full lessons before making it stable.

Build a **pure TypeScript grid and anchor layout core**. Keep exact arithmetic, semantic state, glyph metrics, and path timing outside React and platform APIs. Reserve writing lanes in advance. Freeze the logical page while the child writes.

Use **SVG open paths for Maya on the web**, with ordered dash animation. Use **perfect-freehand for child ink**. Add **Rough.js only for selected decorations** if the result remains clear. Start the native adapter with **react-native-svg**. Use **Skia** if later measurements justify it.

Use **EMS Tech open SVG glyphs as the first font candidate**. Keep Relief SingleLine open SVG as the legibility fallback. Supply owned paths for the mathematical minus, check mark, rules, and arrowheads. Preserve the source font license and credits. Font adoption remains conditional on stroke-order and child-readability checks.

The top risks are:

1. **Incorrect teaching state.** Valid JSON can still contain wrong math or an unsuitable explanation. Check arithmetic independently. Preserve original and regrouped values.
2. **Speech and drawing disagreement.** Duration estimates and late model output can put speech ahead of the board. Use actual playback timing, visible-state acknowledgements, and cancellation epochs.
3. **Poor glyph routes or readability.** A stroke font can retrace lines or produce weak small digits. Inspect the required routes. Replace weak glyphs with owned paths.
4. **Overflow and notation differences.** Borrow chains and division need more room than simple sums. Define the school's notation rules. Reserve space and continue on a new page when necessary.
5. **Loss of child work.** Global erasing, reflow, and broad undo can damage a shared board. Separate ownership, preserve child ink, and reject unsafe edits.
6. **Unproven native behavior.** Shared paths reduce duplicate work, but they do not prove renderer performance or pen input. Verify the selected Expo and renderer versions on devices.

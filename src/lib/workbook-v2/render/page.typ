// Draws the page model and nothing more. Every position and size comes from the model, in points. The run that reports
// what came out has the input "report"; it draws the same pages, with marks of no size.
#let model = json("pages.json")
#assert(str(sys.version) == model.typst, message: "expected Typst " + model.typst + " and this is " + str(sys.version))

#let points(n) = n * 1pt
#let colors = (black: black)
#let sides = (left: left, center: center, right: right)
#let origin = top + left
#let reports = "report" in sys.inputs

// Puts a rectangle of the page inside another one that starts at `from`.
#let corner = (x: 0, y: 0)
#let put(rect, from, body) = place(
  origin,
  dx: points(rect.x - from.x),
  dy: points(rect.y - from.y),
  block(width: points(rect.w), height: points(rect.h), body),
)

// Says where a region came out, measured on the finished page.
#let report(id) = layout(size => context {
  let at = here().position()
  place(origin)[#metadata((
    id: id,
    sheet: at.page,
    x: at.x / 1pt,
    y: at.y / 1pt,
    w: size.width / 1pt,
    h: size.height / 1pt,
  )) <position>]
})

// Says where a text starts or ends on its line. A box is part of the line, so this is the place after the alignment.
#let end-of(label) = box(context {
  let at = here().position()
  [#metadata((x: at.x / 1pt, y: at.y / 1pt)) #label]
})

// Says which text came out, where, how large it is, and how large it would be with all the room it wants. It reads the
// finished text, so it also sees text that is not in the model.
#let report-text(it) = {
  context {
    let at = here().position()
    let size(top, bottom) = measure({ set text(top-edge: top, bottom-edge: bottom); it })
    let line = size("cap-height", "baseline")
    [#metadata((
      text: it.text,
      sheet: at.page,
      x: at.x / 1pt,
      y: at.y / 1pt,
      size: text.size / 1pt,
      weight: text.weight,
      width: line.width / 1pt,
      capitals: line.height / 1pt,
      above: size("bounds", "baseline").height / 1pt,
      below: (size("cap-height", "bounds").height - line.height) / 1pt,
    )) <drawn>]
  }
  end-of(<start>)
  it
  end-of(<end>)
}

#let drawers = (
  fill: ink => rect(width: points(ink.rect.w), height: points(ink.rect.h), fill: colors.at(ink.color), stroke: none),
  outline: ink => rect(
    width: points(ink.rect.w),
    height: points(ink.rect.h),
    fill: none,
    stroke: points(ink.width) + colors.at(ink.color),
  ),
  text: ink => align(
    sides.at(ink.align) + horizon,
    text(size: points(ink.size), weight: ink.weight, fill: colors.at(ink.color), ink.text),
  ),
  // Each piece is a box, which is never broken, so a line ends only between two pieces or two tokens.
  flow: ink => {
    set par(leading: points(ink.leading), justify: false, linebreaks: "simple")
    set text(size: points(ink.size), weight: ink.weight, fill: colors.at(ink.color), top-edge: "ascender", bottom-edge: "descender", hyphenate: false)
    for (i, token) in ink.tokens.enumerate() {
      if i > 0 [ ]
      for piece in token.pieces { box(piece) }
    }
  },
)

#set document(date: none)
#set text(font: "Geist", fallback: false, lang: "en", top-edge: "cap-height", bottom-edge: "baseline")
#show text: it => if reports { report-text(it) } else { it }

#for (i, sheet) in model.pages.enumerate() {
  set page(width: points(sheet.size.w), height: points(sheet.size.h), margin: 0pt, fill: white)
  if i > 0 { pagebreak() }
  for region in sheet.regions {
    put(region.rect, corner, {
      if reports { report(region.id) }
      for ink in region.ink { put(ink.rect, region.rect, drawers.at(ink.kind)(ink)) }
    })
  }
}

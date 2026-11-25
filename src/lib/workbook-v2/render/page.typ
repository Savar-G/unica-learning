// Draws the page model and nothing more. Every position and size comes from the model, in points.
#let model = json("pages.json")
#assert(str(sys.version) == model.typst, message: "expected Typst " + model.typst + " and this is " + str(sys.version))

#let points(n) = n * 1pt
#let colors = (black: black)
#let sides = (left: left, center: center, right: right)
#let origin = top + left

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

// Says which text came out, and where. It reads the finished text, so it also sees text that is not in the model.
#let report-text(it) = {
  context {
    let at = here().position()
    [#metadata((text: it.text, sheet: at.page, x: at.x / 1pt, y: at.y / 1pt)) <drawn>]
  }
  it
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
)

#set document(date: none)
#set text(font: "Geist", fallback: false, lang: "en", top-edge: "cap-height", bottom-edge: "baseline")
#show text: report-text

#for (i, sheet) in model.pages.enumerate() {
  set page(width: points(sheet.size.w), height: points(sheet.size.h), margin: 0pt, fill: white)
  if i > 0 { pagebreak() }
  for region in sheet.regions {
    put(region.rect, corner, {
      report(region.id)
      for ink in region.ink { put(ink.rect, region.rect, drawers.at(ink.kind)(ink)) }
    })
  }
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WhyThisBook } from "./why-this-book";

it("explains limited evidence and why a secure topic is still taught", () => {
  const html = renderToStaticMarkup(createElement(WhyThisBook, { why: { start: "Start at U16", inputs: [], pages: [], warnings: [] } }));
  expect(html).toContain("Early sign means one more answer could change it");
  expect(html).toContain("A topic can look secure after only 1 to 3 test questions");
  expect(html).toContain("We still teach it from step 1 because that evidence is limited");
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Privacy from "./privacy/page";
import Terms from "./terms/page";

it.each([["privacy", Privacy], ["terms", Terms]] as const)("shows the approved chat wording and date on %s", (_name, Page) => {
  const html = renderToStaticMarkup(createElement(Page)).replace(/&#x27;/g, "'");
  expect(html).toContain("Chat with Maya opens when your family's plan starts.");
  expect(html).not.toMatch(/We open chat[^.]*in\s+stages/);
  expect(html).toContain(_name === "privacy" ? "Updated 12 November 2026" : "Updated 9 November 2026");
});

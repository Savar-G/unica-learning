import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StartedPlan } from "@/components/start-plan";

const render = (access: "open" | "pending", confirmation = "sent") => renderToStaticMarkup(createElement(StartedPlan, { firstChargeAt: "2026-12-08T20:00:00.000Z", access, confirmation }));

it("a start with access open shows the first charge and no warning", () => {
  const html = render("open");
  expect(html).toContain("Started. First charge");
  expect(html).not.toContain("role=\"alert\"");
});

it("a start whose plan state write failed says that access is not open yet, and what opens it", () => {
  const html = render("pending");
  expect(html).toContain("Started. First charge");
  expect(html).toContain("The plan started in Stripe, but this child cannot use Unica yet");
  expect(html).toContain("The daily plan check opens it in its next run, which comes every 15 minutes");
  expect(html).toContain("the next Stripe event for this family opens it before that");
  expect(html).toContain("Do not start another plan.");
  expect(html).not.toContain("free month email");
});

it("both warnings show together when both are true", () => {
  const html = render("pending", "not_sent");
  expect(html.match(/role="alert"/g)).toHaveLength(2);
  expect(html).toContain("free month email");
});

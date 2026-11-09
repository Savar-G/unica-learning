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

it("a start whose plan state write did not answer says access could not be confirmed, and promises no recovery", () => {
  const html = render("pending");
  expect(html).toContain("Started. First charge");
  expect(html).toContain("The plan started in Stripe, but we could not confirm that this child can use Unica.");
  expect(html).toContain("Automatic checks will try again.");
  expect(html).toContain("Check this child&#x27;s plan state later today.");
  expect(html).toContain("Do not start another plan.");
  // The write may have stored and lost its answer, and a long Stripe outage holds the checks: the note claims neither outcome.
  expect(html).not.toMatch(/cannot use Unica yet|opens it|every 15 minutes|before that/);
  expect(html).not.toContain("free month email");
});

it("both warnings show together when both are true", () => {
  const html = render("pending", "not_sent");
  expect(html.match(/role="alert"/g)).toHaveLength(2);
  expect(html).toContain("free month email");
});

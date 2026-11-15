import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { buildView, familyBounds, parseFamilies, parseSums } from "@/lib/child-unit-cost";
import { ChildUnitCostPage } from "@/components/admin-child-unit-cost";

vi.mock("server-only", () => ({}));

const now = Date.parse("2026-11-14T20:00:00Z");
const families = parseFamilies([{ parent_id: "00000000-0000-0000-0000-000000000001", children: [{ id: "00000000-0000-0000-0000-000000000002", plan_kind: "paying", monthly_cents: 5999 }] }]);
const view = (aiUsd: number, voiceMicros: number) => buildView({ families, bounds: familyBounds(families, "2026-11"), month: "2026-11", rate: 1.4, now, withTests: false, budget: [],
  sums: parseSums({ sums: [{ parent_id: families[0].parentId, child_id: families[0].children[0].id, ai_usd: aiUsd, voice_micros: voiceMicros, calls: 1 }] }).sums });

it("says the columns can differ from the total by rounding", () => {
  const v = view(0.003, 4000);
  expect(v.rows[0]).toMatchObject({ aiCents: 0, voiceCents: 0, physicalCents: 0, totalCents: 1 });
  const html = renderToStaticMarkup(createElement(ChildUnitCostPage, { view: v, monthKey: "0" }));
  expect(html).toContain("the columns can differ from the total by a cent of rounding");
});

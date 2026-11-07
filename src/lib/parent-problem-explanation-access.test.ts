import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
const f = vi.hoisted(() => ({ marking: false, scopes: [] as unknown[] }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async (_db: unknown, _parent: unknown, _env: unknown, scope: unknown) => { f.scopes.push(scope); return f.marking; } }));
vi.mock("@/lib/parent-problem-explanation-store", () => ({ parentExplanationStore: () => ({}) }));
vi.mock("@/lib/parent-problem-explanation-ai", () => ({ explanationAiClient: () => ({}) }));
vi.mock("@/lib/parent-problem-explanation", () => ({ explainParentProblem: vi.fn() }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { explainParentProblem } from "@/lib/parent-problem-explanation";
import { explanationPlanOpen, parentProblemExplanation } from "@/lib/parent-problem-explanation-server";

type Row = Record<string, unknown>;
const fake = (tables: Record<string, Row[]>, fail = "") => ({
  from(table: string) {
    const filters: [string, unknown][] = [];
    const chain = {
      select: () => chain,
      eq(column: string, value: unknown) { filters.push([column, value]); return chain; },
      async maybeSingle() {
        if (table === fail) return { data: null, error: { message: "down" } };
        return { data: (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null };
      },
    };
    return chain;
  },
}) as unknown as SupabaseClient<Database>;

const photo = (id: string, child: string, parent = "p1") => ({ id, child_id: child, parent_id: parent });
const plan = (child: string, kind: string) => ({ parent_id: "p1", child_id: child, kind, next_charge_at: null, ends_at: null, monthly_cents: 7999, ending_free: false });
const db = fake({ scan_photos: [photo("open-photo", "open"), photo("sibling-photo", "sibling"), photo("other-family", "open", "p2")], child_plan_states: [plan("open", "paying"), plan("sibling", "ended")] });

beforeEach(() => { f.marking = false; f.scopes = []; });

/** The rule the feature checks again while it works, through its public entry. */
const activeRule = async (parent: string, photo: string, session = true) => {
  let rule: (() => Promise<boolean>) | undefined;
  vi.mocked(explainParentProblem).mockImplementation(async (_store, _ref, _token, _client, options) => { rule = options?.active; return { status: "refused" }; });
  await parentProblemExplanation(db, { parent, photo, itemId: "item", version: 1 }, async () => session, new AbortController().signal);
  return rule!();
};

it("the photo's child's open plan opens Explain, and not a sibling's photo", async () => {
  expect(await explanationPlanOpen(db, "p1", "open-photo")).toBe(true);
  expect(await explanationPlanOpen(db, "p1", "sibling-photo")).toBe(false);
  expect(await activeRule("p1", "open-photo")).toBe(true);
  expect(await activeRule("p1", "sibling-photo")).toBe(false);
});

it("another family's photo and an unknown photo stay closed", async () => {
  expect(await explanationPlanOpen(db, "p1", "other-family")).toBe(false);
  expect(await explanationPlanOpen(db, "p1", "no-photo")).toBe(false);
});

it("marking admission keeps working, with no plan, scoped to the photo", async () => {
  f.marking = true;
  expect(await activeRule("p1", "sibling-photo")).toBe(true);
  expect(f.scopes).toEqual([{ photo: "sibling-photo" }]);
});

it("a signed-out session closes it, whatever the gates say", async () => {
  f.marking = true;
  expect(await activeRule("p1", "open-photo", false)).toBe(false);
});

it("fails closed when a read fails", async () => {
  const photos = { scan_photos: [photo("open-photo", "open")], child_plan_states: [plan("open", "paying")] };
  expect(await explanationPlanOpen(fake(photos, "scan_photos"), "p1", "open-photo")).toBe(false);
  expect(await explanationPlanOpen(fake(photos, "child_plan_states"), "p1", "open-photo")).toBe(false);
});

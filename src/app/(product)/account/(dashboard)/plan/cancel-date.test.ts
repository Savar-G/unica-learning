// @vitest-environment happy-dom
import {act} from "react";
import {createRoot} from "react-dom/client";
import { expect, it, vi } from "vitest";
import PlanPage from "./page";



vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/plan", useRouter: () => ({}), redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
const f = vi.hoisted(() => ({ dashboard: null as unknown, plans: [] as unknown[], pending: new Map<string, "pause" | "restart" | "cancel">() }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => f.dashboard }));
vi.mock("@/lib/plan-controls-server", () => ({ familyPendingControls: async () => f.pending }));
vi.mock("@/lib/parent-plan-server", () => ({ familyPlans: async () => f.plans }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({
    from: () => ({
      select: () => {
        const query = { order: () => query, maybeSingle: async () => ({ data: { postal: null, time_zone: "America/Vancouver" } }), then: (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data: [{ id: "c1", created_at: "2026-01-01", province: "BC" }] }) };
        return query;
      },
    }),
  }),
}));

it("confirms the period end while the plan text shows the later charge", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  f.dashboard={children:[]};
  f.plans=[{cardId:"card-1",childName:"Leah",plan:{kind:"paying",nextCharge:"2027-01-15T18:00:00Z",cancelAt:"2027-01-01T18:00:00Z",monthly:79.99}}];
  const container=document.createElement("div"),root=createRoot(container);
  document.body.append(container);
  try {
    const page=await PlanPage();await act(async()=>root.render(page));
    const cancel=[...container.querySelectorAll("button")].find(b=>b.textContent==="Cancel plan")!;
    await act(async()=>cancel.click());
    expect(container.textContent).toContain("The plan ends on January 1, 2027");
    expect(container.textContent).not.toContain("The plan ends on January 15, 2027");
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StopWorkbookRun } from "./stop-workbook-run";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let root: Root | undefined, host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); vi.unstubAllGlobals(); router.refresh.mockClear(); });
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
async function request(response: () => Promise<Response>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn(response); vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(StopWorkbookRun, { runId: "run-a", started: true, pages: 20 })));
  expect(fetcher).not.toHaveBeenCalled(); await click("Stop this run"); expect(fetcher).not.toHaveBeenCalled();
  await click("Yes, stop it"); expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith("/api/admin/workbook-runs/run-a/stop", { method: "POST" });
}

it("keeps the outcome unknown if the database committed Stop but its response was lost", async () => {
  let committed = false;
  await request(async () => { committed = true; return Response.json({ ok: false, error: "unavailable" }, { status: 503 }); });
  expect(committed).toBe(true); expect(host.textContent).toContain("Reload the page to see whether the run stopped");
  expect(host.textContent).not.toContain("The stop did not work"); expect(router.refresh).not.toHaveBeenCalled();
});
it.each(["true", "false", 1, {}, null])("does not confirm a malformed success value %j", async (ok) => {
  await request(async () => Response.json({ ok }));
  expect(router.refresh).not.toHaveBeenCalled(); expect(host.textContent).toContain("Yes, stop it");
  expect(host.textContent).toContain("Reload the page to see whether the run stopped");
});
it("requires both HTTP success and boolean true", async () => {
  await request(async () => Response.json({ ok: true }, { status: 500 }));
  expect(router.refresh).not.toHaveBeenCalled(); expect(host.textContent).toContain("Yes, stop it");
});
it("accepts a valid success and refreshes the stored state", async () => {
  await request(async () => Response.json({ ok: true }));
  expect(router.refresh).toHaveBeenCalledOnce(); expect(host.textContent).not.toContain("Yes, stop it");
});
it.each(["done", "failed", "stale"])("refreshes a confirmed 409 %s state", async (error) => {
  await request(async () => Response.json({ ok: false, error }, { status: 409 }));
  expect(router.refresh).toHaveBeenCalledOnce(); expect(host.textContent).toContain("before the stop");
});
it.each([403, 404])("does not infer the current run state from HTTP %s", async (status) => {
  await request(async () => new Response("", { status }));
  expect(router.refresh).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("the run is still going");
  expect(host.textContent).toContain("Yes, stop it");
});
it("retains an unknown outcome after a transport failure", async () => {
  await request(async () => { throw new Error("response lost"); });
  expect(router.refresh).not.toHaveBeenCalled(); expect(host.textContent).toContain("Reload the page to see whether the run stopped");
});

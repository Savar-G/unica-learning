import { afterEach, beforeEach, expect, it, vi } from "vitest";
const write = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openrouter-provider-receipts-store", () => ({ insertProviderReceipts: write }));
import { POST } from "./route";
import { UNICA_WORKSPACE_ID } from "@/lib/openrouter-workspace";

const secret = "synthetic-webhook-secret-".repeat(3);
beforeEach(() => {
  vi.clearAllMocks();
  write.mockResolvedValue(undefined);
  vi.stubEnv("OPENROUTER_USAGE_WEBHOOK_SECRET", secret);
  vi.stubEnv("OPENROUTER_USAGE_WORKSPACE_ID", UNICA_WORKSPACE_ID);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const connection = () => new Request("https://example.invalid/api/openrouter-usage", {
  method: "POST", body: "{}", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-test-connection": "true" },
});

it("accepts the authenticated Unica connection test without a receipt", async () => {
  expect((await POST(connection())).status).toBe(204);
  expect(write).not.toHaveBeenCalled();
});
it.each(["dfc4dd09-09bb-5b8d-98e2-f84f4f7a9f69", "", "another-workspace"])("refuses foreign or missing configuration before body access: %s", async (workspace) => {
  vi.stubEnv("OPENROUTER_USAGE_WORKSPACE_ID", workspace);
  const request = connection();
  const body = vi.spyOn(request, "body", "get").mockImplementation(() => { throw new Error("Body must not be read"); });
  const response = await POST(request);
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("");
  expect(body).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});
it("does not accept another workspace named by the payload", async () => {
  const payload = { resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "openrouter" } }] }, scopeSpans: [{ spans: [{
    startTimeUnixNano: "1794862800000000000", attributes: [
      { key: "gen_ai.response.id", value: { stringValue: "gen-synthetic-workspace-guard" } },
      { key: "gen_ai.response.model", value: { stringValue: "test/model" } },
      { key: "gen_ai.usage.total_cost", value: { doubleValue: 0.01 } },
      { key: "span.metadata.openrouter_generation.workspace_id", value: { stringValue: "dfc4dd09-09bb-5b8d-98e2-f84f4f7a9f69" } },
    ],
  }] }] }] };
  const response = await POST(new Request("https://example.invalid/api/openrouter-usage", {
    method: "POST", body: JSON.stringify(payload), headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
  }));
  expect(response.status).toBe(400); expect(write).not.toHaveBeenCalled();
});

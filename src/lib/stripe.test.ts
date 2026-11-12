import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { reportCardSetupUrl, type ReportCardSetup } from "@/lib/stripe";

vi.mock("server-only", () => ({}));

const setup: ReportCardSetup = {
  ref: "card-ref", name: "Test Parent", email: "parent@example.com", plan: "one", subject: "Math",
  grade: 3, price: 79.99, curriculum: "bc", postal: null, origin: "https://unica.test",
  parentId: "parent", childId: "child", assessmentId: "assessment", reportId: "report",
  customerId: "cus_shipping", cancelPath: "/account/reports/report",
};

describe("shipping at card setup", () => {
  it("collects and saves a Canadian shipping address without starting a charge", async () => {
    const requests: { url: string; body: URLSearchParams }[] = [];
    const client = new Stripe("sk_test_shipping", {
      httpClient: Stripe.createFetchHttpClient(async (url, init) => {
        requests.push({ url: String(url), body: new URLSearchParams(String(init?.body)) });
        return new Response(JSON.stringify(String(url).endsWith("/customers")
          ? { id: "cus_shipping" }
          : { id: "cs_test_shipping", url: "https://checkout.stripe.com/test-shipping" }), { status: 200 });
      }),
    });
    await reportCardSetupUrl(client, "cus_shipping", setup);

    const checkout = requests.find((r) => r.url.endsWith("/checkout/sessions"))?.body;
    expect(checkout).toBeDefined();
    expect(checkout?.get("shipping_address_collection[allowed_countries][0]")).toBe("CA");
    expect(checkout?.get("customer_update[shipping]")).toBe("auto");
    expect(checkout?.get("customer")).toBe("cus_shipping");
    expect(checkout?.get("custom_text[shipping_address][message]")).toContain("ship your workbook");
    expect(checkout?.get("mode")).toBe("setup");
    expect(checkout?.get("custom_text[submit][message]")).toContain("Your family gets one free month. It starts when your first workbook arrives.");
    expect(requests.some((r) => /\/(subscriptions|payment_intents)$/.test(r.url))).toBe(false);
  });
});

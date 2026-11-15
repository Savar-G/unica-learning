import { describe, expect, it } from "vitest";
import { bareRequest } from "@/lib/sentry-tunnel";

describe("bareRequest", () => {
  it("keeps the body and only the content and browser headers", async () => {
    const request = new Request("https://unicalearning.com/monitoring?o=1", {
      method: "POST",
      body: "envelope",
      headers: {
        "content-type": "text/plain;charset=UTF-8", "user-agent": "UA",
        "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "1.2.3.4", "cf-connecting-ip": "1.2.3.4",
        referer: "https://unicalearning.com/tutor/p/secret", origin: "https://unicalearning.com", cookie: "sb=x",
      },
    });
    const bare = bareRequest(request);
    expect([...bare.headers.keys()].sort()).toEqual(["content-type", "user-agent"]);
    expect(await bare.text()).toBe("envelope");
  });
});

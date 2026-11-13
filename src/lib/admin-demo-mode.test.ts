import { describe, expect, it } from "vitest";
import { demoAllowed, demoRequested } from "@/lib/admin-demo-mode";

describe("the ?demo=1 view of the admin insight pages", () => {
  it("is allowed only in a development build outside Vercel", () => {
    expect(demoAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(demoAllowed({ NODE_ENV: "development", VERCEL_ENV: "development" })).toBe(true);
  });

  it("is ignored in production, in a preview and in a test or unknown build", () => {
    expect(demoAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(demoAllowed({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false);
    expect(demoAllowed({ NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
    expect(demoAllowed({ NODE_ENV: "development", VERCEL_ENV: "preview" })).toBe(false);
    expect(demoAllowed({ NODE_ENV: "test" })).toBe(false);
    expect(demoAllowed({})).toBe(false);
  });

  it("needs both the address and the environment", () => {
    expect(demoRequested({ demo: "1" }, { NODE_ENV: "development" })).toBe(true);
    expect(demoRequested({ demo: "1" }, { NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false);
    expect(demoRequested({ demo: "1" }, { NODE_ENV: "development", VERCEL_ENV: "preview" })).toBe(false);
    expect(demoRequested({}, { NODE_ENV: "development" })).toBe(false);
    expect(demoRequested({ demo: ["1", "1"] }, { NODE_ENV: "development" })).toBe(false);
    expect(demoRequested({ demo: "0" }, { NODE_ENV: "development" })).toBe(false);
  });
});

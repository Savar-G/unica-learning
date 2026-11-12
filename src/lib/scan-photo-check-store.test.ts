import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { photoCheckClient } from "@/lib/scan-photo-check-store";

describe("the photo check's client (#855)", () => {
  it("is on only with the decision key, makes one try, and ignores the development fake in production", () => {
    expect(photoCheckClient({})).toBeNull();
    expect(photoCheckClient({ OPENROUTER_API_KEY: "sk-or-other" })).toBeNull();
    const live = photoCheckClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d" });
    expect([live?.model, live?.maxAttempts]).toEqual(["typesafe/jev-1.14", 1]);
    // A model outside the pinned table turns the check off instead of failing the preview.
    expect(photoCheckClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d", DECISION_MODEL: "someone/else" })).toBeNull();
    expect(photoCheckClient({ NODE_ENV: "production", PHOTO_CHECK_FAKE: "blurry" })).toBeNull();
    expect(photoCheckClient({ NODE_ENV: "development", PHOTO_CHECK_FAKE: "blurry" })?.model).toBe("fake/photo-check");
  });
});

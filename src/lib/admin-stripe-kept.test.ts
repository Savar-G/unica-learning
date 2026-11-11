import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { KEEP_MS, forgetAdminStripeReads, keptCardAnswer, keptSubscriptions } from "@/lib/admin-stripe-kept";

beforeEach(() => forgetAdminStripeReads());

it("asks Stripe for the subscriptions once while the kept list is fresh, then again", async () => {
  const read = vi.fn(async () => ["sub_1"]);
  expect(await keptSubscriptions(read, 1_000)).toEqual(["sub_1"]);
  expect(await keptSubscriptions(read, 1_000 + KEEP_MS - 1)).toEqual(["sub_1"]);
  expect(read).toHaveBeenCalledTimes(1);
  await keptSubscriptions(read, 1_000 + KEEP_MS);
  expect(read).toHaveBeenCalledTimes(2);
});

it("never keeps a failed subscription read", async () => {
  const failing = vi.fn(async () => { throw new Error("stripe down"); });
  await expect(keptSubscriptions(failing, 0)).rejects.toThrow("stripe down");
  const read = vi.fn(async () => ["sub_2"]);
  expect(await keptSubscriptions(read, 1)).toEqual(["sub_2"]);
});

it("keeps a card's saved or not-saved answer, never an unknown one", async () => {
  const saved = vi.fn(async () => ({ state: "saved" as const }));
  await keptCardAnswer("card-a", saved, 0);
  await keptCardAnswer("card-a", saved, 10);
  expect(saved).toHaveBeenCalledTimes(1);
  const unknown = vi.fn(async () => ({ state: "unknown" as const }));
  await keptCardAnswer("card-b", unknown, 0);
  await keptCardAnswer("card-b", unknown, 10);
  expect(unknown).toHaveBeenCalledTimes(2);
});

it("asks Stripe again after a plan change forgets the kept answers", async () => {
  const read = vi.fn(async () => ["sub_3"]);
  const card = vi.fn(async () => ({ state: "none" as const }));
  await keptSubscriptions(read, 0);
  await keptCardAnswer("card-c", card, 0);
  forgetAdminStripeReads();
  await keptSubscriptions(read, 1);
  await keptCardAnswer("card-c", card, 1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(card).toHaveBeenCalledTimes(2);
});

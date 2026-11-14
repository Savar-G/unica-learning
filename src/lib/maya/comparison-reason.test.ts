import { expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { COMPARISON_PRACTICE } from "@/lib/maya-practice/comparison-cases";

vi.mock("server-only", () => ({}));
async function ready(id: string, work = true) {
  const c = COMPARISON_PRACTICE.find(c => c.id === id)!;
  let now = 1000;
  const session = createTextSession({ callId: "comparison-reason", package: FIXTURES[c.fixture], clock: () => now,
    model: { id: "offline", promptVersion: "test", output: 3, propose: async () => { throw new Error("offline"); } } });
  await session.start();
  if (work) for (const input of c.fakeScript.slice(0, -2)) { now += 1000; await session.child(input); }
  return { session, child: async (input: string) => { now += 1000; return session.child(input); } };
}
const answers = [
  ["CMP1", "I circle true, because 5 is greater than 3."],
  ["CMP1", "The answer is true, because 5 is greater than 3."],
  ["CMP2", "I will write 7 by 6, because 42 is bigger than 30."],
  ["CMP2", "Since 42 is bigger than 30, I'll write 7 by 6."],
  ["CMP3", "The answer is even, because 3 is greater than 1."],
] as const;
it.each(answers)("credits the final label with its checked reason for %s: %s", async (id, text) => {
  const c = await ready(id);
  expect(c.session.session.done.length).toBeGreaterThan(0);
  await c.child(text);
  expect(c.session.session.solved).toBe("child");
});
it.each(answers)("a reason cannot bypass prior work for %s: %s", async (id, text) => {
  const c = await ready(id, false);
  await c.child(text);
  expect(c.session.session.solved).toBeNull();
});
it.each([
  ["CMP1", "The answer is true, because 5 is less than 3."],
  ["CMP1", "Maybe the answer is true, because 5 is greater than 3."],
  ["CMP1", "My teacher says true, because 5 is greater than 3."],
  ["CMP1", "Is the answer true, because 5 is greater than 3?"],
  ["CMP1", "The answer is false, because 5 is greater than 3."],
  ["CMP2", "The answer is 7 by 6, because 43 is bigger than 30."],
  ["CMP2", "The answer is 5 by 6, because 42 is bigger than 30."],
  ["CMP3", "The answer is even, because 3 is less than 1."],
] as const)("refuses a wrong, uncertain, attributed or unrelated final for %s: %s", async (id, text) => {
  const c = await ready(id);
  await c.child(text);
  expect(c.session.session.solved).toBeNull();
});

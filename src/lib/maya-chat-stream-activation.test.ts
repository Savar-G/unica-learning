import { expect, it } from "vitest";
import { mayaChatStreamEnabled, MAYA_CHAT_STREAM_NOT_BEFORE } from "@/lib/maya-chat-stream-activation";

// Falsifier: any non-on value or any time before the final reader deadline permits sentence writes.
it.each([undefined, "", "off", "ON", "On", " on", "on ", "on\n", "true", "1", "yes", "enabled"])("keeps %j off after the deadline", value => {
  expect(mayaChatStreamEnabled(value, MAYA_CHAT_STREAM_NOT_BEFORE + 1)).toBe(false);
});
it.each([
  [MAYA_CHAT_STREAM_NOT_BEFORE - 1, false],
  [MAYA_CHAT_STREAM_NOT_BEFORE, true],
  [MAYA_CHAT_STREAM_NOT_BEFORE + 1, true],
  [NaN, false], [Infinity, false], [-Infinity, false],
])("checks the trusted clock %s", (now, enabled) => {
  expect(mayaChatStreamEnabled("on", now)).toBe(enabled);
});

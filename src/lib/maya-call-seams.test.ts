import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { callSeams } from "@/lib/maya-call-seams";
import { MAYA_CHAT_STREAM_NOT_BEFORE } from "@/lib/maya-chat-stream-activation";

// D-345: the MAYA_TUTOR_FAMILIES switch. Only the exact value "on" lets the tutor core teach family calls.

vi.mock("server-only", () => ({}));

const db = {} as SupabaseClient<Database>;

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([-1, 0, 1])("binds the server writer to exact on and deadline offset %s", offset => {
  // Falsifier: the configured writer opens before the final readers' deadline, or fails to open at it.
  vi.spyOn(Date, "now").mockReturnValue(MAYA_CHAT_STREAM_NOT_BEFORE + offset);
  expect(callSeams(db, { env: { MAYA_CHAT_STREAMING_ENABLED: "on" } }).streamChat).toBe(offset >= 0);
  expect(callSeams(db, { env: {} }).streamChat).toBe(false);
  expect(callSeams(db, { env: { MAYA_CHAT_STREAMING_ENABLED: "off" } }).streamChat).toBe(false);
});

describe("callSeams: MAYA_TUTOR_FAMILIES", () => {
  it("is on only for the exact value on", () => {
    expect(callSeams(db, { env: { MAYA_TUTOR_FAMILIES: "on" } }).tutorFamilies).toBe(true);
  });

  it.each([undefined, "", "off", "ON", " on", "on ", "true", "1", "yes"])("is off for %j", (value) => {
    expect(callSeams(db, { env: value === undefined ? {} : { MAYA_TUTOR_FAMILIES: value } }).tutorFamilies).toBe(false);
  });
});

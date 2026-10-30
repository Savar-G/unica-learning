import "server-only";
import { adminClient } from "@/lib/supabase-auth";
import { parentPins, type CheckResult, type ParentPins } from "@/lib/parent-pin";
import { pinStore } from "@/lib/parent-pin-store";

/** The PIN module over the database, or null when the server has no secret key. */
export function serverPins(): ParentPins | null {
  const admin = adminClient();
  return admin && parentPins(pinStore(admin));
}

/**
 * The exit check for the child's desk (P4, spec #295): is this the PIN of the signed-in parent? The caller passes the
 * parent id from the session, never from the request. `unavailable`: the server cannot reach the store, so the desk
 * stays closed to leaving. A wrong PIN costs an attempt; see PIN_POLICY.
 */
export async function checkParentPin(parentId: string, pin: string, pins: ParentPins | null = serverPins()): Promise<CheckResult | { ok: false; error: "unavailable" }> {
  if (!pins) return { ok: false, error: "unavailable" };
  try {
    return await pins.check(parentId, pin);
  } catch (error) {
    console.error("[pin] check failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "unavailable" };
  }
}

/** What the account page's PIN form gets back, from the route (src/app/api/account/pin/route.ts). */
export type PinFormResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "current_required" | "unavailable" | "signed_out" | "bad_json" }
  | { ok: false; error: "wrong"; attemptsLeft: number }
  | { ok: false; error: "locked"; retryAt: number };

/** Set or change the signed-in parent's PIN from the account page: body `{ pin, current? }` (`current` when a PIN is set). */
export async function savePin(parentId: string, body: unknown, pins: ParentPins | null = serverPins()): Promise<{ status: number; result: PinFormResult }> {
  const { pin, current } = (body ?? {}) as { pin?: unknown; current?: unknown };
  if (typeof pin !== "string" || (current !== undefined && typeof current !== "string")) return { status: 400, result: { ok: false, error: "invalid" } };
  if (!pins) return { status: 503, result: { ok: false, error: "unavailable" } };
  try {
    const result = await pins.set(parentId, pin, current);
    if (result.ok) return { status: 200, result };
    return { status: result.error === "locked" ? 429 : result.error === "wrong" ? 403 : 400, result };
  } catch (error) {
    console.error("[pin] save failed", error instanceof Error ? error.message : error);
    return { status: 502, result: { ok: false, error: "unavailable" } };
  }
}

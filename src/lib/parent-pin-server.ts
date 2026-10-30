import "server-only";
import { adminClient } from "@/lib/supabase-auth";
import { parentPins, validPin, type CheckResult, type ParentPins } from "@/lib/parent-pin";
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

/** Whether the parent has a PIN; null when the server cannot tell (no secret key, or the read failed). */
export async function pinIsSet(parentId: string, pins: ParentPins | null = serverPins()): Promise<boolean | null> {
  if (!pins) return null;
  try {
    return await pins.isSet(parentId);
  } catch (error) {
    console.error("[pin] load failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/** What the desk's "Forgot PIN?" form gets back, from src/app/api/desk/forgot-pin/route.ts. */
export type ForgotPinResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "password_needed" | "unavailable" | "signed_out" | "bad_json" };

/**
 * Forgot PIN (#301): body `{ pin }`. `passwordProved`: the session signed in with the account password in the last few
 * minutes (passwordIsFresh in src/lib/desk.ts). Then the new PIN replaces the old one and ends any lock.
 */
export async function resetForgottenPin(parentId: string, body: unknown, passwordProved: boolean, pins: ParentPins | null = serverPins()): Promise<{ status: number; result: ForgotPinResult }> {
  const { pin } = (body ?? {}) as { pin?: unknown };
  if (!validPin(pin)) return { status: 400, result: { ok: false, error: "invalid" } };
  if (!passwordProved) return { status: 403, result: { ok: false, error: "password_needed" } };
  if (!pins) return { status: 503, result: { ok: false, error: "unavailable" } };
  try {
    await pins.reset(parentId, pin);
    return { status: 200, result: { ok: true } };
  } catch (error) {
    console.error("[pin] reset failed", error instanceof Error ? error.message : error);
    return { status: 502, result: { ok: false, error: "unavailable" } };
  }
}

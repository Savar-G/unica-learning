// Analytics consent: one stored choice, read and written only here.
// No React and no analytics code, so the banner and the settings trigger stay light.
//
// Storage: localStorage key CONSENT_KEY holds {"v":1,"analytics":"granted"|"denied","at":<ms>}.
// No stored value means the visitor has not chosen yet ("unset"), and analytics stay off.
// If the browser blocks storage, the choice lives in memory until the page reloads.
//
// Events (all on window):
// - "pagewise:consent" fires in this tab after every change.
// - "storage" fires in the other tabs when the key changes (or when storage is cleared).
// - "pagewise:consent-open" asks the banner to open (see openConsentSettings).

export type ConsentChoice = "granted" | "denied";
export type ConsentState = ConsentChoice | "unset";

export const CONSENT_KEY = "pagewise.consent.v1";
export const CONSENT_CHANGE_EVENT = "pagewise:consent";
export const CONSENT_OPEN_EVENT = "pagewise:consent-open";

// Held on globalThis so a second copy of this module (bundler chunking) shares one fallback.
type Fallback = { memory: ConsentChoice | null; persisted: boolean };
const holder = globalThis as typeof globalThis & { __pagewiseConsent?: Fallback };
const fallback = (holder.__pagewiseConsent ??= { memory: null, persisted: true });

function parse(raw: string | null): ConsentChoice | null {
  if (!raw) return null;
  try {
    const value = (JSON.parse(raw) as { v?: unknown; analytics?: unknown } | null) ?? {};
    if (value.v === 1 && (value.analytics === "granted" || value.analytics === "denied")) return value.analytics;
  } catch {}
  return null;
}

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return "unset";
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    const stored = parse(raw);
    if (stored) return stored;
    // An unreadable value counts as no choice. An empty slot after a failed write keeps the memory copy.
    if (raw === null && !fallback.persisted && fallback.memory) return fallback.memory;
    return "unset";
  } catch {
    return fallback.memory ?? "unset";
  }
}

// False when the last write was blocked, so the choice will not survive a reload.
export function isConsentPersisted(): boolean {
  return fallback.persisted;
}

export function setConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  fallback.memory = choice;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, analytics: choice, at: Date.now() }));
    fallback.persisted = true;
  } catch {
    fallback.persisted = false;
  }
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

// Calls `onChange` after a change in this tab or in another tab. Returns the unsubscribe function.
export function subscribeConsent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CONSENT_KEY) onChange();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// The footer settings trigger calls this. The banner opens again, whatever the stored choice.
export function openConsentSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

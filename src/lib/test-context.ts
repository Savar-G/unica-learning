// The test context (#185): the halfway break and the device a child takes the test on. Shared by the test screen
// (client), which works the device out from what the browser says and sends both to /api/account/assessments/[id]/context,
// and that route (server), which checks them before the test attempt module (src/lib/test-attempt.ts) saves them once
// per test. Pure: no network, database or clock. Only coarse classes are kept (no user agent string), so the record
// says nothing about the family.
import type { TestError } from "@/lib/test-api";

/** What the context route answers. The screen never waits for it: a failure never stops the child. */
export type ContextResult = { ok: true } | { ok: false; error: TestError };

/** The break screen was shown, or the child left it: "Keep going" is skipped, "I am back from my break" is rested. */
export const BREAK_EVENTS = ["shown", "rested", "skipped"] as const;
export type BreakEvent = (typeof BREAK_EVENTS)[number];
export const isBreakEvent = (v: unknown): v is BreakEvent => typeof v === "string" && (BREAK_EVENTS as readonly string[]).includes(v);

/**
 * One record of the halfway break. The end carries the break's length as the browser measured it, from the break
 * screen showing to the press. The screen sends the end at once, never after the "shown" save, so a slow save never
 * makes the break longer; when the end reaches the server first, its start is the length before it.
 */
export type BreakRecord = { event: "shown" } | { event: Exclude<BreakEvent, "shown">; lengthMs: number };

/** A break length from a request: milliseconds, 0 or more. */
export const isBreakLength = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

export const DEVICE_CLASSES = ["phone", "tablet", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** How the child pointed: a finger, a pen (an Apple Pencil or a stylus) or a mouse or trackpad. */
export const INPUT_TYPES = ["touch", "pen", "mouse"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const BROWSER_FAMILIES = ["safari", "chrome", "firefox", "edge", "samsung", "other"] as const;
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];

/** The device of one test, as the browser reports it. Screen sizes are in CSS pixels. */
export interface TestDevice {
  deviceClass: DeviceClass;
  /** Null when the child used no pointer before it was sent and the screen does not say. */
  input: InputType | null;
  screenWidth: number;
  screenHeight: number;
  browser: BrowserFamily;
}

/** The largest screen side taken, in CSS pixels. */
const SCREEN_MAX = 20_000;

/** What the browser says about itself, read by the test screen (src/components/test.tsx). */
export interface DeviceSignals {
  /** navigator.userAgent. Read here and never sent or stored. */
  userAgent: string;
  /** navigator.maxTouchPoints: an iPad says it is a Mac, but a Mac has no touch points. */
  maxTouchPoints: number;
  /** screen.width and screen.height, in CSS pixels. */
  screenWidth: number;
  screenHeight: number;
  /** The pointer type (PointerEvent.pointerType) of each press on the test page so far, oldest first. */
  pointers: readonly string[];
  /** The screen's main pointer, from the "pointer" media feature; null for none. */
  mainPointer: "coarse" | "fine" | null;
}

function classOf({ userAgent: ua, maxTouchPoints, mainPointer, screenWidth, screenHeight }: DeviceSignals): DeviceClass {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "tablet";
  if (/iPhone|iPod/.test(ua)) return "phone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "phone" : "tablet";
  if (/Mobi/.test(ua)) return "phone";
  if (/Tablet|Silk|Kindle|PlayBook/.test(ua)) return "tablet";
  // A touch screen with no mouse that names no device: its short side tells a phone from a tablet.
  if (maxTouchPoints > 0 && mainPointer === "coarse") return Math.min(screenWidth, screenHeight) < 600 ? "phone" : "tablet";
  return "desktop";
}

/** The browser family. Order matters: Samsung, Edge and Opera also say "Chrome", and Chrome says "Safari". */
function browserOf(ua: string): BrowserFamily {
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/Edg(A|iOS)?\//.test(ua)) return "edge";
  if (/OPR\/|Opera/.test(ua)) return "other";
  if (/Firefox\/|FxiOS\//.test(ua)) return "firefox";
  if (/CriOS\/|Chrome\/|Chromium\//.test(ua)) return "chrome";
  if (/AppleWebKit/.test(ua) && /Safari\//.test(ua)) return "safari";
  return "other";
}

/**
 * How the child pointed: a pen when they used one at all (a child with an Apple Pencil still taps buttons with a
 * finger), else the last finger or mouse press, else the screen's main pointer.
 */
function inputOf({ pointers, mainPointer }: DeviceSignals): InputType | null {
  if (pointers.includes("pen")) return "pen";
  const last = [...pointers].reverse().find((p): p is InputType => p === "touch" || p === "mouse");
  if (last) return last;
  return mainPointer === "coarse" ? "touch" : mainPointer === "fine" ? "mouse" : null;
}

const screenSide = (n: number) => Math.min(SCREEN_MAX, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1));

/** The device of the test, from what the browser says. Always a device the server accepts (readDevice). */
export function deviceOf(signals: DeviceSignals): TestDevice {
  return {
    deviceClass: classOf(signals),
    input: inputOf(signals),
    screenWidth: screenSide(signals.screenWidth),
    screenHeight: screenSide(signals.screenHeight),
    browser: browserOf(signals.userAgent),
  };
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const isScreenSide = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= SCREEN_MAX;

/** A device from a request, with only its known fields; null when any field is missing or not one of its values. */
export function readDevice(raw: unknown): TestDevice | null {
  if (!raw || typeof raw !== "object") return null;
  const { deviceClass, input, screenWidth, screenHeight, browser } = raw as Record<string, unknown>;
  if (!oneOf(DEVICE_CLASSES, deviceClass) || !(input === null || oneOf(INPUT_TYPES, input))) return null;
  if (!isScreenSide(screenWidth) || !isScreenSide(screenHeight) || !oneOf(BROWSER_FAMILIES, browser)) return null;
  return { deviceClass, input, screenWidth, screenHeight, browser };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { browserClient } from "@/lib/supabase-browser";
import { PHOTO_ENCODING, prepareScanPhoto, scanThumbnail, SMALLER_ENCODING } from "@/lib/scan-photo-browser";
import { addingCount, buildStack, replacementVerdict, photoCheckPending, scanPollDelay, scanWorkPending, duplicateNote, refusalCopy, roomNote, sendLabel, spreadNote, waitingNote, type DayPage, type StackPhoto, type StackTile, type StackUpload, type UploadRefusal } from "@/lib/scan-stack";
import { dayStrip, pageScore, retakeLine, scoreLine, todaysPages, type StripState, type StripTile } from "@/lib/scan-day-strip";
import { PHOTO_PROBLEM_TEXT, type PhotoCheckView, type PhotoProblem } from "@/lib/scan-photo-check-text";
import { SCANNING_COOKIE, SCANNING_SECONDS } from "@/lib/scan-tab";
import { PACIFIC_ZONE, type FamilyZone } from "@/lib/family-time";
import { scanEventTicket } from "@/lib/scan-track";
import { nextUploads, REQUEST_TIMEOUT_MS, roomWait, UPLOAD_TIMEOUT_MS, waitsForRoom } from "@/lib/scan-upload-queue";
import { workbooksPath } from "@/lib/parent-shell";
import { ScanPreview } from "@/components/scan-preview";
import "./scan-pages.css";

// Scan pages (spec #368, round r565 picked, D-269 to D-276; the screen from round r915-scan-flow, #915): tips on the first
// visit, the day as a strip of page tiles, a keep-shooting capture screen on the phone's own camera input, pages that pass
// sent for marking on their own after a short Undo, and the marks at the end. The engine below is the shared stack on the
// phone's own file input. The live camera comes later, after the real-phone test. Each photo uploads and saves as soon as it is taken or
// chosen, with no confirm per page (D-269). A batch chosen from the phone's photos goes up in any order, 2 at a time
// (D-271, #915, src/lib/scan-upload-queue.ts); a photo the server has no room for keeps its place and waits.
// Checks and Send are for test families and admins only until marking ships (D-252): the list route says which.
// Images arrive only through the checked image route, live as object URLs and are revoked when they go away.

type Mode = "phone" | "desktop";
/**
 * `reservation`: the photo id asked for at admission. It stays with the queued photo, so a lost answer takes no second upload slot.
 * `source`: the input the photo came from (#6): a camera shot is never in the phone's photos, so its retake opens the camera.
 * `replaceOf`: "Use this new photo instead" (#4): the page's ready photo this one replaces on the server.
 * `smaller`: the upload timed out once, so it is sent encoded smaller (#5).
 */
type Local = StackUpload & { file: File; replaces?: string; source?: "camera" | "library"; replaceOf?: string; smaller?: boolean };

export type ScanListing = { marking?: boolean; checks: boolean; photos: StackPhoto[]; pages: DayPage[] };

const UPLOAD_REFUSALS: readonly string[] = ["qr", "page", "duplicate", "flat", "image", "size", "frequency", "daily", "quota"];
const uploadRefusal = (code: string): UploadRefusal => (UPLOAD_REFUSALS.includes(code) ? code as UploadRefusal : "unavailable");
/** What the server says of a photo id that can no longer take an upload: the lease ended or the photo went. A new id is needed. */
const ENDED: readonly string[] = ["expired", "rejected", "deleted", "refused"];
/** Why a photo could not be sent at all: the capture tray says so on its thumbnail at once. Other refusals wait for Done. */
const SENDING_PROBLEMS: readonly string[] = ["unavailable", "size", "image", "frequency", "daily", "quota"];
/** Refusals that are not about the photo itself (#5): the photo is kept, with Try again. */
const NOT_THE_PHOTO: readonly string[] = ["unavailable", "frequency", "quota"];
/** How long "Page 27 is already scanned" shows before it clears itself (#4). */
export const DUPLICATE_NOTE_MS = 20_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** How long a photo waits before its check is asked again; a busy check (still running, #915) is asked again sooner. */
const CHECK_ASK_MS = 6000, BUSY_ASK_MS = 1500, QUICK_BUSY_ASKS = 8;
/** The stack is read this often while a page is being checked, so a finished check shows within about 2 s (#915). */
const CHECKING_POLL_MS = 2000;
const BLUR_WAIT_MS = 70_000;

/** A refused request: its code, and the rest of the server's answer (a duplicate names its page, #4). */
class ApiError extends Error {
  constructor(code: string, readonly data: Record<string, unknown> = {}) { super(code); }
}
/**
 * Every request has a time limit, so one hung upload cannot hold its slot (#915). A request past it is a lost answer:
 * "timeout", so an upload can try again smaller (#5); any other lost answer is "unavailable".
 */
async function api(path: string, init?: RequestInit, timeout = REQUEST_TIMEOUT_MS) {
  let response: Response;
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeout) : undefined;
  try { response = await fetch(path, { ...init, cache: "no-store", signal }); } catch { throw new ApiError(signal?.aborted ? "timeout" : "unavailable"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? "unavailable", data && typeof data === "object" ? data : {});
  return data;
}
/** The Undo's hold on the server (#3), in whole seconds within the route's bounds. */
const holdSeconds = (ms: number) => Math.min(600, Math.max(1, Math.ceil(ms / 1000)));
/** While the capture screen is open, the server holds the pages this long, so none sends while the parent takes photos. */
const CAPTURE_HOLD_SECONDS = 600;
/** The capture hold is written again this often while the screen stays open: 4.5 minutes, well inside its 10. */
export const CAPTURE_RENEW_MS = 270_000;
const codeOf = (error: unknown) => (error instanceof Error ? error.message : "unavailable");
/** Notes in this browser that the parent is scanning, so a page's QR code opens Scan pages for that page (src/lib/scan-tab.ts). */
function noteScanning() {
  try { document.cookie = `${SCANNING_COOKIE}=1; Max-Age=${SCANNING_SECONDS}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch {}
}

const ICONS = {
  fold: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M14 10h22v30H14z" fill="#fff" /><path d="M14 10l-6 3v30l6-3" fill="#ddd" /><path d="M19 17h12M19 22h12M19 27h8" strokeWidth="1.4" /></svg>,
  light: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="24" cy="24" r="8" fill="#ffc93c" /><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4" /></svg>,
  corners: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 15V9h6M30 9h6v6M12 33v6h6M30 39h6v-6" /><rect x="17" y="15" width="14" height="18" fill="#fff" strokeWidth="1.2" /></svg>,
  camera: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4.5 4.5L19 7" /></svg>,
  // The fifth tip's tick (#1005 round): brand green on a green wash, drawn in the icon so it needs no colour rule.
  anyOrder: <svg viewBox="0 0 48 48" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="#e7f6ee" stroke="#16A06A" /><path d="M17.5 24.5l4.5 4.5 9-10" stroke="#16A06A" /></svg>,
  // A page held here, not sent yet (the Undo's wait, or kept back): a clock, never the sent arrow.
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
};

const STATUS_WORDS: Record<StackTile["status"], string> = {
  adding: "Loading…", waiting: "Loading…", checking: "Loading…", ready: "Ready", saved: "Saved", refused: "Needs another photo", unavailable: "Cannot be checked", sent: "Sent for marking",
};

/** A bottom sheet on a phone, a centred dialog on a wider screen. A Close button, Esc and the backdrop close it. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.showModal === "function" && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } } else d.setAttribute("open", "");
    // Focus never lands on Delete by itself.
    d.querySelector<HTMLElement>("[data-first-focus]")?.focus();
    return () => { if (d.open && typeof d.close === "function") d.close(); };
  }, []);
  return <dialog ref={ref} className="scan-sheet" aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
    <div className="scan-sheet-bar"><button type="button" className="scan-sheet-x" aria-label="Close" onClick={onClose}><span aria-hidden="true">×</span></button></div>
    <div className="scan-sheet-body">{children}</div>
  </dialog>;
}

function Tile({ tile, thumb, onOpen }: { tile: StackTile; thumb?: string; onOpen: () => void }) {
  const bad = tile.status === "refused";
  return <li className={`scan-tile is-${tile.status}`}>
    <button type="button" className="scan-tile-button" onClick={onOpen} aria-label={`${tile.label}: ${tile.reason ?? STATUS_WORDS[tile.status]}`}>
      <span className="scan-ph">
        {thumb ? <Image unoptimized width={300} height={400} src={thumb} alt="" /> : <span className="scan-ph-empty" />}
        <span className={`scan-flag is-${tile.status}`} aria-hidden="true">
          {tile.status === "ready" ? ICONS.clock : tile.status === "sent" ? "↑" : bad ? "!" : tile.status === "adding" || tile.status === "checking" ? <span className="scan-spin" /> : null}
        </span>
      </span>
      <span className="scan-tile-l">{tile.label}</span>
      {tile.reason ? <span className="scan-tile-s">{tile.reason}</span> : tile.status === "checking" || tile.status === "adding" || tile.status === "waiting" || tile.status === "sent" ? <span className="scan-tile-s">{STATUS_WORDS[tile.status]}</span> : null}
    </button>
  </li>;
}

/** The class on <html> while the capture screen is open: the account's header, title and tab bar hide, and the screen fills the viewport. */
export const CAPTURE_CLASS = "scan-capturing";
/**
 * Where the browser has no `cancel` event on a file input: after the phone's camera or photos close, how long a chosen
 * file has to arrive before the pick counts as cancelled. A later file still arrives, and opens the capture screen again.
 */
export const PICK_RETURN_MS = 1200;
/** The flag on the history entry the capture screen pushes, so Back closes it instead of leaving Scan pages. */
export const CAPTURE_ENTRY = "unicaScanCapture";
const ownEntry = () => { try { return Boolean((history.state as Record<string, unknown> | null)?.[CAPTURE_ENTRY]); } catch { return false; } };
/** Where a parent reads every saved page result: the Page history on the child's Workbooks page. */
export const allPagesPath = (child: string) => `${workbooksPath(child)}#page-history`;

/** How long a page that passed waits on the phone, with Undo, before it is sent for marking (#915). The photo is already saved; marking is held back. */
export const UNDO_MS = 10_000;

const flagStore = (key: string) => ({
  subscribe: (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); },
  read: () => { try { return localStorage.getItem(key) === "seen"; } catch { return false; } },
  write: () => { try { localStorage.setItem(key, "seen"); window.dispatchEvent(new Event("storage")); } catch { /* blocked storage: this visit remembers */ } },
});

/** The glyph and the short word of each strip state: never colour alone. */
const STRIP_FACE: Record<StripState, { glyph: ReactNode; word: string }> = {
  marked: { glyph: ICONS.check, word: "Marked" }, marking: { glyph: "⋯", word: "Marking" }, sent: { glyph: "↑", word: "Sent" },
  ready: { glyph: ICONS.clock, word: "Ready" }, checking: { glyph: <span className="scan-spin" />, word: "Checking" }, saved: { glyph: "•", word: "Saved" },
  retake: { glyph: "!", word: "Retake" }, todo: { glyph: null, word: "To scan" },
};

/** A good photo: the whole page fills the frame, its four corners and the small code in view. */
const GOOD_PHOTO = <svg viewBox="0 0 90 120" role="img" aria-label="A good photo: the whole page fills the photo, with all four corners and the small code in view">
  <rect width="90" height="120" fill="#55555c" /><rect x="6" y="6" width="78" height="108" fill="#fff" />
  <path d="M10 18V10h8M72 10h8v8M10 102v8h8M72 110h8v-8" fill="none" stroke="#111" strokeWidth="2" />
  <path d="M20 26h30M20 36h44M20 46h36M20 56h44M20 66h28" stroke="#c9c9cf" strokeWidth="3" />
  <rect x="14" y="88" width="14" height="14" fill="#111" /><rect x="17" y="91" width="4" height="4" fill="#fff" /><rect x="22" y="96" width="3" height="3" fill="#fff" />
</svg>;

/** The Send result. `started`: how many sent pages the server started to mark now; the cron marks the others. */
function sentWords(sent: number, started: number) {
  const pages = sent === 1 ? "1 page" : `${sent} pages`;
  if (sent === 0) return "0 pages sent for marking.";
  if (started <= 0) return `${pages} sent for marking. Marking is not ready yet. The pages wait here.`;
  return `${pages} sent for marking. Marks show here when they are ready.`;
}

export function ScanPages({ childrenList, parent, noticeAcknowledged, mode = "phone", focus = null, initial, undoMs = UNDO_MS, duplicateMs = DUPLICATE_NOTE_MS, captureRenewMs = CAPTURE_RENEW_MS, now = Date.now, timeZone = PACIFIC_ZONE, allPages = [] }: {
  childrenList: { id: string; first_name: string }[];
  /** Optional server presentation state; the controller still reloads the signed-in family on mount. */
  initial?: { listing: ScanListing | null; loadFailed?: boolean };
  parent: string;
  noticeAcknowledged: boolean;
  mode?: Mode;
  /** The page a QR code opened (D-276 build note): its child and its name, "Page 17 · Day 4". */
  focus?: { childId: string; label: string } | null;
  /** How long the Undo holds a page (#915); tests pass a short one. */
  undoMs?: number;
  /** How long "Page 27 is already scanned" shows (#4); tests pass a short one. */
  duplicateMs?: number;
  /** How often the capture screen renews the server's hold; tests pass a short one. */
  captureRenewMs?: number;
  now?: () => number;
  timeZone?: FamilyZone;
  /**
   * Children whose Workbooks page shows their Page history (src/lib/workbooks-page-server.ts): "See all pages" links
   * there. Any other child gets no link and no history here (2026-11-14), so the link never opens a page that is not found.
   */
  allPages?: readonly string[];
}) {
  const [child, setChild] = useState(focus?.childId ?? childrenList[0]?.id ?? "");
  const [listing, setListing] = useState<ScanListing | null>(initial?.listing ?? null);
  const [uploads, setUploads] = useState<Local[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  // Second pages of two-page photos the server could not keep (#965): named once, until the parent photographs them.
  const [unkept, setUnkept] = useState<number[]>([]);
  const [sheet, setSheet] = useState<{ kind: "add" } | { kind: "notice"; then: "camera" | "library" | null } | { kind: "tile"; key: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState(noticeAcknowledged);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  // The photo check's problem on the open photo (#855): it changes the sheet's heading.
  const [checkProblem, setCheckProblem] = useState<{ photo: string; problem: string } | null>(null);
  const onCheckProblem = useCallback((photo: string, problem: string | null) => {
    setCheckProblem((held) => (problem ? (held?.photo === photo && held.problem === problem ? held : { photo, problem }) : held?.photo === photo ? null : held));
  }, []);
  const [failedChecks, setFailedChecks] = useState<Set<string>>(() => new Set());
  const [loadFailed, setLoadFailed] = useState(initial?.loadFailed ?? false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const listFlight = useRef<{ version: number; again: boolean; promise: Promise<ScanListing | null> } | null>(null);
  const sessionCurrent = useRef(true);
  const uploadsRef = useRef<Local[]>([]);
  /** The uploads in flight (at most UPLOAD_SLOTS), and the waits for room that Send or a delete cuts short. */
  const running = useRef(new Set<string>());
  const naps = useRef(new Set<() => void>());
  const pumpRef = useRef<() => void>(() => {});
  const checking = useRef(false);
  const asked = useRef(new Map<string, number>());
  // Quick asks per photo while its upload-time check runs (#915); after them, the usual wait between asks.
  const busyAsked = useRef(new Map<string, number>());
  const savedAsked = useRef(new Set<string>());
  const fetching = useRef(new Set<string>());
  const urls = useRef(new Map<string, string>());
  const replacing = useRef<string | null>(null);
  const name = childrenList.find((c) => c.id === child)?.first_name ?? "your child";
  // #915: the first-visit tips, remembered per parent in this browser.
  const tipsFlag = useMemo(() => flagStore(`unica.scan-tips.v1:${parent}`), [parent]);
  const tipsSeen = useSyncExternalStore(tipsFlag.subscribe, tipsFlag.read, () => true);
  const [tipsDone, setTipsDone] = useState(false);
  // The capture screen (#915): open while the parent keeps taking photos; the shots are this session's local photos.
  const [capturing, setCapturing] = useState(false);
  const [shots, setShots] = useState<string[]>([]);
  // The capture tray's live line: "Photo 3 added", or why a photo could not be sent.
  const [announce, setAnnounce] = useState("");
  const [landed, setLanded] = useState<Record<string, string>>({});
  // A pick from the capture screen that ends with no photo (#915): with no shot yet, the capture screen closes.
  const capturingRef = useRef(false);
  const shotsRef = useRef<string[]>([]);
  const pickWatch = useRef<(() => void) | null>(null);
  // The open pick started on the capture screen: a file that arrives after the screen closed opens it again.
  const pickFromCapture = useRef(false);
  // The history entry the capture screen pushed and still owns (Back closes the screen), and the control that opened it.
  const entry = useRef(false);
  const opener = useRef("dock");
  const closeButton = useRef<HTMLButtonElement>(null);
  /** Pages a code filed with a sibling's book (#915): "Page 12 went to Aisha's pages." */
  const [elsewhere, setElsewhere] = useState<{ page: number | null; child: string }[]>([]);
  const filedOf = useRef(new Map<string, { child_id?: string; child?: string; page?: number }>());
  // Auto-send with Undo (#915): the pages held on the phone, the ones already held once, the ones Undo kept back.
  const [batch, setBatch] = useState<string[]>([]);
  const held = useRef(new Set<string>());
  // When each held page's own Undo wait began (#3): each page sends its own wait after it was held, not after the newest.
  const heldAt = useRef(new Map<string, number>());
  // Pages a code filed with a sibling (#1): sent with this scan's pages, after their own check.
  const [siblingPages, setSiblingPages] = useState<string[]>([]);
  const siblingIds = useRef(new Set<string>());
  // The first list read of a visit asks the server to send pages whose Undo passed while nobody was here (#3).
  const dueAsked = useRef(false);
  // The full photo of the open sheet (#9): the stack keeps small thumbnails only.
  const [fullImage, setFullImage] = useState<{ id: string; url: string } | null>(null);
  // Undo sticks (#915): the pages a parent kept back stay kept back on this phone, across a child switch and a later visit.
  const undoneKey = `unica.scan-undone.v1:${parent}`;
  const [undone, setUndone] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(undoneKey) ?? "[]") as string[]); } catch { return new Set(); }
  });
  const keepUndone = (ids: string[]) => setUndone((u) => {
    const next = new Set([...u, ...ids]);
    try { localStorage.setItem(undoneKey, JSON.stringify([...next].slice(-200))); } catch { /* blocked storage: this visit remembers */ }
    return next;
  });
  /** How many times a page waited for its photo check (#855) before its send; a page still checking waits again. */
  const waits = useRef(new Map<string, number>());
  const [problems, setProblems] = useState<Record<string, PhotoProblem>>({});
  const [tried, setTried] = useState<Set<string>>(() => new Set());
  const [retakeAt, setRetakeAt] = useState(0);
  const [online, setOnline] = useState(true);
  const blurSince = useRef(new Map<string, number>());
  const progress = useRef({ signature: "", at: Date.now(), readAt: Date.now() });

  const putUploads = useCallback((next: Local[]) => { progress.current.at = Date.now(); uploadsRef.current = next; setUploads(next); }, []);
  const patchUpload = useCallback((key: string, patch: Partial<Local>) => putUploads(uploadsRef.current.map((u) => (u.key === key ? { ...u, ...patch } : u))), [putUploads]);
  const keepUrl = useCallback((key: string, url: string) => {
    const old = urls.current.get(key);
    if (old && old !== url) URL.revokeObjectURL(old);
    urls.current.set(key, url);
    setThumbs((t) => ({ ...t, [key]: url }));
  }, []);
  /** Ends every wait for room now: the photo asks the server again at once. */
  const wakeAll = useCallback(() => { for (const wake of [...naps.current]) wake(); }, []);
  /** A wait that `wakeAll` can cut short. */
  const nap = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); naps.current.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    naps.current.add(done);
  });
  const clearAll = useCallback(() => {
    epoch.current++;
    blurSince.current.clear(); progress.current = { signature: "", at: Date.now(), readAt: Date.now() };
    listFlight.current = null; setFailedChecks(new Set());
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear(); fetching.current.clear(); asked.current.clear(); savedAsked.current.clear();
    running.current.clear(); wakeAll(); checking.current = false; replacing.current = null;
    setThumbs({}); setUnavailable(new Set()); putUploads([]); setListing(null); setSheet(null); setSending(false); setMessage(null); setLoadFailed(false);
    // A page held for Undo is not sent: it stays ready, and is held again on the next visit.
    held.current.clear(); heldAt.current.clear(); siblingIds.current.clear(); setSiblingPages([]); dueAsked.current = false; filedOf.current.clear(); setBatch([]); setProblems({}); setTried(new Set()); setShots([]); setAnnounce(""); setLanded({}); setElsewhere([]); setCapturing(false); setRetakeAt(0);
  }, [putUploads, wakeAll]);

  const load = useCallback((): Promise<ScanListing | null> => {
    const version = epoch.current;
    if (!sessionCurrent.current) return Promise.resolve(null);
    if (listFlight.current?.version === version) {
      // A save during an older read needs one more snapshot, with no overlapping list requests.
      listFlight.current.again = true;
      return listFlight.current.promise;
    }
    const flight = { version, again: false, promise: Promise.resolve<ScanListing | null>(null) };
    listFlight.current = flight;
    flight.promise = (async () => {
      let data: ScanListing;
      try {
        do {
          flight.again = false;
          const due = !dueAsked.current;
          dueAsked.current = true;
          data = await api(`/api/account/scans?child=${child}${due ? "&due=1" : ""}`);
          if (version !== epoch.current || !sessionCurrent.current) return null;
          // Install the real photo and let go of its placeholder in the same render, only after its verdict.
          const checkedPhotos = data.photos.map((p) => unavailable.has(p.id) && p.check === "checking" ? { ...p, check: "unavailable" as const } : p);
          const resolved = uploadsRef.current.filter((u) => replacementVerdict(u, checkedPhotos, data.checks));
          for (const u of resolved) {
            const photo = replacementVerdict(u, checkedPhotos, data.checks)!;
            if (u.target && (photo.pageId !== u.target.pageId || photo.workbookId !== u.target.workbookId)) {
              const day = data.pages.find((p) => p.id === photo.pageId)?.day;
              setMessage({ text: `This photo is page ${photo.pageNumber}${day ? ` · ${day}` : ""}. It did not replace page ${u.target.pageNumber}${u.target.day ? ` · ${u.target.day}` : ""}. Take another photo of page ${u.target.pageNumber}.`, failed: false });
            }
          }
          const signature = JSON.stringify(data);
          if (signature !== progress.current.signature) progress.current = { signature, at: Date.now(), readAt: Date.now() };
          else progress.current.readAt = Date.now();
          setListing(data); setLoadFailed(false);
          const stillChecking = new Set(data.photos.filter((p) => p.check === "checking" || photoCheckPending(p)).map((p) => p.id));
          const timedOut = new Set<string>();
          for (const p of data.photos) {
            if (!photoCheckPending(p)) { blurSince.current.delete(p.id); continue; }
            const since = blurSince.current.get(p.id) ?? Date.now();
            blurSince.current.set(p.id, since);
            if (Date.now() - since >= BLUR_WAIT_MS) timedOut.add(p.id);
          }
          setFailedChecks((s) => new Set([...s].filter((id) => stillChecking.has(id)).concat([...timedOut])));
          if (resolved.length) putUploads(uploadsRef.current.filter((u) => !resolved.includes(u)));
          const found: Record<string, PhotoProblem> = {};
          for (const p of data.photos) if (p.photoCheck?.state === "done" && p.photoCheck.problem) found[p.id] = p.photoCheck.problem;
          if (Object.keys(found).length) setProblems((p) => ({ ...p, ...found }));
        } while (flight.again);
        return data;
      } catch (error) {
        if (version === epoch.current && sessionCurrent.current) setLoadFailed(true);
        throw error;
      } finally { if (listFlight.current === flight) listFlight.current = null; }
    })();
    return flight.promise;
  }, [child, putUploads, unavailable]);

  // Account changes and leaving the page clear every image.
  useEffect(() => {
    const { data } = browserClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== parent) { sessionCurrent.current = false; clearAll(); setMessage({ text: "Your account changed. Sign in again to view photos.", failed: true }); }
    });
    const hide = () => clearAll();
    window.addEventListener("pagehide", hide);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("pagehide", hide); clearAll(); };
  }, [parent, clearAll]);

  useEffect(() => {
    if (!child) return;
    void load().catch(() => setLoadFailed(true));
  }, [child, load]);

  useEffect(() => { if (mode === "phone") noteScanning(); }, [mode]);
  useEffect(() => { const current = epoch.current; scanEventTicket(() => sessionCurrent.current && epoch.current === current)("scan_entry", "opened"); }, []);

  // A photo saves when it arrives (D-269). One left pending by a closed tab or an older screen saves on the next visit.
  useEffect(() => {
    if (mode !== "phone" || !listing) return;
    const version = epoch.current;
    const pending = listing.photos.filter((p) => p.state === "pending" && !savedAsked.current.has(p.id));
    if (!pending.length) return;
    for (const p of pending) savedAsked.current.add(p.id);
    void (async () => {
      let saved = false;
      for (const p of pending) {
        if (version !== epoch.current || !sessionCurrent.current) return;
        // A failed save is asked again on the next refresh (live while a photo is pending), not at once.
        try { await api(`/api/account/scans/${p.id}`, { method: "POST" }); saved = true; } catch { if (version === epoch.current) savedAsked.current.delete(p.id); }
      }
      if (saved && version === epoch.current) await load().catch(() => {});
    })();
  }, [listing, load, mode]);

  // A photo the list shows reached the server after all, whatever answers were lost: drop its refused entry.
  useEffect(() => {
    if (!listing) return;
    const here = new Set(listing.photos.map((p) => p.id));
    const found = uploadsRef.current.filter((u) => u.status === "refused" && u.reservation && here.has(u.reservation) && !running.current.has(u.key));
    if (!found.length) return;
    for (const u of found) {
      const url = urls.current.get(u.key);
      if (url) { URL.revokeObjectURL(url); urls.current.delete(u.key); }
    }
    putUploads(uploadsRef.current.filter((u) => !found.includes(u)));
  }, [listing, putUploads]);

  // Thumbnails, two at a time, through the checked image route.
  useEffect(() => {
    if (!listing) return;
    const version = epoch.current;
    const wanted = listing.photos.filter((p) => !urls.current.has(p.id) && !fetching.current.has(p.id));
    if (!wanted.length) return;
    for (const p of wanted) fetching.current.add(p.id);
    const one = async (p: StackPhoto) => {
      try {
        const response = await fetch(`/api/account/scans/${p.id}/image`, { cache: "no-store" });
        if (!response.ok) return;
        const blob = await response.blob();
        // A small thumbnail, not the full photo (#9): 30 full photos do not fit a phone's memory.
        const small = await scanThumbnail(blob);
        if (version === epoch.current) keepUrl(p.id, URL.createObjectURL(small ?? blob));
      } catch {} finally { fetching.current.delete(p.id); }
    };
    void (async () => { for (let i = 0; i < wanted.length; i += 2) { if (version !== epoch.current) return; await Promise.all(wanted.slice(i, i + 2).map(one)); } })();
  }, [listing, keepUrl]);

  // Checks (test families and admins): one photo at a time, the oldest first. A busy check is asked again later.
  const runChecks = useCallback(async () => {
    if (checking.current || !listing?.checks || !navigator.onLine || document.visibilityState !== "visible") return;
    checking.current = true;
    const version = epoch.current;
    try {
      for (;;) {
        const now = Date.now();
        const next = listing.photos.filter((p) => p.state === "saved" && (p.check === "checking" || (photoCheckPending(p) && !p.photoCheck)) && !failedChecks.has(p.id) && !unavailable.has(p.id) && now - (asked.current.get(p.id) ?? 0) > CHECK_ASK_MS)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!next || version !== epoch.current) return;
        asked.current.set(next.id, now);
        const answer = await api(`/api/account/scans/${next.id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => null);
        if (version !== epoch.current) return;
        if (!answer?.preview?.status) { setFailedChecks((s) => new Set(s).add(next.id)); return; }
        const status = answer?.preview?.status;
        if (status === "refused" && answer.preview.reason === "check-timeout") { setFailedChecks((s) => new Set(s).add(next.id)); return; }
        if (status === "unavailable") setUnavailable((s) => new Set(s).add(next.id));
        if (status === "ready" || status === "refused") { await load().catch(() => {}); return; }
        // Busy: the check started at upload (#915) is still running. Ask again soon, not after the usual wait.
        if (status === "busy") {
          const n = (busyAsked.current.get(next.id) ?? 0) + 1;
          busyAsked.current.set(next.id, n);
          if (n <= QUICK_BUSY_ASKS && document.visibilityState === "visible") { await wait(BUSY_ASK_MS); asked.current.set(next.id, 0); continue; }
          return;
        }
        if (status !== "unavailable") return;
      }
    } finally { if (version === epoch.current) checking.current = false; }
  }, [listing, unavailable, failedChecks, load]);
  useEffect(() => { void runChecks(); }, [runChecks]);

  const photos = useMemo(() => (listing?.photos ?? []).map((p) => (failedChecks.has(p.id) ? { ...p, checkFailed: true } : unavailable.has(p.id) && p.check === "checking" ? { ...p, check: "unavailable" as const } : p)), [listing, unavailable, failedChecks]);

  const checkingNow = scanWorkPending({ photos, uploads, checks: Boolean(listing?.checks), marking: Boolean(listing?.marking) });
  const automaticNow = scanWorkPending({ photos: photos.filter((p) => !p.sentAt || (p.marks?.automaticPending ?? 1) > 0), uploads, checks: Boolean(listing?.checks), marking: Boolean(listing?.marking) });
  const live = mode === "desktop" || checkingNow;
  useEffect(() => {
    if (!child) return;
    const refresh = () => {
      if (!navigator.onLine || document.visibilityState !== "visible" || listFlight.current) return;
      const now = Date.now();
      const delay = scanPollDelay(now - progress.current.at, automaticNow);
      if (now - progress.current.readAt < delay) return;
      progress.current.readAt = now;
      void load().catch(() => {});
    };
    const timer = live ? setInterval(refresh, CHECKING_POLL_MS) : undefined;
    // Return from the camera or another tab: refresh even when fast polling had stopped.
    const seen = () => { if (navigator.onLine && document.visibilityState === "visible") { progress.current.at = Date.now(); void load().catch(() => {}); } };
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("online", seen);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", seen); window.removeEventListener("online", seen); };
  }, [live, child, load, automaticNow]);

  async function uploadOne(u: Local, version: number): Promise<{ id: string; thumb: Blob } | UploadRefusal> {
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    if (u.replaces) await api(`/api/account/scans/${u.replaces}`, { method: "DELETE" }).catch(() => {});
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    let blob: Blob;
    try { blob = await prepareScanPhoto(u.file, u.smaller ? SMALLER_ENCODING : PHOTO_ENCODING); }
    catch (error) { const code = codeOf(error); return code === "size" ? "size" : code === "unavailable" ? "unavailable" : "image"; }
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    // One body for every try of this photo: a timed-out upload swaps in a smaller encoding for the next try (#5).
    const body = { blob, smaller: Boolean(u.smaller), file: u.file };
    // The same id again after a lost answer: the server answers with that photo's state and takes no second slot.
    let id = u.reservation ?? crypto.randomUUID();
    for (let fresh = false; ; fresh = true) {
      patchUpload(u.key, { reservation: id });
      const result = await sendPhoto(u.key, id, body, version, u.replaceOf);
      if (result === "sent") break;
      if (result !== "ended") return result;
      if (fresh) return "unavailable";
      id = crypto.randomUUID();
    }
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    savedAsked.current.add(id);
    // A failed save is asked again when the list next shows this photo as pending.
    await api(`/api/account/scans/${id}`, { method: "POST" }).catch(() => { if (version === epoch.current) savedAsked.current.delete(id); });
    return { id, thumb: body.blob };
  }

  /**
   * A `busy` answer: the photo keeps its place and asks again, for as long as it is on the screen (#915). After a short
   * wait it shows as waiting for room. False when the photo went (deleted, account or child changed): stop asking.
   */
  async function waitForRoom(key: string, code: string, tries: number, version: number) {
    const step = roomWait(code, tries);
    const here = () => version === epoch.current && sessionCurrent.current && uploadsRef.current.some((x) => x.key === key);
    if (!here()) return false;
    if (step.held && !uploadsRef.current.find((x) => x.key === key)?.held) patchUpload(key, { held: true });
    await nap(step.delayMs);
    return here();
  }

  async function sendPhoto(key: string, id: string, body: { blob: Blob; smaller: boolean; file: File }, version: number, replaceOf?: string): Promise<"sent" | "ended" | UploadRefusal> {
    let admission: { state: string } | null = null;
    let busy = 0;
    while (!admission) {
      if (version !== epoch.current) return "unavailable";
      try { admission = await api("/api/account/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, child, bytes: body.blob.size }) }); }
      catch (error) {
        const code = codeOf(error);
        if (waitsForRoom(code)) { if (await waitForRoom(key, code, busy++, version)) continue; return "unavailable"; }
        return ENDED.includes(code) ? "ended" : uploadRefusal(code);
      }
    }
    if (uploadsRef.current.find((x) => x.key === key)?.held) patchUpload(key, { held: false });
    for (let attempt = 0; ; attempt++) {
      if (version !== epoch.current) return "unavailable";
      try {
        const data = admission.state === "reserved"
          ? await api(`/api/account/scans/${id}${replaceOf ? `?replace=${replaceOf}` : ""}`, { method: "PUT", body: body.blob }, UPLOAD_TIMEOUT_MS)
          : await api(`/api/account/scans/${id}`);
        const state = data.photo?.state;
        const second = data.spread as { state?: string; page?: number } | undefined;
        if (second?.page && version === epoch.current && !["saved", "duplicate"].includes(second.state ?? "")) setUnkept((pages) => pages.includes(second.page!) ? pages : [...pages, second.page!].sort((a, b) => a - b));
        if (state === "pending" || state === "saved") { if (data.photo) filedOf.current.set(id, data.photo); return "sent"; }
        // The upload never reached us (#5): the photo is still only reserved, so it is sent again. Still being saved, or
        // any other answer: a lost answer, never "We cannot open this photo".
        throw new Error(state === "reserved" ? "reserved" : ENDED.includes(state) ? state : "uncertain");
      } catch (error) {
        const code = codeOf(error);
        // The reservation keeps its lease while it waits; a lease that ends answers `expired`, and the photo takes a new id.
        if (waitsForRoom(code)) { if (await waitForRoom(key, code, busy++, version)) { attempt--; continue; } return "unavailable"; }
        // A slow connection (#5): after one timeout, the photo goes smaller, about 2000 px at quality 0.75.
        if (code === "timeout" && !body.smaller) {
          try { body.blob = await prepareScanPhoto(body.file, SMALLER_ENCODING); body.smaller = true; patchUpload(key, { smaller: true }); } catch { /* the same photo again */ }
        }
        if (code === "reserved" && attempt < 5) { admission = { state: "reserved" }; await wait(1000); continue; }
        // A lost answer: the photo may still be saving. Ask about the same photo, never send it twice.
        if ((code === "uncertain" || code === "unavailable" || code === "timeout") && attempt < 5) { admission = { state: "check" }; await wait(2000); continue; }
        // A page that already has a photo (#4): its page number, and the photo this one may replace.
        if (code === "duplicate" && error instanceof ApiError) {
          const page = error.data.page, replaceable = error.data.replaceable;
          patchUpload(key, { page: typeof page === "number" ? page : undefined, replaceable: typeof replaceable === "string" ? replaceable : undefined });
        }
        return ENDED.includes(code) ? "ended" : uploadRefusal(code);
      }
    }
  }

  /**
   * A photo the parent gives up on may hold an upload slot from a lost answer: ask the server to let it go. The photo may
   * have reached the server after all, so the server decides and keeps it. Only "Delete this photo" deletes.
   */
  function release(u: Local | undefined) {
    if (u?.reservation) void api(`/api/account/scans/${u.reservation}/release`, { method: "POST" }).catch(() => {});
  }

  /** One photo, start to end. Its slot frees when it ends, and the next waiting photo starts. */
  async function runUpload(next: Local, version: number) {
    try {
      patchUpload(next.key, { status: "uploading" });
      const emit = scanEventTicket(() => sessionCurrent.current && version === epoch.current);
      const result = await uploadOne(next, version);
      if (version !== epoch.current || !sessionCurrent.current) return;
      emit("scan_upload_outcome", typeof result === "string" ? result === "unavailable" ? "failed" : "refused" : "saved");
      // The capture tray says only that a photo went up, or why it could not; a page's verdict waits for Done.
      const n = shotsRef.current.indexOf(next.key) + 1;
      if (n > 0 && capturingRef.current) setAnnounce(typeof result === "string" && SENDING_PROBLEMS.includes(result) ? `Photo ${n}: ${refusalCopy(result).title}` : `Photo ${n} added`);
      if (typeof result === "string") {
        patchUpload(next.key, { status: "refused", reason: result, held: false });
        const actualPage = uploadsRef.current.find((u) => u.key === next.key)?.page;
        if (result === "duplicate" && next.target && actualPage && actualPage !== next.target.pageNumber) {
          setMessage({ text: `This photo is page ${actualPage}, which is already scanned. Take another photo of page ${next.target.pageNumber}.`, failed: false });
        }
      }
      else {
        // The photo keeps the small thumbnail it had while sending (#9); with none yet, one is made from the sent photo.
        const local = urls.current.get(next.key);
        if (local) { urls.current.delete(next.key); keepUrl(result.id, local); }
        else void scanThumbnail(result.thumb).then((small) => { if (version === epoch.current) keepUrl(result.id, URL.createObjectURL(small ?? result.thumb)); });
        setLanded((l) => ({ ...l, [next.key]: result.id }));
        const filed = filedOf.current.get(result.id);
        if (filed?.child_id && filed.child_id !== child) {
          setElsewhere((e) => [...e, { page: filed.page ?? null, child: filed.child ?? "another child" }]);
          // A sibling's page goes for marking with this scan's pages (#1), after its own check.
          siblingIds.current.add(result.id);
          setSiblingPages((list) => (list.includes(result.id) ? list : [...list, result.id]));
        }
        if (filed?.child_id && filed.child_id !== child) putUploads(uploadsRef.current.filter((u) => u.key !== next.key));
        else patchUpload(next.key, { status: "uploaded", uploadedId: result.id });
      }
      for (const gone of [next.replaces, next.replaceOf]) { const old = gone && urls.current.get(gone); if (gone && old) { URL.revokeObjectURL(old); urls.current.delete(gone); } }
      await load().catch(() => {});
    } finally {
      if (version === epoch.current) { running.current.delete(next.key); pumpRef.current(); }
    }
  }

  // The queue: up to UPLOAD_SLOTS photos in flight, the others waiting their turn in the order they were added.
  const pump = useCallback(() => {
    if (!sessionCurrent.current) return;
    const version = epoch.current;
    for (const key of nextUploads(uploadsRef.current, running.current)) {
      const next = uploadsRef.current.find((u) => u.key === key);
      if (!next) continue;
      running.current.add(key);
      void runUpload(next, version);
    }
    // runUpload reads `child` from this render; the queue restarts on a child change (clearAll).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child, load, keepUrl, patchUpload, putUploads]);
  useEffect(() => { pumpRef.current = pump; }, [pump]);

  function add(files: FileList | null, source: "camera" | "library") {
    if (!files?.length || !sessionCurrent.current) return;
    const replaces = replacing.current;
    replacing.current = null;
    let list = uploadsRef.current;
    const oldLocal = list.find((u) => u.key === replaces);
    const oldPhoto = listing?.photos.find((p) => p.id === replaces);
    const oldPage = listing?.pages.find((p) => p.id === oldPhoto?.pageId);
    const target = oldLocal?.target ?? (oldPhoto ? { photoId: oldPhoto.id, pageId: oldPhoto.pageId, workbookId: oldPhoto.workbookId, pageNumber: oldPhoto.pageNumber, day: oldPage?.day ?? null } : undefined);
    // A retake of a photo that never reached us replaces it here; a retake of a saved photo deletes that photo first.
    if (replaces) {
      const superseded = list.filter((upload) => upload.key === replaces || upload.uploadedId === replaces || upload.reservation === replaces);
      for (const upload of superseded) release(upload);
      list = list.filter((upload) => !superseded.includes(upload));
    }
    const added: Local[] = [...files].map((file, i) => ({
      key: `local:${crypto.randomUUID()}`, file, status: "waiting" as const, source,
      target: i === 0 ? target : undefined,
      replaces: i === 0 && replaces && !replaces.startsWith("local:") ? replaces : undefined,
    }));
    // Small thumbnails, made one at a time (#9): a full-size image per photo runs a phone out of memory by about 30.
    const version = epoch.current;
    void (async () => {
      for (const u of added) {
        const small = await scanThumbnail(u.file);
        if (version !== epoch.current || !uploadsRef.current.some((x) => x.key === u.key)) continue;
        try { keepUrl(u.key, URL.createObjectURL(small ?? u.file)); } catch {}
      }
    })();
    putUploads([...list, ...added]);
    if (target) setRetakeAt(0);
    // A slow pick (a large photo, or one from iCloud) can arrive after its capture screen closed as cancelled: open it again,
    // so the parent sees the photo checked there and nothing sends while it is still arriving.
    if (phone && pickFromCapture.current && !capturingRef.current) { pushEntry(); capturingRef.current = true; setCapturing(true); }
    // A retake takes the place of the photo it replaces on the capture screen.
    setShots((s) => [...s.filter((k) => !replaces || (k !== replaces && landed[k] !== replaces)), ...added.map((u) => u.key)]);
    if (!tipsSeen) { tipsFlag.write(); setTipsDone(true); }
    noteScanning();
    setMessage(null); setSheet(null);
    pump();
  }

  /** Opens the phone's camera or its photos, inside the tap (Safari needs the user's tap). The notice comes first, once. */
  function open(which: "camera" | "library", replaces: string | null = null) {
    if (!acknowledged) { setSheet({ kind: "notice", then: which }); replacing.current = replaces; return; }
    if (!sessionCurrent.current) return;
    if (replaces) {
      const reason = tiles.find((t) => t.key === replaces)?.refusal;
      const current = epoch.current;
      scanEventTicket(() => sessionCurrent.current && epoch.current === current)("scan_retake_reason", reason === "marks-missing" ? "cut_off" : reason === "page-mismatch" || reason === "page" ? "wrong_page" : reason === "qr-mismatch" ? "unreadable_code" : "other");
    }
    replacing.current = replaces;
    setSheet(null);
    pick(which);
  }

  /**
   * Opens the input and watches for a return with no file. Where the input has a `cancel` event, it alone says so: a slow
   * file is never taken for a cancel. Elsewhere, focus or the page showing again with no file after PICK_RETURN_MS.
   */
  function pick(which: "camera" | "library") {
    const input = (which === "camera" ? camera : library).current;
    if (!input) return;
    pickWatch.current?.();
    pickFromCapture.current = capturingRef.current;
    const hasCancel = "oncancel" in input;
    let away = false, timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      input.removeEventListener("cancel", cancelled); input.removeEventListener("change", stop);
      window.removeEventListener("blur", leave); window.removeEventListener("focus", back); document.removeEventListener("visibilitychange", seen);
      if (pickWatch.current === stop) pickWatch.current = null;
    };
    const cancelled = () => { stop(); if (capturingRef.current && shotsRef.current.length === 0) { capturingRef.current = false; setCapturing(false); } };
    const leave = () => { away = true; };
    const back = () => { if (!away) return; clearTimeout(timer); timer = setTimeout(cancelled, PICK_RETURN_MS); };
    const seen = () => { if (document.visibilityState === "hidden") leave(); else back(); };
    input.addEventListener("cancel", cancelled); input.addEventListener("change", stop);
    if (!hasCancel) { window.addEventListener("blur", leave); window.addEventListener("focus", back); document.addEventListener("visibilitychange", seen); }
    pickWatch.current = stop;
    input.click();
  }

  function acknowledge(then: "camera" | "library" | null) {
    const version = epoch.current;
    void api("/api/account/scans/notice", { method: "POST" }).then(() => { if (version === epoch.current) setAcknowledged(true); }).catch(() => {});
    setAcknowledged(true); setSheet(null);
    if (then) pick(then);
  }

  const checks = Boolean(listing?.checks);
  const marking = Boolean(listing?.marking);
  const stack = useMemo(() => buildStack({ photos, uploads, pages: listing?.pages ?? [], checks, offline: !online }), [photos, uploads, listing, checks, online]);
  // A page named as not kept stops being named once a photo of it is in the stack.
  const unkeptNote = spreadNote(unkept.filter((n) => !photos.some((p) => listing?.pages.find((d) => d.id === p.pageId)?.pageNumber === n)));
  const tiles = useMemo(() => [...stack.refused, ...stack.addingTiles, ...stack.days.flatMap((d) => d.tiles), ...stack.sent], [stack]);
  const openTile = sheet?.kind === "tile" ? tiles.find((t) => t.key === sheet.key) ?? null : null;
  // The open sheet shows the full photo (#9), read when it opens and let go when it closes; the stack keeps thumbnails.
  const openPhoto = openTile?.photoId ?? null;
  useEffect(() => {
    if (!openPhoto) return;
    let url: string | null = null, gone = false;
    void fetch(`/api/account/scans/${openPhoto}/image`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok || gone) return;
      const blob = await response.blob();
      if (gone) return;
      url = URL.createObjectURL(blob);
      setFullImage({ id: openPhoto, url });
    }).catch(() => {});
    return () => { gone = true; if (url) URL.revokeObjectURL(url); setFullImage(null); };
  }, [openPhoto]);
  const thumbOf = (t: StackTile) => thumbs[t.photoId ?? t.uploadKey ?? ""];
  const phone = mode === "phone";
  const strip = useMemo(() => dayStrip({ photos, pages: listing?.pages ?? [], tiles, marking }), [photos, listing, tiles, marking]);
  // The strip's ‹ and › (2026-11-14): how many days back from the current day the parent stepped. It belongs to one
  // child's current day, so a new current day or another child starts on the current day again.
  const stripAt = `${child}|${strip?.workbookId ?? ""}|${strip?.day ?? ""}`;
  const [dayBack, setDayBack] = useState({ at: stripAt, n: 0 });
  const back = dayBack.at === stripAt ? dayBack.n : 0;
  const shownStrip = useMemo(() => (back ? dayStrip({ photos, pages: listing?.pages ?? [], tiles, marking, back }) : strip), [back, strip, photos, listing, tiles, marking]);
  const stepDay = (by: number) => setDayBack({ at: stripAt, n: Math.max(0, back + by) });
  const today = todaysPages(photos, now(), timeZone);

  async function send(ids: string[] = stack.readyIds) {
    if (!ids.length || sending || !sessionCurrent.current) return;
    const version = epoch.current;
    setSending(true); setMessage(null);
    try {
      const data = await api("/api/account/scans/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child, ids }) });
      if (version !== epoch.current) return;
      const n = (data.sent as string[]).filter((id) => ids.includes(id)).length;
      setMessage({ text: sentWords(n, typeof data.marking === "number" ? data.marking : 0), failed: false });
      // Sent pages may free room: photos waiting for it ask again now.
      wakeAll();
      await load().catch(() => {});
    } catch { if (version === epoch.current) setMessage({ text: "We could not send the pages. Try again.", failed: true }); }
    finally { if (version === epoch.current) setSending(false); }
  }

  // Auto-send (#915): on the phone, with checks, every page that passes is held here for the Undo, then sent. Each page is
  // held once per visit; Undo keeps it here, ready, to send from its sheet. Each page waits its own Undo time from when it
  // was held (#3), so a page held first is not kept waiting by every newer one. Saved photos are not submitted for marking
  // until their wait ends. The hold is also written on the server (#3): a parent who leaves during the Undo still has the
  // pages sent, on the next visit or by the recovery run, and Undo lets them go there too.
  // A page a code filed with a sibling (#1) is held with them: it is not in this child's stack, so its own check decides.
  const auto = phone && checks;
  const holdOnServer = useCallback((ids: string[], seconds: number) => {
    if (!ids.length) return;
    void api("/api/account/scans/hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, seconds }) }).catch(() => {});
  }, []);
  /** Lets go of a hold with no Undo mark: the phone dropped the page or swapped its photo. */
  const releaseHolds = useCallback((ids: string[]) => {
    if (!ids.length) return;
    void api("/api/account/scans/hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, release: true }) }).catch(() => {});
  }, []);
  /** Undo on the server, tried three times; the ids it covers (unsent), or null when every try failed. */
  const unholdOnServer = useCallback(async (ids: string[]): Promise<string[] | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await api("/api/account/scans/hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, undo: true }) });
        return Array.isArray(data.released) ? data.released as string[] : [];
      } catch { if (attempt < 2) await wait(1000 * (attempt + 1)); }
    }
    return null;
  }, []);
  // An Undo whose request never arrived is written again on a later visit: the pages kept back on this phone that the
  // list shows unsent are let go once per visit (idempotent on the server).
  const undoneSynced = useRef(new Set<string>());
  useEffect(() => {
    if (!listing) return;
    const ids = listing.photos.filter((p) => !p.sentAt && undone.has(p.id) && !undoneSynced.current.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    for (const id of ids) undoneSynced.current.add(id);
    void unholdOnServer(ids);
  }, [listing, undone, unholdOnServer]);
  useEffect(() => {
    if (!auto || capturing) return;
    const fresh = [...stack.readyIds, ...siblingPages].filter((id) => !held.current.has(id) && !undone.has(id));
    if (!fresh.length) return;
    const at = Date.now();
    for (const id of fresh) { held.current.add(id); heldAt.current.set(id, at); }
    setBatch((b) => [...b, ...fresh.filter((id) => !b.includes(id))]);
    holdOnServer(fresh, holdSeconds(undoMs));
  }, [auto, capturing, stack.readyIds, siblingPages, undone, undoMs, holdOnServer]);
  // While the capture screen is open nothing sends (#915): the server holds the pages for longer, and when the screen
  // closes each page waits its Undo time again from then.
  const batchRef = useRef<string[]>([]);
  useEffect(() => { batchRef.current = batch; });
  const wasCapturing = useRef(false);
  useEffect(() => {
    if (capturing === wasCapturing.current) return;
    wasCapturing.current = capturing;
    const ids = batchRef.current;
    if (!ids.length) return;
    if (capturing) { holdOnServer(ids, CAPTURE_HOLD_SECONDS); return; }
    const at = Date.now();
    for (const id of ids) heldAt.current.set(id, at);
    holdOnServer(ids, holdSeconds(undoMs));
  }, [capturing, undoMs, holdOnServer]);
  // The capture hold is renewed while the screen stays open, well before it runs out (review of #981).
  useEffect(() => {
    if (!capturing) return;
    const timer = setInterval(() => holdOnServer(batchRef.current, CAPTURE_HOLD_SECONDS), captureRenewMs);
    return () => clearInterval(timer);
  }, [capturing, captureRenewMs, holdOnServer]);
  const commitRef = useRef<(ids: string[]) => Promise<void>>(async () => {});
  commitRef.current = async (ids: string[]) => {
    const version = epoch.current;
    setBatch((b) => b.filter((id) => !ids.includes(id)));
    // The photo check (#855) has the last word: a page it found a problem on is kept back for "Take again" or "Send anyway".
    // A sibling's page is not in this stack, so its page check is asked to run (it runs once; a later ask gets its result).
    const looked = await Promise.all(ids.map(async (id) => {
      const sibling = siblingIds.current.has(id);
      const answer: { preview?: { status?: string }; photoCheck?: PhotoCheckView } | null = await api(`/api/account/scans/${id}/preview`,
        sibling ? { method: "POST", headers: { "Content-Type": "application/json" } } : undefined).catch(() => null);
      return { id, answer, sibling };
    }));
    if (version !== epoch.current || !sessionCurrent.current) return;
    const ok: string[] = [], kept: Record<string, PhotoProblem> = {}, again: string[] = [];
    const waitAgain = (id: string) => {
      if ((waits.current.get(id) ?? 0) >= 2) return false;
      waits.current.set(id, (waits.current.get(id) ?? 0) + 1); again.push(id); return true;
    };
    for (const { id, answer, sibling } of looked) {
      if (!answer || answer.preview?.status !== "ready") {
        // A sibling's page still being checked waits again; after two waits, the server's hold sends it once it passes.
        if (sibling && answer && ["busy", "not-started"].includes(answer.preview?.status ?? "") && waitAgain(id)) continue;
        // A sibling's page leaves this screen's batch for good (its own screen shows it), so it is not held again.
        // The phone dropped the page, so the server's hold goes too (it may be held again once it passes).
        releaseHolds([id]);
        if (sibling) { siblingIds.current.delete(id); setSiblingPages((list) => list.filter((x) => x !== id)); continue; }
        held.current.delete(id); continue;
      }
      const check = answer.photoCheck;
      if (check?.state === "done" && check.problem) kept[id] = check.problem;
      // A pending check is never implicit permission to send. After two waits, leave the page for an explicit send.
      else if (check?.state === "pending") waitAgain(id);
      else ok.push(id);
    }
    if (Object.keys(kept).length) setProblems((p) => ({ ...p, ...kept }));
    if (again.length) {
      const at = Date.now();
      for (const id of again) heldAt.current.set(id, at);
      setBatch((b) => [...b, ...again.filter((id) => !b.includes(id))]);
      holdOnServer(again, holdSeconds(undoMs));
    }
    // A page whose send did not happen (another send running, or a failed one) is offered to send by hand.
    setTried((t) => new Set([...t, ...ids.filter((id) => !again.includes(id))]));
    if (ok.length) await send(ok);
  };
  useEffect(() => {
    if (!batch.length || capturing) return;
    // The next page whose own wait ends; every page whose wait has ended by then goes with it.
    const dueOf = (id: string) => (heldAt.current.get(id) ?? Date.now()) + undoMs;
    const next = Math.min(...batch.map(dueOf));
    const timer = setTimeout(() => {
      const now = Date.now();
      const due = batch.filter((id) => dueOf(id) <= now + 5);
      if (due.length) void commitRef.current(due);
    }, Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [batch, capturing, undoMs]);
  // Leaving the page clears the phone's hold (clearAll); the server's hold still sends the pages when their wait ends.
  // Undo is written on the server, tried again after a failure (it is idempotent, and wins over a hold that arrives after
  // it). A page the server says was already sent (the recovery run, or another phone) is named, never "Not sent".
  async function undo() {
    const ids = batch, version = epoch.current;
    for (const id of ids) undoneSynced.current.add(id);
    keepUndone(ids);
    setBatch([]);
    const notSent = (n: number) => (n === 1 ? "Not sent. The page waits here. Open it to send it." : "Not sent. The pages wait here. Open one to send it.");
    setMessage({ text: notSent(ids.length), failed: false });
    const released = await unholdOnServer(ids);
    if (version !== epoch.current || !sessionCurrent.current || !released) return;
    const already = ids.filter((id) => !released.includes(id));
    if (!already.length) return;
    const fresh = await load().catch(() => null);
    if (version !== epoch.current) return;
    const numbers = already.map((id) => fresh?.photos.find((p) => p.id === id)?.pageNumber).filter((n): n is number => Boolean(n)).sort((a, b) => a - b);
    const named = numbers.length === already.length
      ? `${numbers.length === 1 ? "Page" : "Pages"} ${numbers.length < 2 ? numbers[0] : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`} ${numbers.length === 1 ? "was" : "were"} already sent for marking.`
      : `${already.length === 1 ? "1 page was" : `${already.length} pages were`} already sent for marking.`;
    const kept = ids.length - already.length;
    setMessage({ text: kept ? `${named} ${notSent(kept)}` : named, failed: false });
  }

  // Photos still queued on this phone (#3): a camera shot is not in the phone's photos, so leaving now would lose it.
  // The browser asks before the page closes while any photo is waiting or sending.
  const queued = uploads.some((u) => u.status === "waiting" || u.status === "uploading");
  useEffect(() => {
    if (!queued) return;
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [queued]);

  // Duplicates (#4) are information, not a problem: "Page 27 is already scanned" clears itself after a while, outside the
  // capture screen. One that offers "Use this new photo instead" clears the same way, keeping the first photo.
  const duplicateTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (capturing) return;
    for (const u of uploads) {
      if (u.status !== "refused" || u.reason !== "duplicate" || duplicateTimers.current.has(u.key)) continue;
      const version = epoch.current;
      duplicateTimers.current.set(u.key, setTimeout(() => {
        duplicateTimers.current.delete(u.key);
        if (version !== epoch.current) return;
        if (!uploadsRef.current.some((x) => x.key === u.key && x.status === "refused" && x.reason === "duplicate")) return;
        const url = urls.current.get(u.key);
        if (url) { URL.revokeObjectURL(url); urls.current.delete(u.key); }
        putUploads(uploadsRef.current.filter((x) => x.key !== u.key));
      }, duplicateMs));
    }
  }, [uploads, capturing, putUploads, duplicateMs]);
  useEffect(() => () => { for (const t of duplicateTimers.current.values()) clearTimeout(t); duplicateTimers.current.clear(); }, []);
  /** "Use this new photo instead" (#4): the new photo goes up again and replaces the page's ready photo, not sent yet. */
  function takeInstead(key: string) {
    const u = uploadsRef.current.find((x) => x.key === key);
    if (!u?.replaceable) return;
    const old = u.replaceable;
    const timer = duplicateTimers.current.get(key);
    if (timer) { clearTimeout(timer); duplicateTimers.current.delete(key); }
    setBatch((b) => b.filter((id) => id !== old));
    // The old photo leaves the Undo: its server hold goes, so the server never sends it while the swap runs.
    releaseHolds([old]);
    patchUpload(key, { status: "waiting", reason: undefined, replaceOf: old, replaceable: undefined, page: undefined, reservation: undefined });
    pump();
  }
  /** The input a retake opens (#6): a saved page and a camera shot open the camera, a photo chosen from the phone's photos opens them again. */
  const retakeInput = (t: StackTile): "camera" | "library" => (t.uploadKey && uploads.find((u) => u.key === t.uploadKey)?.source !== "camera" ? "library" : "camera");

  // Offline: say so, and send the photos that failed for it when the phone is back online.
  useEffect(() => {
    const update = () => {
      const on = navigator.onLine !== false;
      setOnline(on);
      if (!on) return;
      const failed = uploadsRef.current.filter((u) => u.status === "refused" && u.reason === "unavailable");
      if (!failed.length) return;
      putUploads(uploadsRef.current.map((u) => (failed.includes(u) ? { ...u, status: "waiting" as const, reason: undefined } : u)));
      pumpRef.current();
    };
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [putUploads]);

  async function remove(t: StackTile) {
    const version = epoch.current;
    if (!sessionCurrent.current) return;
    setSheet(null);
    if (t.uploadKey) {
      const url = urls.current.get(t.uploadKey);
      if (url) { URL.revokeObjectURL(url); urls.current.delete(t.uploadKey); }
      const reservation = uploadsRef.current.find((u) => u.key === t.uploadKey)?.reservation;
      // The parent asked for this delete, so it may remove a photo that reached the server after a lost answer.
      if (reservation) void api(`/api/account/scans/${reservation}`, { method: "DELETE" }).then(() => load()).catch(() => {});
      putUploads(uploadsRef.current.filter((u) => u.key !== t.uploadKey));
      return;
    }
    if (!t.photoId) return;
    try {
      await api(`/api/account/scans/${t.photoId}`, { method: "DELETE" });
      if (version !== epoch.current || !sessionCurrent.current) return;
      const url = urls.current.get(t.photoId);
      if (url) { URL.revokeObjectURL(url); urls.current.delete(t.photoId); }
      setBatch((b) => b.filter((id) => id !== t.photoId));
      setMessage({ text: "Photo deleted.", failed: false });
      wakeAll();
      await load();
    } catch { if (version === epoch.current && sessionCurrent.current) setMessage({ text: "We could not delete this photo. Try again.", failed: true }); }
  }

  /** Pushes the capture screen's own history entry (same address), so Back closes the screen and the photos keep sending. */
  function pushEntry() {
    if (entry.current) return;
    try { history.pushState({ ...((history.state as Record<string, unknown> | null) ?? {}), [CAPTURE_ENTRY]: true }, ""); entry.current = true; } catch {}
  }
  /** "Scan pages": the capture screen, and the camera in the same tap. `from`: the control that opened it, for focus on close. */
  function scan(which: "camera" | "library" = "camera", from = "dock") {
    opener.current = from;
    setShots([]); setAnnounce(""); setCapturing(true);
    if (phone) { capturingRef.current = true; pushEntry(); }
    open(which);
  }
  useEffect(() => { capturingRef.current = phone && capturing; shotsRef.current = shots; });
  useEffect(() => () => pickWatch.current?.(), []);
  function done() {
    pickFromCapture.current = false;
    capturingRef.current = false;
    setCapturing(false);
    if (!tipsSeen) { tipsFlag.write(); setTipsDone(true); }
  }
  const doneRef = useRef(done);
  useEffect(() => { doneRef.current = done; });
  // Back while capturing closes the capture screen (#915). Any other close (Done, ✕, a cancelled first pick) takes back
  // the entry it pushed, only while that entry is still the current one, so no close ever goes back twice.
  useEffect(() => {
    if (!(phone && capturing)) {
      if (entry.current) { entry.current = false; if (ownEntry()) history.back(); }
      return;
    }
    const pop = () => { if (entry.current && !ownEntry()) { entry.current = false; doneRef.current(); } };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [phone, capturing]);
  // The capture screen shows only when the photos loaded; the load-error view keeps the account's frame.
  const captureShown = phone && capturing && !(loadFailed && !listing);
  // The capture screen is full screen (#915): the account's frame hides only while it is shown.
  useEffect(() => {
    if (!captureShown) return;
    const html = document.documentElement;
    html.classList.add(CAPTURE_CLASS);
    return () => html.classList.remove(CAPTURE_CLASS);
  }, [captureShown]);
  // Focus goes to the screen's ✕ when it opens, and back to the control that opened it when it closes.
  const wasShown = useRef(false);
  useEffect(() => {
    if (captureShown) { wasShown.current = true; closeButton.current?.focus(); return; }
    if (!wasShown.current) return;
    wasShown.current = false;
    const back = document.querySelector<HTMLElement>(`[data-capture-opener="${opener.current}"]`) ?? document.querySelector<HTMLElement>('[data-capture-opener="dock"]');
    back?.focus();
  }, [captureShown]);

  const retakeKey = (t: StackTile) => t.photoId ?? t.uploadKey;
  const note = waitingNote(stack);
  const room = roomNote(stack);
  // Pages that need another photo, and pages the photo check kept back, stepped through one at a time.
  const problemTiles = tiles.filter((t) => t.status === "ready" && t.photoId && problems[t.photoId]);
  const fixes = [...stack.addingTiles.filter((t) => t.retake).reverse(), ...stack.refused, ...problemTiles];
  const fix = fixes.length ? fixes[retakeAt % fixes.length] : null;
  // A page held for Undo, or kept back by it, has no Send of its own on the phone until Undo kept it.
  // Any ready page not waiting out its Undo after it was held once (undone, kept back, or a send that failed) can be sent by hand.
  const manual = stack.readyIds.filter((id) => !auto || (!batch.includes(id) && (undone.has(id) || Boolean(problems[id]) || tried.has(id))));
  // The dock's Send leaves out pages the photo check flagged: those go only by their own "Send anyway".
  const plain = manual.filter((id) => !problems[id]);

  /** "Retake page 19": the page a retake is for, by its printed number. */
  const retakeWords = (t: StackTile) => `Retake ${t.label.split(" · ")[0].toLowerCase()}`;
  // While a page with a known code waits for its retake, the dock's main button retakes it (F5), so the new photo replaces
  // the old one. Other pages still go in with Scan pages beside it.
  const dockRetake = phone && fix?.photoId && fix.status !== "checking" ? fix : null;
  /** What a page that needs another photo offers. A photo that never reached us is chosen again (or tried again); a saved one is retaken. */
  // A refusal not about the photo itself (#5) keeps the photo and offers Try again; a limit says to wait first.
  const retryCheck = (id: string) => {
    blurSince.current.delete(id);
    asked.current.delete(id); busyAsked.current.delete(id);
    setFailedChecks((s) => { const next = new Set(s); next.delete(id); return next; });
    if (failedChecks.has(id) && listing?.photos.find((p) => p.id === id)?.check === "checking") return;
    asked.current.set(id, Date.now());
    const version = epoch.current;
    void api(`/api/account/scans/${id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" } })
      .then(() => { if (version === epoch.current) return load(); })
      .catch(() => { if (version === epoch.current) setFailedChecks((s) => new Set(s).add(id)); });
  };
  const fixAction = (t: StackTile, { className = "btn", retake = retakeWords(t) }: { className?: string; retake?: string } = {}) => {
    if (t.status === "checking") return null;
    if (t.refusal === "check-timeout" && t.photoId) return <button type="button" className={className} onClick={() => retryCheck(t.photoId!)}>Retry</button>;
    if (t.uploadKey && NOT_THE_PHOTO.includes(t.refusal ?? "")) return <button type="button" className={className} onClick={() => { patchUpload(t.uploadKey!, { status: "waiting", reason: undefined }); pump(); }}>{t.retake ? "Retry" : "Try again"}</button>;
    if (t.refusal === "frequency" || t.refusal === "daily" || t.refusal === "quota" || t.refusal === "duplicate") return null;
    if (!phone) return null;
    // A camera shot is never in the phone's photos (#6): its retake opens the camera.
    const input = retakeInput(t);
    return <button type="button" className={className} onClick={() => open(input, retakeKey(t))}>{t.uploadKey ? input === "camera" ? "Retake" : "Choose another photo" : retake}</button>;
  };

  const sheetImage = openTile ? (fullImage && fullImage.id === openTile.photoId ? fullImage.url : thumbOf(openTile)) : undefined;
  const tileSheet = openTile && <Sheet label={openTile.title} onClose={() => setSheet(null)}>
    <div className="scan-sheet-ph">{sheetImage ? <Image unoptimized width={600} height={800} src={sheetImage} alt={`Photo of ${openTile.title} for ${name}`} /> : <span className="scan-ph-empty" />}</div>
    <p className="scan-sheet-eyebrow">{openTile.title}</p>
    {openTile.status === "refused" && openTile.refusal ? <>
      <h2>{refusalCopy(openTile.refusal).title}</h2>
      <p>{refusalCopy(openTile.refusal).action}</p>
      {openTile.refusal === "check-timeout" && openTile.photoId ? <button type="button" className="btn" onClick={() => { retryCheck(openTile.photoId!); setSheet(null); }}>Retry</button> : openTile.uploadKey && NOT_THE_PHOTO.includes(openTile.refusal ?? "")
        ? <button type="button" className="btn" onClick={() => { patchUpload(openTile.uploadKey!, { status: "waiting", reason: undefined }); setSheet(null); pump(); }}>{openTile.retake ? "Retry" : "Try again"}</button>
        : phone && <button type="button" className="btn" onClick={() => open(retakeInput(openTile), retakeKey(openTile))}>{retakeInput(openTile) === "library" ? "Choose another photo" : "Take another photo"}</button>}
      {!phone && <p className="small">Take it again with your phone. The page waits there.</p>}
    </> : openTile.hint === "offline" ? <>
      <h2>This photo is waiting for a connection.</h2>
      <p>Keep this page open. It sends when you are back online.</p>
    </> : openTile.status === "waiting" ? <>
      <h2>{openTile.hint === "room" ? "There is no room for this photo yet." : "This photo is waiting its turn."}</h2>
      <p>{roomNote(stack) ?? "It keeps its place and goes on its own."}</p>
    </> : <>
      <h2>{openTile.status === "ready" ? (checkProblem?.photo === openTile.photoId ? "Check this photo." : "We can read this page.") : openTile.status === "sent" ? "Sent for marking." : openTile.status === "unavailable" ? "We cannot check pages of this printing yet." : openTile.status === "saved" ? "Photo saved." : "We are checking this page."}</h2>
      {openTile.status === "unavailable" && <p>The photo stays here.</p>}
      {openTile.status === "sent" && (marking && openTile.photoId ? <Link className="btn ghost" href={`/account/scan/results/${openTile.photoId}`}>View page results</Link> : <p>Marking is not ready yet. The page waits here.</p>)}
      {openTile.status === "ready" && openTile.photoId && manual.includes(openTile.photoId) && !problems[openTile.photoId] && <button type="button" className="btn" disabled={sending} onClick={() => { const id = openTile.photoId!; setSheet(null); void send([id]); }}>Send for marking</button>}
    </>}
    {checks && openTile.photoId && openTile.status === "ready" && <ScanPreview key={openTile.photoId} photo={openTile.photoId} child={name}
      onRetake={phone ? () => open(retakeInput(openTile), retakeKey(openTile)) : undefined}
      onSendAnyway={sending ? undefined : () => { const id = openTile.photoId!; setSheet(null); setProblems((p) => { const { [id]: _gone, ...rest } = p; void _gone; return rest; }); void send([id]); }}
      onProblem={onCheckProblem} />}
    <div className="scan-sheet-actions">
      {(openTile.photoId || openTile.uploadKey) && openTile.status !== "adding" && <button type="button" className="scan-link" onClick={() => void remove(openTile)}>Delete this photo</button>}
      <button type="button" className="scan-link" data-first-focus={openTile.status === "refused" ? undefined : true} onClick={() => setSheet(null)}>Close</button>
    </div>
  </Sheet>;

  const notice = sheet?.kind === "notice" && <Sheet label="Before you take a photo" onClose={() => { replacing.current = null; setSheet(null); }}>
    <h2>Before you take a photo</h2>
    <p>We keep one private page photo for up to 90 days. We remove photo details such as the location. We do not keep the original camera file.</p>
    <p>We check each photo as soon as you take it. To do that, we send the whole page photo to an AI service. Your child&apos;s first name and the printed page code can be in the photo.</p>
    <p>You and our admin team can view the photo. You can delete it sooner. We keep marks and the AI&apos;s reading of written answers until your family account is deleted. <Link href="/privacy">Read about privacy</Link>.</p>
    {acknowledged
      ? <button type="button" className="btn" onClick={() => setSheet(null)}>Close</button>
      : <button type="button" className="btn" onClick={() => acknowledge(sheet.then)}>Got it</button>}
  </Sheet>;

  const names = childrenList.map((c) => c.first_name);
  const siblings = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : null;
  const tipList = <ul className="scan-tips">
    <li>{ICONS.fold}<span><b>Open the book flat</b></span></li>
    <li>{ICONS.light}<span><b>Good light, no flash</b>Keep your hand&apos;s shadow off the page. If you see a shiny patch, tilt the book or step to the side.</span></li>
    <li>{ICONS.corners}<span><b>Fill the photo with the page</b>Hold the phone close, with the corners and the small code in view.</span></li>
    <li>{ICONS.camera}<span><b>Snap all your pages, then tap Done</b>Already took photos? Pick them from the photo button in the camera.</span></li>
    {/* Only a family with the photo checks is told about retakes; without them the photos are kept for marking later. */}
    <li>{ICONS.anyOrder}<span><b>Any order is fine</b>{checks ? <>We&apos;ll tell you if a page needs a retake.</> : <>We keep the photos to mark {name}&apos;s work later.</>}</span></li>
    {/* The code on each page files it with its own child (#915), so siblings' pages go in one scan with no switch. The list
        holds only children whose plan opens scanning, so every child named here can take their pages. */}
    {siblings && <li>{ICONS.check}<span><b>Scanning for {siblings}?</b>Snap any page. Each one goes to the right child.</span></li>}
  </ul>;
  const tipsSheet = sheet?.kind === "add" && <Sheet label="How to scan" onClose={() => setSheet(null)}>
    <h2>How to scan</h2>
    {tipList}
    <p className="small">Photos are private and kept for 90 days. <button type="button" className="scan-link" onClick={() => setSheet({ kind: "notice", then: null })}>More about photos</button></p>
    <button type="button" className="btn" data-first-focus onClick={() => setSheet(null)}>Close</button>
  </Sheet>;

  // Which child's pages the screen shows (F4): a small switch, only on the home screen. Taking photos needs no choice, since
  // each page's code files it with its own child, so the tips and the camera screens have none.
  const childPicker = childrenList.length > 1 && !capturing && <label className="scan-child"><span>Showing:</span>
    <span className="scan-child-pick">
      <select value={child} disabled={uploads.some((u) => u.status !== "refused" || u.reason === "unavailable") || sending || batch.length > 0} onChange={(e) => { uploadsRef.current.forEach(release); clearAll(); setMessage(null); setChild(e.target.value); }}>
        {childrenList.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
      </select>
      <span aria-hidden="true">▾</span>
    </span>
  </label>;

  const inputs = phone && <>
    <input ref={camera} hidden aria-label="Take a photo of a page" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={(e) => { add(e.target.files, "camera"); e.target.value = ""; }} />
    <input ref={library} hidden aria-label="Choose photos of pages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" onChange={(e) => { add(e.target.files, "library"); e.target.value = ""; }} />
  </>;

  const status = message && <p role={message.failed ? "alert" : "status"} className={`acct-alert${message.failed ? "" : " acct-saved"}`}>{message.text}</p>;
  const offline = !online && <p role="alert" className="scan-offline">You are offline. Keep this page open: your photos send when you are back online.</p>;
  const focusLine = phone && focus && focus.childId === child && <p className="scan-focus">Take a photo of {focus.label}.</p>;
  const elsewhereNote = elsewhere.length > 0 && <p className="scan-spread-note" role="status">{elsewhere.map((e) => `${e.page ? `Page ${e.page}` : "A page"} went to ${e.child}'s pages.`).join(" ")}</p>;
  // Duplicates (#4): information that clears itself. A ready photo not sent yet can be swapped for the new one; once that
  // photo is sent, it cannot.
  const duplicatesNote = stack.duplicates.length > 0 && <div className="scan-dup" role="status">
    {stack.duplicates.map((t) => {
      const swap = t.replaceable && !photos.some((p) => p.id === t.replaceable && p.sentAt) ? t.replaceable : null;
      return <p key={t.key} className="scan-spread-note">{duplicateNote(t)}{swap && <> <button type="button" className="scan-link" onClick={() => takeInstead(t.key)}>Use this new photo instead</button></>}</p>;
    })}
  </div>;
  const undoBar = batch.length > 0 && <div className="scan-undo" role="status">
    <span><i aria-hidden="true">{ICONS.check}</i>{batch.length === 1 ? "1 page sends for marking in a moment" : `${batch.length} pages send for marking in a moment`}</span>
    <button type="button" className="scan-link" onClick={() => void undo()}>Undo</button>
  </div>;

  if (loadFailed && !listing) {
    return <div className="scan-pages">{childPicker}<p role="alert" className="acct-alert">We cannot load photos. Try again.</p>
      <button type="button" className="btn ghost" onClick={() => void load().catch(() => setLoadFailed(true))}>Try again</button></div>;
  }

  // Step 3: the capture screen, a calm tray (meeting of 2026-11-14, Cedric and Savar). The phone's own camera opens for each
  // photo (one tap each, as browsers ask). Between photos the tray shows only the photos taken, each sending or sent: no
  // page verdict and no retake while the parent takes pages. Each page is checked on the server as it arrives, so after
  // Done home shows the pages that need another photo at the top, mostly with no wait. A photo that could not be sent
  // (offline, too large, cannot open, a limit) says so on its thumbnail at once, as that cannot wait for Done.
  if (captureShown) {
    type Shot = { key: string; n: number; state: "busy" | "added" | "stuck"; thumb?: string; note?: string; tile?: StackTile };
    const shotOf = (key: string, n: number): Shot => {
      const failed = stack.refused.find((t) => t.uploadKey === key);
      if (failed) return SENDING_PROBLEMS.includes(failed.refusal ?? "") ? { key, n, state: "stuck", thumb: thumbs[key], note: failed.reason ?? undefined, tile: failed } : { key, n, state: "added", thumb: thumbs[key] };
      if (landed[key]) return { key, n, state: "added", thumb: thumbs[landed[key]] || thumbs[key] };
      const sending = stack.addingTiles.find((t) => t.uploadKey === key);
      if (sending) return sending.hint === "offline" ? { key, n, state: "stuck", thumb: thumbs[key], note: sending.reason ?? undefined, tile: sending } : { key, n, state: "busy", thumb: thumbs[key] };
      const id = landed[key];
      return { key, n, state: "added", thumb: (id && thumbs[id]) || thumbs[key] };
    };
    const list = shots.map((k, i) => shotOf(k, i + 1));
    // The day's pages that have a photo, out of the day's pages: "Day 4 · 3 of 8".
    const head = strip ? `${strip.day} · ${strip.tiles.filter((t) => t.state !== "todo").length} of ${strip.tiles.length}` : list.length === 1 ? "1 photo" : `${list.length} photos`;
    const shotLabel = (s: Shot) => `Photo ${s.n}, ${s.state === "busy" ? "sending" : s.state === "added" ? "added" : (s.note ?? "not sent").toLowerCase()}`;
    return <div className="scan-pages is-capture">
      {inputs}
      <div className="scan-cam scan-tray" role="region" aria-label="Scan pages">
        <div className="scan-cam-top">
          <button ref={closeButton} type="button" className="scan-cam-x" onClick={done} aria-label="Close the camera"><span aria-hidden="true">✕</span></button>
          <p><b>{head}</b></p>
          <button type="button" className="scan-cam-done" onClick={done}>Done</button>
        </div>
        {offline}
        {elsewhereNote}
        <div className="scan-tray-msg">
          <b>{list.length ? (list.length === 1 ? "1 photo taken" : `${list.length} photos taken`) : "Take a photo of the first page."}</b>
          <span>{list.length ? "Take the next page, or tap Done when you've finished." : "Fill the photo with the page, with all four corners in view."}</span>
        </div>
        <p className="sr-only" aria-live="polite">{announce}</p>
        {list.length > 0 && <ol className="scan-shots" aria-label="Photos taken">
          {list.map((s) => <li key={s.key} className={`is-${s.state}`}>
            <span className="scan-shot-ph" role="img" aria-label={shotLabel(s)}>
              {s.thumb ? <Image unoptimized width={240} height={320} src={s.thumb} alt="" /> : <span className="scan-ph-empty" />}
              {s.state !== "stuck" && <span className="scan-shot-flag" aria-hidden="true">{s.state === "added" ? ICONS.check : <span className="scan-spin" />}</span>}
            </span>
            {s.state === "stuck" && <span className="scan-shot-note">{s.note}</span>}
            {s.state === "stuck" && s.tile?.refusal && fixAction(s.tile, { className: "scan-link scan-shot-fix" })}
          </li>)}
        </ol>}
        <div className="scan-cam-foot">
          <button type="button" className="scan-tray-go" onClick={() => open("camera")} aria-label={list.length ? "Take next page" : "Take a photo"}><span aria-hidden="true">◉</span> {list.length ? "Take next page" : "Take a photo"}</button>
          <button type="button" className="scan-link" onClick={() => open("library")}>Choose from Photos</button>
        </div>
      </div>
      {notice}
    </div>;
  }

  const noBook = listing !== null && !listing.pages.length && !photos.length;
  // Step 1: the first visit only, before any photo: the tips, then Scan pages.
  if (phone && listing && !tipsSeen && !tipsDone && !photos.length && !uploads.length && !noBook) {
    return <div className="scan-pages is-start">
      {inputs}
      {focusLine}
      <h2 className="scan-start-h">Scan pages in a few seconds</h2>
      {tipList}
      <p className="small scan-privacy-line">Photos are private and kept for 90 days. <button type="button" className="scan-link" onClick={() => setSheet({ kind: "notice", then: null })}>More about photos</button></p>
      {status}
      <div className="scan-dock">
        <div className="scan-dock-row is-choice">
          <button type="button" className="btn" data-capture-opener="start" disabled={!child} onClick={() => scan("camera", "start")}>Scan pages</button>
          <button type="button" className="scan-link" data-capture-opener="start-library" disabled={!child} onClick={() => scan("library", "start-library")}>Choose from your photos</button>
        </div>
      </div>
      {notice}
    </div>;
  }

  const stripKeys = new Set(strip?.tiles.map((t) => t.tileKey).filter(Boolean));
  const others = stack.days.map((d) => ({ ...d, tiles: d.tiles.filter((t) => !stripKeys.has(t.key)) })).filter((d) => d.tiles.length);
  const group = (key: string, title: string, list: StackTile[], extra?: ReactNode, aside?: string) => <section key={key} className="scan-group" aria-label={title}>
    <div className="scan-group-h"><h2>{title}</h2>{aside && <span className="scan-count">{aside}</span>}</div>
    {extra}
    <ul className="scan-tiles">{list.map((t) => <Tile key={t.key} tile={t} thumb={thumbOf(t)} onOpen={() => setSheet({ kind: "tile", key: t.key })} />)}</ul>
  </section>;
  const pageName = (p: StackPhoto) => { const d = listing?.pages.find((x) => x.id === p.pageId); return d?.name ? `Page ${p.pageNumber} · ${d.name}` : `Page ${p.pageNumber}`; };
  const stripTile = (t: StripTile) => <li key={t.pageId} className={`scan-strip-tile is-${t.state}`}>
    <button type="button" aria-label={t.label} data-capture-opener={`strip:${t.pageId}`} onClick={() => (t.tileKey ? setSheet({ kind: "tile", key: t.tileKey }) : phone ? scan("camera", `strip:${t.pageId}`) : undefined)} disabled={!t.tileKey && !phone}>
      <span className="scan-strip-page"><span className="scan-strip-glyph" aria-hidden="true">{STRIP_FACE[t.state].glyph}</span></span>
      <span className="scan-strip-n">{t.pageNumber}</span>
      <span className="scan-strip-w" aria-hidden="true">{t.state === "checking" && tiles.find((tile) => tile.key === t.tileKey)?.retake ? `Checking page ${t.pageNumber}…` : STRIP_FACE[t.state].word}</span>
    </button>
  </li>;
  const line = scoreLine(name, today);
  // The child's Workbooks page shows the history: link there. Else nothing here (2026-11-14): the strip steps back.
  const historyThere = allPages.includes(child);

  return <div className={`scan-pages is-stack${phone ? "" : " is-desktop"}`}>
    {inputs}
    {childPicker}
    {offline}
    {focusLine}
    {noBook && <p className="scan-empty">No workbook to scan yet. Pages show here when {name}&apos;s first workbook arrives.</p>}
    {/* A page that needs another photo comes first, above the day (F5): the one thing to do before more pages. */}
    {loadFailed && <p role="alert" className="acct-alert">We could not refresh the photos. <button type="button" className="scan-link" onClick={() => void load().catch(() => {})}>Retry</button></p>}
    {fix && <section className="scan-need" aria-label={fix.status === "checking" ? "Checking your new photo" : "Pages that need another photo"}>
      <div className="scan-need-h"><h2>{fix.status === "checking" ? `Checking your new photo of ${fix.label.toLowerCase()}…` : retakeLine(fixes.filter((t) => t.status !== "checking").length)}</h2>{fixes.length > 1 && <button type="button" className="scan-link" onClick={() => setRetakeAt((n) => n + 1)}>Next ({(retakeAt % fixes.length) + 1} of {fixes.length})</button>}</div>
      <p className="scan-need-title" role={fix.status === "checking" ? "status" : undefined}>{fix.status === "checking" ? <><span className="scan-spin" aria-hidden="true" /> <b>{fix.reason}</b></> : <b>{fix.title}</b>}{fix.reason && fix.status !== "checking" ? ` · ${fix.reason}` : ""}</p>
      <div className="scan-pair">
        <figure><button type="button" className="scan-pair-ph" onClick={() => setSheet({ kind: "tile", key: fix.key })} aria-label={`Open your photo of ${fix.title}`}>{thumbOf(fix) ? <Image unoptimized width={300} height={400} src={thumbOf(fix)} alt="" /> : <span className="scan-ph-empty" />}</button><figcaption>Your photo</figcaption></figure>
        <figure><span className="scan-pair-ph">{GOOD_PHOTO}</span><figcaption>Like this</figcaption></figure>
      </div>
      <p>{fix.photoId && problems[fix.photoId] ? PHOTO_PROBLEM_TEXT[problems[fix.photoId]] : fix.refusal ? `${refusalCopy(fix.refusal).title} ${refusalCopy(fix.refusal).action}` : ""}</p>
      {fix.photoId && problems[fix.photoId]
        ? <div className="scan-check-actions">{phone && <button type="button" className="btn" onClick={() => open("camera", fix.photoId)}>Take again</button>}
          <button type="button" className="btn ghost" disabled={sending} onClick={() => { const id = fix.photoId!; setProblems((p) => { const { [id]: _gone, ...rest } = p; void _gone; return rest; }); void send([id]); }}>Send anyway</button></div>
        : fixAction(fix) ?? (!phone && <p className="small">Take it again with your phone. The page waits there.</p>)}
    </section>}

    {shownStrip && <section className="scan-strip" aria-label={`${shownStrip.day} pages`}>
      <div className="scan-strip-h">
        <div className="scan-strip-day">
          <button type="button" className="scan-strip-step" aria-label="Previous day" disabled={!shownStrip.hasPrevious} onClick={() => stepDay(1)}><span aria-hidden="true">‹</span></button>
          <h2 aria-live="polite">{shownStrip.allDone ? "All pages of this workbook are done" : shownStrip.complete ? `${shownStrip.day} done` : shownStrip.day}{shownStrip.complete && <i className="scan-done-tick" aria-hidden="true">{ICONS.check}</i>}</h2>
          <button type="button" className="scan-strip-step" aria-label="Next day" disabled={shownStrip.back === 0} onClick={() => stepDay(-1)}><span aria-hidden="true">›</span></button>
        </div>
        <p className="scan-strip-count">{shownStrip.countText}</p>
      </div>
      <ul className="scan-strip-tiles">{shownStrip.tiles.map(stripTile)}</ul>
      {shownStrip.nextDay && <p className="small">Next: {shownStrip.nextDay}. Scan its pages when they are finished. Any order is fine.</p>}
      {!shownStrip.complete && shownStrip.back === 0 && <p className="small">Any order is fine.</p>}
    </section>}
    {unkeptNote && <p className="scan-spread-note" role="status">{unkeptNote}</p>}
    {elsewhereNote}
    {duplicatesNote}
    {status}
    {undoBar}
    {stack.adding > 0 && <p className="scan-still" role="status">Keep this page open, {stack.adding === 1 ? "1 photo" : `${stack.adding} photos`} still sending.</p>}
    {!listing && <p className="small" role="status">Loading photos...</p>}

    {today.pages.length > 0 && <section className="scan-today" aria-label="Today's pages">
      <div className="scan-group-h"><h2>Today</h2></div>
      {marking && line && <p className="scan-score-line">{line}</p>}
      <ul className="scan-results">{today.pages.map((p) => <li key={p.id}>
        {marking
          ? <Link href={`/account/scan/results/${p.id}`}><span><b>{pageName(p)}</b><span className={p.marks?.complete && !p.marks.toPractise ? "is-good" : ""}>{pageScore(p.marks)}</span></span><span aria-hidden="true">›</span></Link>
          : <span className="scan-results-row"><b>{pageName(p)}</b><span>Sent for marking. Marking is not ready yet.</span></span>}
      </li>)}</ul>
      {marking && <p className="small">Questions to practise come back in the next workbook.{historyThere && <> <Link className="scan-link" href={allPagesPath(child)}>See all progress</Link></>}</p>}
    </section>}

    {stack.addingTiles.length > 0 && group("new", "New photos", stack.addingTiles, undefined, addingCount(stack))}
    {others.map((d) => group(d.key, d.label, d.tiles, undefined, d.tiles.length === 1 ? "1 photo" : `${d.tiles.length} photos`))}
    {/* No "Sent earlier" list (2026-11-14): the strip's ‹ and › reach the earlier days' pages. */}

    {/* No page history on this screen (2026-11-14): the strip's ‹ steps back through earlier days. "See all pages" only
        where the child's Workbooks page shows its history; else nothing more. */}
    {marking && child && historyThere && <p className="small scan-all"><Link className="scan-link" href={allPagesPath(child)}>See all pages</Link></p>}

    {listing && !noBook && (phone || (checks && plain.length > 0)) && <div className="scan-dock">
      {room ? <p className="small scan-room" role="status">{room}</p> : checks && !auto && note && <p className="small">{note}</p>}
      <div className="scan-dock-row">
        {dockRetake && <button type="button" className="btn is-retake" onClick={() => open("camera", dockRetake.photoId)}>{ICONS.camera}{retakeWords(dockRetake)}</button>}
        {phone && <button type="button" className={`btn${dockRetake ? " ghost" : ""}`} data-capture-opener="dock" disabled={!child} onClick={() => scan()}>{dockRetake ? null : ICONS.camera}Scan pages</button>}
        {checks && plain.length > 0 && <button type="button" className={`btn${phone ? " ghost" : ""}`} disabled={sending} onClick={() => void send(plain)}>{sending ? "Sending..." : sendLabel(plain.length)}</button>}
      </div>
      {phone && <button type="button" className="scan-link" onClick={() => setSheet({ kind: "add" })}>How to scan</button>}
    </div>}
    {tileSheet}
    {notice}
    {tipsSheet}
  </div>;
}

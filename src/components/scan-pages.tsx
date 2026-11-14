"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { browserClient } from "@/lib/supabase-browser";
import { phoneCodeCheck, prepareScanPhoto } from "@/lib/scan-photo-browser";
import { addingCount, buildStack, refusalCopy, roomNote, sendLabel, spreadNote, waitingNote, type DayPage, type StackPhoto, type StackTile, type StackUpload, type UploadRefusal } from "@/lib/scan-stack";
import { dayStrip, pageScore, retakeLine, scoreLine, todaysPages, type StripState, type StripTile } from "@/lib/scan-day-strip";
import { PHOTO_PROBLEM_TEXT, type PhotoCheckView, type PhotoProblem } from "@/lib/scan-photo-check-text";
import { SCANNING_COOKIE, SCANNING_SECONDS } from "@/lib/scan-tab";
import { scanEventTicket } from "@/lib/scan-track";
import { busyWait, nextUploads, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "@/lib/scan-upload-queue";
import { ScanHistory } from "@/components/scan-history";
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
/** `reservation`: the photo id asked for at admission. It stays with the queued photo, so a lost answer takes no second upload slot. */
type Local = StackUpload & { file: File; replaces?: string; reservation?: string };

export type ScanListing = { marking?: boolean; checks: boolean; photos: StackPhoto[]; pages: DayPage[] };

const UPLOAD_REFUSALS: readonly string[] = ["qr", "page", "duplicate", "flat", "image", "size", "frequency", "quota"];
const uploadRefusal = (code: string): UploadRefusal => (UPLOAD_REFUSALS.includes(code) ? code as UploadRefusal : "unavailable");
/** What the server says of a photo id that can no longer take an upload: the lease ended or the photo went. A new id is needed. */
const ENDED: readonly string[] = ["expired", "rejected", "deleted", "refused"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** How long a photo waits before its check is asked again; a busy check (still running, #915) is asked again sooner. */
const CHECK_ASK_MS = 6000, BUSY_ASK_MS = 1500, QUICK_BUSY_ASKS = 8;
/** The stack is read this often while a page is being checked, so a finished check shows within about 2 s (#915). */
const CHECKING_POLL_MS = 2000;

/** Every request has a time limit, so one hung upload cannot hold its slot (#915). A request past it is a lost answer. */
async function api(path: string, init?: RequestInit, timeout = REQUEST_TIMEOUT_MS) {
  let response: Response;
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeout) : undefined;
  try { response = await fetch(path, { ...init, cache: "no-store", signal }); } catch { throw new Error("unavailable"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "unavailable");
  return data;
}
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
};

const STATUS_WORDS: Record<StackTile["status"], string> = {
  adding: "Sending", waiting: "Waiting to send", checking: "Checking", ready: "Ready", saved: "Saved", refused: "Needs another photo", unavailable: "Cannot be checked", sent: "Sent for marking",
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
          {tile.status === "ready" || tile.status === "sent" ? ICONS.check : bad ? "!" : tile.status === "adding" || tile.status === "checking" ? <span className="scan-spin" /> : null}
        </span>
      </span>
      <span className="scan-tile-l">{tile.label}</span>
      {tile.reason ? <span className="scan-tile-s">{tile.reason}</span> : tile.status === "checking" || tile.status === "adding" || tile.status === "waiting" || tile.status === "sent" ? <span className="scan-tile-s">{STATUS_WORDS[tile.status]}</span> : null}
    </button>
  </li>;
}

/** How long a page that passed waits on the phone, with Undo, before it is sent for marking (#915). Nothing reaches the server before. */
export const UNDO_MS = 10_000;

const flagStore = (key: string) => ({
  subscribe: (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); },
  read: () => { try { return localStorage.getItem(key) === "seen"; } catch { return false; } },
  write: () => { try { localStorage.setItem(key, "seen"); window.dispatchEvent(new Event("storage")); } catch { /* blocked storage: this visit remembers */ } },
});

/** The glyph and the short word of each strip state: never colour alone. */
const STRIP_FACE: Record<StripState, { glyph: ReactNode; word: string }> = {
  marked: { glyph: ICONS.check, word: "Marked" }, marking: { glyph: "⋯", word: "Marking" }, sent: { glyph: "↑", word: "Sent" },
  ready: { glyph: "↑", word: "Sending" }, checking: { glyph: <span className="scan-spin" />, word: "Checking" }, saved: { glyph: "•", word: "Saved" },
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

export function ScanPages({ childrenList, parent, noticeAcknowledged, mode = "phone", focus = null, initial, undoMs = UNDO_MS, now = Date.now }: {
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
  now?: () => number;
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
  const [loadFailed, setLoadFailed] = useState(initial?.loadFailed ?? false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const listRequest = useRef(0);
  const appliedList = useRef(0);
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
  /** The phone's early code looks (#915), one photo at a time so several new photos never decode at once. */
  const codeLooks = useRef<Promise<void>>(Promise.resolve());
  const name = childrenList.find((c) => c.id === child)?.first_name ?? "your child";
  // #915: the first-visit tips, remembered per parent in this browser.
  const tipsFlag = useMemo(() => flagStore(`unica.scan-tips.v1:${parent}`), [parent]);
  const tipsSeen = useSyncExternalStore(tipsFlag.subscribe, tipsFlag.read, () => true);
  const [tipsDone, setTipsDone] = useState(false);
  // The capture screen (#915): open while the parent keeps taking photos; the shots are this session's local photos.
  const [capturing, setCapturing] = useState(false);
  const [shots, setShots] = useState<string[]>([]);
  const [landed, setLanded] = useState<Record<string, string>>({});
  /** Pages a code filed with a sibling's book (#915): "Page 12 went to Aisha's pages." */
  const [elsewhere, setElsewhere] = useState<{ page: number | null; child: string }[]>([]);
  const filedOf = useRef(new Map<string, { child_id?: string; child?: string; page?: number }>());
  // Auto-send with Undo (#915): the pages held on the phone, the ones already held once, the ones Undo kept back.
  const [batch, setBatch] = useState<string[]>([]);
  const held = useRef(new Set<string>());
  const [undone, setUndone] = useState<Set<string>>(() => new Set());
  const [problems, setProblems] = useState<Record<string, PhotoProblem>>({});
  const [retakeAt, setRetakeAt] = useState(0);
  const [online, setOnline] = useState(true);

  const putUploads = useCallback((next: Local[]) => { uploadsRef.current = next; setUploads(next); }, []);
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
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear(); fetching.current.clear(); asked.current.clear(); savedAsked.current.clear();
    running.current.clear(); wakeAll(); checking.current = false; replacing.current = null;
    setThumbs({}); setUnavailable(new Set()); putUploads([]); setListing(null); setSheet(null); setSending(false); setMessage(null); setLoadFailed(false);
    // A page held for Undo is not sent: it stays ready, and is held again on the next visit.
    held.current.clear(); filedOf.current.clear(); setBatch([]); setProblems({}); setShots([]); setLanded({}); setElsewhere([]); setCapturing(false); setRetakeAt(0);
  }, [putUploads, wakeAll]);

  const load = useCallback(async () => {
    const version = epoch.current;
    if (!sessionCurrent.current) return null;
    const request = ++listRequest.current;
    let data: ScanListing;
    try { data = await api(`/api/account/scans?child=${child}`); } catch (error) { if (version !== epoch.current || !sessionCurrent.current || request < appliedList.current) return null; throw error; }
    if (version !== epoch.current || !sessionCurrent.current || request < appliedList.current) return null;
    // Concurrent uploads can finish their list reads in either order. An older snapshot cannot remove a newer photo.
    appliedList.current = request;
    setListing(data); setLoadFailed(false);
    return data;
  }, [child]);

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
    const found = uploadsRef.current.filter((u) => u.status === "refused" && u.reservation && here.has(u.reservation));
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
        if (version === epoch.current) keepUrl(p.id, URL.createObjectURL(blob));
      } catch {} finally { fetching.current.delete(p.id); }
    };
    void (async () => { for (let i = 0; i < wanted.length; i += 2) { if (version !== epoch.current) return; await Promise.all(wanted.slice(i, i + 2).map(one)); } })();
  }, [listing, keepUrl]);

  // Checks (test families and admins): one photo at a time, the oldest first. A busy check is asked again later.
  const runChecks = useCallback(async () => {
    if (checking.current || !listing?.checks) return;
    checking.current = true;
    const version = epoch.current;
    try {
      for (;;) {
        const now = Date.now();
        const next = listing.photos.filter((p) => p.state === "saved" && p.check === "checking" && !unavailable.has(p.id) && now - (asked.current.get(p.id) ?? 0) > CHECK_ASK_MS)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!next || version !== epoch.current) return;
        asked.current.set(next.id, now);
        const answer = await api(`/api/account/scans/${next.id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => null);
        if (version !== epoch.current) return;
        const status = answer?.preview?.status;
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
  }, [listing, unavailable, load]);
  useEffect(() => { void runChecks(); }, [runChecks]);

  // Live: while a page is being checked, and always on a desktop beside the phone (D-273).
  const checkingNow = Boolean(listing?.photos.some((p) => p.check === "checking" || p.state === "pending"));
  const live = mode === "desktop" || checkingNow;
  useEffect(() => {
    if (!live || !child) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => {}); }, checkingNow ? CHECKING_POLL_MS : mode === "desktop" ? 5000 : 4000);
    return () => clearInterval(timer);
  }, [live, child, load, mode, checkingNow]);

  async function uploadOne(u: Local, version: number): Promise<{ id: string; thumb: Blob } | UploadRefusal> {
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    if (u.replaces) await api(`/api/account/scans/${u.replaces}`, { method: "DELETE" }).catch(() => {});
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    let body: Blob;
    try { body = await prepareScanPhoto(u.file); } catch (error) { return codeOf(error) === "size" ? "size" : "image"; }
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    lookForCode(u.key, body, version);
    // The same id again after a lost answer: the server answers with that photo's state and takes no second slot.
    let id = u.reservation ?? crypto.randomUUID();
    for (let fresh = false; ; fresh = true) {
      patchUpload(u.key, { reservation: id });
      const result = await sendPhoto(u.key, id, body, version);
      if (result === "sent") break;
      if (result !== "ended") return result;
      if (fresh) return "unavailable";
      id = crypto.randomUUID();
    }
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    savedAsked.current.add(id);
    // A failed save is asked again when the list next shows this photo as pending.
    await api(`/api/account/scans/${id}`, { method: "POST" }).catch(() => { if (version === epoch.current) savedAsked.current.delete(id); });
    return { id, thumb: body };
  }

  /**
   * The phone's early look at the page code while the photo sends (#915). It never holds the upload back: an unread code
   * only adds a hint to the tile, and the server reads the code again and alone decides.
   */
  function lookForCode(key: string, body: Blob, version: number) {
    const sending = () => version === epoch.current && uploadsRef.current.some((x) => x.key === key && x.status !== "refused");
    codeLooks.current = codeLooks.current.then(async () => {
      if (!sending()) return;
      if (await phoneCodeCheck(body) === "unread" && sending()) patchUpload(key, { codeUnread: true });
    }).catch(() => {});
  }

  /**
   * A `busy` answer: the photo keeps its place and asks again, for as long as it is on the screen (#915). After a short
   * wait it shows as waiting for room. False when the photo went (deleted, account or child changed): stop asking.
   */
  async function waitForRoom(key: string, tries: number, version: number) {
    const step = busyWait(tries);
    const here = () => version === epoch.current && sessionCurrent.current && uploadsRef.current.some((x) => x.key === key);
    if (!here()) return false;
    if (step.held && !uploadsRef.current.find((x) => x.key === key)?.held) patchUpload(key, { held: true });
    await nap(step.delayMs);
    return here();
  }

  async function sendPhoto(key: string, id: string, body: Blob, version: number): Promise<"sent" | "ended" | UploadRefusal> {
    let admission: { state: string } | null = null;
    let busy = 0;
    while (!admission) {
      if (version !== epoch.current) return "unavailable";
      try { admission = await api("/api/account/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, child, bytes: body.size }) }); }
      catch (error) {
        const code = codeOf(error);
        if (code === "busy") { if (await waitForRoom(key, busy++, version)) continue; return "unavailable"; }
        return ENDED.includes(code) ? "ended" : uploadRefusal(code);
      }
    }
    if (uploadsRef.current.find((x) => x.key === key)?.held) patchUpload(key, { held: false });
    for (let attempt = 0; ; attempt++) {
      if (version !== epoch.current) return "unavailable";
      try {
        const data = admission.state === "reserved" ? await api(`/api/account/scans/${id}`, { method: "PUT", body }, UPLOAD_TIMEOUT_MS) : await api(`/api/account/scans/${id}`);
        const state = data.photo?.state;
        const second = data.spread as { state?: string; page?: number } | undefined;
        if (second?.page && version === epoch.current && !["saved", "duplicate"].includes(second.state ?? "")) setUnkept((pages) => pages.includes(second.page!) ? pages : [...pages, second.page!].sort((a, b) => a - b));
        if (state === "pending" || state === "saved") { if (data.photo) filedOf.current.set(id, data.photo); return "sent"; }
        throw new Error(state === "processing" ? "uncertain" : ENDED.includes(state) ? state : "image");
      } catch (error) {
        const code = codeOf(error);
        // The reservation keeps its lease while it waits; a lease that ends answers `expired`, and the photo takes a new id.
        if (code === "busy") { if (await waitForRoom(key, busy++, version)) { attempt--; continue; } return "unavailable"; }
        // A lost answer: the photo may still be saving. Ask about the same photo, never send it twice.
        if ((code === "uncertain" || code === "unavailable") && attempt < 5) { admission = { state: "check" }; await wait(2000); continue; }
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
      if (typeof result === "string") patchUpload(next.key, { status: "refused", reason: result, held: false });
      else {
        keepUrl(result.id, URL.createObjectURL(result.thumb));
        setLanded((l) => ({ ...l, [next.key]: result.id }));
        const filed = filedOf.current.get(result.id);
        if (filed?.child_id && filed.child_id !== child) setElsewhere((e) => [...e, { page: filed.page ?? null, child: filed.child ?? "another child" }]);
        const old = urls.current.get(next.key);
        if (old) { URL.revokeObjectURL(old); urls.current.delete(next.key); }
        putUploads(uploadsRef.current.filter((u) => u.key !== next.key));
      }
      if (next.replaces) { const old = urls.current.get(next.replaces); if (old) { URL.revokeObjectURL(old); urls.current.delete(next.replaces); } }
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

  function add(files: FileList | null) {
    if (!files?.length || !sessionCurrent.current) return;
    const replaces = replacing.current;
    replacing.current = null;
    let list = uploadsRef.current;
    // A retake of a photo that never reached us replaces it here; a retake of a saved photo deletes that photo first.
    if (replaces?.startsWith("local:")) { release(list.find((u) => u.key === replaces)); list = list.filter((u) => u.key !== replaces); }
    const added: Local[] = [...files].map((file, i) => ({
      key: `local:${crypto.randomUUID()}`, file, status: "waiting" as const,
      replaces: i === 0 && replaces && !replaces.startsWith("local:") ? replaces : undefined,
    }));
    for (const u of added) {
      try { keepUrl(u.key, URL.createObjectURL(u.file)); } catch {}
    }
    putUploads([...list, ...added]);
    setShots((s) => [...s, ...added.map((u) => u.key)]);
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
    (which === "camera" ? camera : library).current?.click();
  }

  function acknowledge(then: "camera" | "library" | null) {
    const version = epoch.current;
    void api("/api/account/scans/notice", { method: "POST" }).then(() => { if (version === epoch.current) setAcknowledged(true); }).catch(() => {});
    setAcknowledged(true); setSheet(null);
    if (then) (then === "camera" ? camera : library).current?.click();
  }

  const photos = useMemo(() => (listing?.photos ?? []).map((p) => (unavailable.has(p.id) && p.check === "checking" ? { ...p, check: "unavailable" as const } : p)), [listing, unavailable]);
  const checks = Boolean(listing?.checks);
  const marking = Boolean(listing?.marking);
  const stack = useMemo(() => buildStack({ photos, uploads, pages: listing?.pages ?? [], checks }), [photos, uploads, listing, checks]);
  // A page named as not kept stops being named once a photo of it is in the stack.
  const unkeptNote = spreadNote(unkept.filter((n) => !photos.some((p) => listing?.pages.find((d) => d.id === p.pageId)?.pageNumber === n)));
  const tiles = useMemo(() => [...stack.refused, ...stack.addingTiles, ...stack.days.flatMap((d) => d.tiles), ...stack.sent], [stack]);
  const openTile = sheet?.kind === "tile" ? tiles.find((t) => t.key === sheet.key) ?? null : null;
  const thumbOf = (t: StackTile) => thumbs[t.photoId ?? t.uploadKey ?? ""];
  const phone = mode === "phone";
  const strip = useMemo(() => dayStrip({ photos, pages: listing?.pages ?? [], tiles, marking }), [photos, listing, tiles, marking]);
  const today = todaysPages(photos, now());

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
  // held once per visit; Undo keeps it here, ready, to send from its sheet. A new page restarts the wait, so a parent still
  // taking photos sends them together. Nothing reaches the server until the wait ends.
  const auto = phone && checks;
  useEffect(() => {
    if (!auto) return;
    const fresh = stack.readyIds.filter((id) => !held.current.has(id));
    if (!fresh.length) return;
    for (const id of fresh) held.current.add(id);
    setBatch((b) => [...b, ...fresh]);
  }, [auto, stack.readyIds]);
  const commitRef = useRef<(ids: string[]) => Promise<void>>(async () => {});
  commitRef.current = async (ids: string[]) => {
    const version = epoch.current;
    setBatch([]);
    // The photo check (#855) has the last word: a page it found a problem on is kept back for "Take again" or "Send anyway".
    const looked = await Promise.all(ids.map(async (id) => {
      const answer: { preview?: { status?: string }; photoCheck?: PhotoCheckView } | null = await api(`/api/account/scans/${id}/preview`).catch(() => null);
      return { id, answer };
    }));
    if (version !== epoch.current || !sessionCurrent.current) return;
    const ok: string[] = [], kept: Record<string, PhotoProblem> = {};
    for (const { id, answer } of looked) {
      if (!answer || answer.preview?.status !== "ready") { held.current.delete(id); continue; }
      const check = answer.photoCheck;
      if (check?.state === "done" && check.problem) kept[id] = check.problem; else ok.push(id);
    }
    if (Object.keys(kept).length) setProblems((p) => ({ ...p, ...kept }));
    if (ok.length) await send(ok);
  };
  useEffect(() => {
    if (!batch.length) return;
    const timer = setTimeout(() => void commitRef.current(batch), undoMs);
    return () => clearTimeout(timer);
  }, [batch, undoMs]);
  function undo() {
    setUndone((u) => new Set([...u, ...batch]));
    setBatch([]);
    setMessage({ text: batch.length === 1 ? "Not sent. The page waits here. Open it to send it." : "Not sent. The pages wait here. Open one to send it.", failed: false });
  }

  // Offline: say so, and send the photos that failed for it when the phone is back online.
  useEffect(() => {
    const update = () => {
      const on = navigator.onLine !== false;
      setOnline(on);
      if (!on) return;
      const failed = uploadsRef.current.filter((u) => u.status === "refused" && u.reason === "unavailable");
      if (!failed.length) return;
      putUploads(uploadsRef.current.map((u) => (failed.includes(u) ? { ...u, status: "waiting" as const, reason: undefined, codeUnread: undefined } : u)));
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

  /** "Scan pages": the capture screen, and the camera in the same tap. */
  function scan(which: "camera" | "library" = "camera") {
    setShots([]); setCapturing(true);
    open(which);
  }
  function done() {
    setCapturing(false);
    if (!tipsSeen) { tipsFlag.write(); setTipsDone(true); }
  }

  const retakeKey = (t: StackTile) => t.photoId ?? t.uploadKey;
  const note = waitingNote(stack);
  const room = roomNote(stack);
  // Pages that need another photo, and pages the photo check kept back, stepped through one at a time.
  const problemTiles = tiles.filter((t) => t.status === "ready" && t.photoId && problems[t.photoId]);
  const fixes = [...stack.refused, ...problemTiles];
  const fix = fixes.length ? fixes[retakeAt % fixes.length] : null;
  // A page held for Undo, or kept back by it, has no Send of its own on the phone until Undo kept it.
  const manual = stack.readyIds.filter((id) => !auto || (undone.has(id) && !batch.includes(id)) || problems[id]);

  const fixAction = (t: StackTile) => {
    if (t.uploadKey && t.refusal === "unavailable") return <button type="button" className="btn" onClick={() => { patchUpload(t.uploadKey!, { status: "waiting", reason: undefined, codeUnread: undefined }); pump(); }}>Try again</button>;
    if (t.refusal === "frequency" || t.refusal === "quota" || t.refusal === "duplicate") return null;
    if (!phone) return null;
    return <button type="button" className="btn" onClick={() => open(t.uploadKey ? "library" : "camera", retakeKey(t))}>{t.uploadKey ? "Choose another photo" : `Retake ${t.label.split(" · ")[0].toLowerCase()}`}</button>;
  };

  const tileSheet = openTile && <Sheet label={openTile.title} onClose={() => setSheet(null)}>
    <div className="scan-sheet-ph">{thumbOf(openTile) ? <Image unoptimized width={600} height={800} src={thumbOf(openTile)} alt={`Photo of ${openTile.title} for ${name}`} /> : <span className="scan-ph-empty" />}</div>
    <p className="scan-sheet-eyebrow">{openTile.title}</p>
    {openTile.status === "refused" && openTile.refusal ? <>
      <h2>{refusalCopy(openTile.refusal).title}</h2>
      <p>{refusalCopy(openTile.refusal).action}</p>
      {openTile.uploadKey && openTile.refusal === "unavailable"
        ? <button type="button" className="btn" onClick={() => { patchUpload(openTile.uploadKey!, { status: "waiting", reason: undefined, codeUnread: undefined }); setSheet(null); pump(); }}>Try again</button>
        : phone && <button type="button" className="btn" onClick={() => open(openTile.uploadKey ? "library" : "camera", retakeKey(openTile))}>{openTile.uploadKey ? "Choose another photo" : "Take another photo"}</button>}
      {!phone && <p className="small">Take it again with your phone. The page waits there.</p>}
    </> : openTile.hint === "code" && openTile.status !== "waiting" ? <>
      <h2>{refusalCopy("qr").title}</h2>
      <p>This photo is still sending, and we will read the code again. If we still cannot read it, we will ask you for another photo.</p>
    </> : openTile.status === "waiting" ? <>
      <h2>{openTile.reason ? "There is no room for this photo yet." : "This photo is waiting its turn."}</h2>
      <p>{roomNote(stack) ?? "It keeps its place and goes on its own."}</p>
    </> : <>
      <h2>{openTile.status === "ready" ? (checkProblem?.photo === openTile.photoId ? "Check this photo." : "We can read this page.") : openTile.status === "sent" ? "Sent for marking." : openTile.status === "unavailable" ? "We cannot check pages of this printing yet." : openTile.status === "saved" ? "Photo saved." : "We are checking this page."}</h2>
      {openTile.status === "unavailable" && <p>The photo stays here.</p>}
      {openTile.status === "sent" && (marking && openTile.photoId ? <Link className="btn ghost" href={`/account/scan/results/${openTile.photoId}`}>View page results</Link> : <p>Marking is not ready yet. The page waits here.</p>)}
      {openTile.status === "ready" && openTile.photoId && manual.includes(openTile.photoId) && !problems[openTile.photoId] && <button type="button" className="btn" disabled={sending} onClick={() => { const id = openTile.photoId!; setSheet(null); void send([id]); }}>Send for marking</button>}
    </>}
    {checks && openTile.photoId && openTile.status === "ready" && <ScanPreview key={openTile.photoId} photo={openTile.photoId} child={name}
      onRetake={phone ? () => open(openTile.uploadKey ? "library" : "camera", retakeKey(openTile)) : undefined}
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
    <p>When you ask us to check it, we send the whole page photo to an AI service. Your child&apos;s first name and printed page code can be in the photo.</p>
    <p>You and our admin team can view the photo. You can delete it sooner. We keep marks and the AI&apos;s reading of written answers until your family account is deleted. <Link href="/privacy">Read about privacy</Link>.</p>
    {acknowledged
      ? <button type="button" className="btn" onClick={() => setSheet(null)}>Close</button>
      : <button type="button" className="btn" onClick={() => acknowledge(sheet.then)}>Got it</button>}
  </Sheet>;

  const tipList = <ul className="scan-tips">
    <li>{ICONS.fold}<span><b>Open the book flat</b></span></li>
    <li>{ICONS.light}<span><b>Good light, no flash</b>Keep your hand&apos;s shadow off the page.</span></li>
    <li>{ICONS.corners}<span><b>Fill the photo with the page</b>Hold the phone close, with the corners and the small code in view.</span></li>
    <li>{ICONS.camera}<span><b>Snap all your pages, then tap Done</b>Already took photos? Pick them from the photo button in the camera.</span></li>
  </ul>;
  const tipsSheet = sheet?.kind === "add" && <Sheet label="How to scan" onClose={() => setSheet(null)}>
    <h2>How to scan</h2>
    {tipList}
    <p>{checks ? "Each photo is checked as it arrives. Pages that pass are sent for marking on their own, with a few seconds to undo." : `We keep the photos to mark ${name}'s work later.`} Pages can be scanned in any order.</p>
    <p className="small">Photos are private and kept for 90 days. <button type="button" className="scan-link" onClick={() => setSheet({ kind: "notice", then: null })}>More about photos</button></p>
    <button type="button" className="btn" data-first-focus onClick={() => setSheet(null)}>Close</button>
  </Sheet>;

  const childPicker = childrenList.length > 1 && !capturing && <label className="scan-child">Child
    <select value={child} disabled={uploads.some((u) => u.status !== "refused") || sending || batch.length > 0} onChange={(e) => { uploadsRef.current.forEach(release); clearAll(); setMessage(null); setChild(e.target.value); }}>
      {childrenList.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
    </select>
  </label>;

  const inputs = phone && <>
    <input ref={camera} hidden aria-label="Take a photo of a page" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    <input ref={library} hidden aria-label="Choose photos of pages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
  </>;

  const status = message && <p role={message.failed ? "alert" : "status"} className={`acct-alert${message.failed ? "" : " acct-saved"}`}>{message.text}</p>;
  const offline = !online && <p role="alert" className="scan-offline">You are offline. Photos wait here and send when you are back online.</p>;
  const focusLine = phone && focus && focus.childId === child && <p className="scan-focus">Take a photo of {focus.label}.</p>;
  const elsewhereNote = elsewhere.length > 0 && <p className="scan-spread-note" role="status">{elsewhere.map((e) => `${e.page ? `Page ${e.page}` : "A page"} went to ${e.child}'s pages.`).join(" ")}</p>;
  const undoBar = batch.length > 0 && <div className="scan-undo" role="status">
    <span><i aria-hidden="true">{ICONS.check}</i>{batch.length === 1 ? "1 page sent for marking" : `${batch.length} pages sent for marking`}</span>
    <button type="button" className="scan-link" onClick={undo}>Undo</button>
  </div>;

  if (loadFailed && !listing) {
    return <div className="scan-pages">{childPicker}<p role="alert" className="acct-alert">We cannot load photos. Try again.</p>
      <button type="button" className="btn ghost" onClick={() => void load().catch(() => setLoadFailed(true))}>Try again</button></div>;
  }

  // Step 3: the capture screen. The phone's own camera opens for each photo (one tap each, as browsers ask); between
  // photos the parent sees each shot get its tick, then takes the next page, picks photos, or taps Done.
  if (phone && capturing) {
    const shotOf = (key: string): { status: StackTile["status"] | "elsewhere"; thumb?: string; label: string } => {
      const local = stack.refused.find((t) => t.uploadKey === key) ?? stack.addingTiles.find((t) => t.uploadKey === key);
      if (local) return { status: local.status, thumb: thumbs[key], label: local.status === "refused" ? `${local.label}, ${local.reason}` : `New photo, ${STATUS_WORDS[local.status].toLowerCase()}` };
      const id = landed[key];
      const tile = id ? tiles.find((t) => t.photoId === id) : undefined;
      if (tile) return { status: tile.status, thumb: thumbs[id], label: `${tile.label}, ${(tile.reason ?? STATUS_WORDS[tile.status]).toLowerCase()}` };
      if (id && filedOf.current.get(id)?.child_id && filedOf.current.get(id)?.child_id !== child) return { status: "elsewhere", thumb: thumbs[id], label: `Page ${filedOf.current.get(id)?.page ?? ""}, went to ${filedOf.current.get(id)?.child}'s pages` };
      return { status: "checking", thumb: id ? thumbs[id] : undefined, label: "New photo, checking" };
    };
    const list = shots.map((k) => ({ key: k, ...shotOf(k) }));
    return <div className="scan-pages is-capture">
      {inputs}
      <div className="scan-cam" role="region" aria-label="Scan pages">
        <div className="scan-cam-top">
          <button type="button" className="scan-cam-x" onClick={done} aria-label="Close the camera"><span aria-hidden="true">✕</span></button>
          <p>{strip ? `${strip.day} · ` : ""}{list.length === 1 ? "1 photo" : `${list.length} photos`}</p>
        </div>
        <p className="scan-cam-say" aria-live="polite">{list.length ? "Keep going: snap the next page, or tap Done." : "Take a photo of the first page."}</p>
        {offline}
        {elsewhereNote}
        <ol className="scan-shots" aria-label="Photos taken">
          {list.map((s) => <li key={s.key} className={`is-${s.status}`} aria-label={s.label}>
            {s.thumb ? <Image unoptimized width={80} height={106} src={s.thumb} alt="" /> : <span className="scan-ph-empty" />}
            <span className="scan-shot-flag" aria-hidden="true">{s.status === "ready" || s.status === "sent" || s.status === "saved" || s.status === "elsewhere" ? ICONS.check : s.status === "refused" ? "!" : <span className="scan-spin" />}</span>
          </li>)}
        </ol>
        <p className="small scan-cam-tip">Camera not opening? Use Photos to pick pictures you already took.</p>
        <div className="scan-cam-row">
          <button type="button" className="scan-cam-side" onClick={() => open("library")} aria-label="Choose from your photos">Photos</button>
          <button type="button" className="scan-shutter" onClick={() => open("camera")} aria-label={list.length ? "Take the next page" : "Take a photo"}><span aria-hidden="true" /></button>
          <button type="button" className="scan-cam-side is-done" onClick={done}>Done</button>
        </div>
      </div>
      {notice}
    </div>;
  }

  const noBook = listing !== null && !listing.pages.length && !photos.length;
  // Step 1: the first visit only, before any photo: the four tips, then Scan pages.
  if (phone && listing && !tipsSeen && !tipsDone && !photos.length && !uploads.length && !noBook) {
    return <div className="scan-pages is-start">
      {inputs}
      {childPicker}
      {focusLine}
      <h2 className="scan-start-h">Scan pages in a few seconds</h2>
      {tipList}
      <p className="small scan-privacy-line">Photos are private and kept for 90 days. <button type="button" className="scan-link" onClick={() => setSheet({ kind: "notice", then: null })}>More about photos</button></p>
      {status}
      <div className="scan-dock">
        <div className="scan-dock-row is-choice">
          <button type="button" className="btn" disabled={!child} onClick={() => scan()}>Scan pages</button>
          <button type="button" className="scan-link" disabled={!child} onClick={() => scan("library")}>Choose from your photos</button>
        </div>
      </div>
      {notice}
    </div>;
  }

  const stripKeys = new Set(strip?.tiles.map((t) => t.tileKey).filter(Boolean));
  const others = stack.days.map((d) => ({ ...d, tiles: d.tiles.filter((t) => !stripKeys.has(t.key)) })).filter((d) => d.tiles.length);
  const todayIds = new Set(today.pages.map((p) => p.id));
  const earlier = stack.sent.filter((t) => !todayIds.has(t.photoId ?? ""));
  const group = (key: string, title: string, list: StackTile[], extra?: ReactNode, aside?: string) => <section key={key} className="scan-group" aria-label={title}>
    <div className="scan-group-h"><h2>{title}</h2>{aside && <span className="scan-count">{aside}</span>}</div>
    {extra}
    <ul className="scan-tiles">{list.map((t) => <Tile key={t.key} tile={t} thumb={thumbOf(t)} onOpen={() => setSheet({ kind: "tile", key: t.key })} />)}</ul>
  </section>;
  const pageName = (p: StackPhoto) => { const d = listing?.pages.find((x) => x.id === p.pageId); return d?.name ? `Page ${p.pageNumber} · ${d.name}` : `Page ${p.pageNumber}`; };
  const stripTile = (t: StripTile) => <li key={t.pageId} className={`scan-strip-tile is-${t.state}`}>
    <button type="button" aria-label={t.label} onClick={() => (t.tileKey ? setSheet({ kind: "tile", key: t.tileKey }) : phone ? scan() : undefined)} disabled={!t.tileKey && !phone}>
      <span className="scan-strip-page"><span className="scan-strip-glyph" aria-hidden="true">{STRIP_FACE[t.state].glyph}</span></span>
      <span className="scan-strip-n">{t.pageNumber}</span>
      <span className="scan-strip-w" aria-hidden="true">{STRIP_FACE[t.state].word}</span>
    </button>
  </li>;
  const line = scoreLine(name, today);

  return <div className={`scan-pages is-stack${phone ? "" : " is-desktop"}`}>
    {inputs}
    {childPicker}
    {offline}
    {focusLine}
    {noBook && <p className="scan-empty">No workbook to scan yet. Pages show here when {name}&apos;s first workbook arrives.</p>}
    {strip && <section className="scan-strip" aria-label={`${strip.day} pages`}>
      <div className="scan-strip-h">
        <h2>{strip.allDone ? "All pages of this workbook are done" : strip.complete ? `${strip.day} done` : strip.day}{strip.complete && <i className="scan-done-tick" aria-hidden="true">{ICONS.check}</i>}</h2>
        <p className="scan-strip-count">{strip.countText}</p>
      </div>
      <ul className="scan-strip-tiles">{strip.tiles.map(stripTile)}</ul>
      {strip.nextDay && <p className="small">Next: {strip.nextDay}. Scan its pages when they are finished. Any order is fine.</p>}
      {!strip.complete && <p className="small">Any order is fine.</p>}
    </section>}
    {unkeptNote && <p className="scan-spread-note" role="status">{unkeptNote}</p>}
    {elsewhereNote}
    {status}
    {undoBar}
    {stack.adding > 0 && <p className="scan-still" role="status">Keep this page open, {stack.adding === 1 ? "1 photo" : `${stack.adding} photos`} still sending.</p>}
    {!listing && <p className="small" role="status">Loading photos...</p>}

    {fix && <section className="scan-need" aria-label="Pages that need another photo">
      <div className="scan-need-h"><h2>{retakeLine(fixes.length)}</h2>{fixes.length > 1 && <button type="button" className="scan-link" onClick={() => setRetakeAt((n) => n + 1)}>Next ({(retakeAt % fixes.length) + 1} of {fixes.length})</button>}</div>
      <p className="scan-need-title"><b>{fix.title}</b>{fix.reason ? ` · ${fix.reason}` : ""}</p>
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

    {today.pages.length > 0 && <section className="scan-today" aria-label="Today's pages">
      <div className="scan-group-h"><h2>Today</h2></div>
      {marking && line && <p className="scan-score-line">{line}</p>}
      <ul className="scan-results">{today.pages.map((p) => <li key={p.id}>
        {marking
          ? <Link href={`/account/scan/results/${p.id}`}><span><b>{pageName(p)}</b><span className={p.marks?.complete && !p.marks.toPractise ? "is-good" : ""}>{pageScore(p.marks)}</span></span><span aria-hidden="true">›</span></Link>
          : <span className="scan-results-row"><b>{pageName(p)}</b><span>Sent for marking. Marking is not ready yet.</span></span>}
      </li>)}</ul>
      {marking && <p className="small">Questions to practise come back in the next workbook. <a className="scan-link" href="#scan-history">See all progress</a></p>}
    </section>}

    {stack.addingTiles.length > 0 && group("new", "New photos", stack.addingTiles, undefined, addingCount(stack))}
    {others.map((d) => group(d.key, d.label, d.tiles, undefined, d.tiles.length === 1 ? "1 photo" : `${d.tiles.length} photos`))}
    {/* The strip already shows each page's state, so earlier sent pages stay folded away. */}
    {earlier.length > 0 && <details className="scan-earlier"><summary>Sent earlier ({earlier.length})</summary>
      {group("sent", "Sent earlier", earlier, <p className="scan-gap">{marking ? "Open a page to view its results." : "Marking is not ready yet. These pages wait here."}</p>)}
    </details>}

    {listing && !noBook && (phone || (checks && manual.length > 0)) && <div className="scan-dock">
      {room ? <p className="small scan-room" role="status">{room}</p> : checks && !auto && note && <p className="small">{note}</p>}
      <div className="scan-dock-row">
        {phone && <button type="button" className="btn" disabled={!child} onClick={() => scan()}>{ICONS.camera}Scan pages</button>}
        {checks && manual.length > 0 && <button type="button" className={`btn${phone ? " ghost" : ""}`} disabled={sending} onClick={() => void send(manual)}>{sending ? "Sending..." : sendLabel(manual.length)}</button>}
      </div>
      {phone && <button type="button" className="scan-link" onClick={() => setSheet({ kind: "add" })}>How to scan</button>}
    </div>}
    {marking && <div id="scan-history"><ScanHistory key={`${parent}:${child}`} parent={parent} child={child} /></div>}
    {tileSheet}
    {notice}
    {tipsSheet}
  </div>;
}

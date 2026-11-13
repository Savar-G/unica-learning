"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { browserClient } from "@/lib/supabase-browser";
import { prepareScanPhoto } from "@/lib/scan-photo-browser";
import { addingCount, buildStack, refusalCopy, roomNote, sendLabel, stackSummary, waitingNote, type DayPage, type StackPhoto, type StackTile, type StackUpload, type UploadRefusal } from "@/lib/scan-stack";
import { SCANNING_COOKIE, SCANNING_SECONDS } from "@/lib/scan-tab";
import { scanEventTicket } from "@/lib/scan-track";
import { busyWait, nextUploads, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "@/lib/scan-upload-queue";
import { ScanHistory } from "@/components/scan-history";
import { ScanPreview } from "@/components/scan-preview";
import "./scan-pages.css";

// Scan pages (spec #368, round r565 picked, D-269 to D-276), step 1 of D-276: the shared stack on the phone's own file
// input. The live camera comes later, after the real-phone test. Each photo uploads and saves as soon as it is taken or
// chosen, with no confirm per page (D-269). A batch chosen from the phone's photos goes up in any order, 2 at a time
// (D-271, #915, src/lib/scan-upload-queue.ts); a photo the server has no room for keeps its place and waits.
// Checks and Send are for test families and admins only until marking ships (D-252): the list route says which.
// Images arrive only through the checked image route, live as object URLs and are revoked when they go away.

type Mode = "phone" | "desktop";
/** `reservation`: the photo id asked for at admission. It stays with the queued photo, so a lost answer takes no second upload slot. */
type Local = StackUpload & { file: File; replaces?: string; reservation?: string };
const GUIDE_WORDS = { done: "done", retake: "needs another photo", todo: "not scanned yet" } as const;

export type ScanListing = { marking?: boolean; checks: boolean; photos: StackPhoto[]; pages: DayPage[] };

const UPLOAD_REFUSALS: readonly string[] = ["qr", "page", "duplicate", "image", "size", "frequency", "quota"];
const uploadRefusal = (code: string): UploadRefusal => (UPLOAD_REFUSALS.includes(code) ? code as UploadRefusal : "unavailable");
/** What the server says of a photo id that can no longer take an upload: the lease ended or the photo went. A new id is needed. */
const ENDED: readonly string[] = ["expired", "rejected", "deleted", "refused"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** The Send result. `started`: how many sent pages the server started to mark now; the cron marks the others. */
function sentWords(sent: number, started: number) {
  const pages = sent === 1 ? "1 page" : `${sent} pages`;
  if (sent === 0) return "0 pages sent for marking.";
  if (started <= 0) return `${pages} sent for marking. Marking is not ready yet. The pages wait here.`;
  return `${pages} sent for marking. Marks show here when they are ready.`;
}

export function ScanPages({ childrenList, parent, noticeAcknowledged, mode = "phone", focus = null, initial }: {
  childrenList: { id: string; first_name: string }[];
  /** Optional server presentation state; the controller still reloads the signed-in family on mount. */
  initial?: { listing: ScanListing | null; loadFailed?: boolean };
  parent: string;
  noticeAcknowledged: boolean;
  mode?: Mode;
  /** The page a QR code opened (D-276 build note): its child and its name, "Page 17 · Day 4". */
  focus?: { childId: string; label: string } | null;
}) {
  const [child, setChild] = useState(focus?.childId ?? childrenList[0]?.id ?? "");
  const [listing, setListing] = useState<ScanListing | null>(initial?.listing ?? null);
  const [uploads, setUploads] = useState<Local[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
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
  const savedAsked = useRef(new Set<string>());
  const fetching = useRef(new Set<string>());
  const urls = useRef(new Map<string, string>());
  const replacing = useRef<string | null>(null);
  const name = childrenList.find((c) => c.id === child)?.first_name ?? "your child";

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
        const next = listing.photos.filter((p) => p.state === "saved" && p.check === "checking" && !unavailable.has(p.id) && now - (asked.current.get(p.id) ?? 0) > 6000)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!next || version !== epoch.current) return;
        asked.current.set(next.id, now);
        const answer = await api(`/api/account/scans/${next.id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => null);
        if (version !== epoch.current) return;
        const status = answer?.preview?.status;
        if (status === "unavailable") setUnavailable((s) => new Set(s).add(next.id));
        if (status === "ready" || status === "refused") { await load().catch(() => {}); return; }
        if (status !== "unavailable") return;
      }
    } finally { if (version === epoch.current) checking.current = false; }
  }, [listing, unavailable, load]);
  useEffect(() => { void runChecks(); }, [runChecks]);

  // Live: while a page is being checked, and always on a desktop beside the phone (D-273).
  const live = mode === "desktop" || Boolean(listing?.photos.some((p) => p.check === "checking" || p.state === "pending"));
  useEffect(() => {
    if (!live || !child) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => {}); }, mode === "desktop" ? 5000 : 4000);
    return () => clearInterval(timer);
  }, [live, child, load, mode]);

  async function uploadOne(u: Local, version: number): Promise<{ id: string; thumb: Blob } | UploadRefusal> {
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    if (u.replaces) await api(`/api/account/scans/${u.replaces}`, { method: "DELETE" }).catch(() => {});
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
    let body: Blob;
    try { body = await prepareScanPhoto(u.file); } catch (error) { return codeOf(error) === "size" ? "size" : "image"; }
    if (version !== epoch.current || !sessionCurrent.current) return "unavailable";
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
        if (state === "pending" || state === "saved") return "sent";
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
  const stack = useMemo(() => buildStack({ photos, uploads, pages: listing?.pages ?? [], checks }), [photos, uploads, listing, checks]);
  const tiles = [...stack.refused, ...stack.addingTiles, ...stack.days.flatMap((d) => d.tiles), ...stack.sent];
  const openTile = sheet?.kind === "tile" ? tiles.find((t) => t.key === sheet.key) ?? null : null;
  const thumbOf = (t: StackTile) => thumbs[t.photoId ?? t.uploadKey ?? ""];
  const empty = listing !== null && tiles.length === 0;

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
      setMessage({ text: "Photo deleted.", failed: false });
      wakeAll();
      await load();
    } catch { if (version === epoch.current && sessionCurrent.current) setMessage({ text: "We could not delete this photo. Try again.", failed: true }); }
  }

  const phone = mode === "phone";
  const retakeKey = (t: StackTile) => t.photoId ?? t.uploadKey;
  // Another photo does not help when the page already has one, or when the photos must wait.
  const firstRefused = stack.refused.find((t) => t.refusal !== "frequency" && t.refusal !== "quota" && t.refusal !== "unavailable" && t.refusal !== "duplicate");
  const note = waitingNote(stack);
  const room = roomNote(stack);

  const tileSheet = openTile && <Sheet label={openTile.title} onClose={() => setSheet(null)}>
    <div className="scan-sheet-ph">{thumbOf(openTile) ? <Image unoptimized width={600} height={800} src={thumbOf(openTile)} alt={`Photo of ${openTile.title} for ${name}`} /> : <span className="scan-ph-empty" />}</div>
    <p className="scan-sheet-eyebrow">{openTile.title}</p>
    {openTile.status === "refused" && openTile.refusal ? <>
      <h2>{refusalCopy(openTile.refusal).title}</h2>
      <p>{refusalCopy(openTile.refusal).action}</p>
      {openTile.uploadKey && openTile.refusal === "unavailable"
        ? <button type="button" className="btn" onClick={() => { patchUpload(openTile.uploadKey!, { status: "waiting", reason: undefined }); setSheet(null); pump(); }}>Try again</button>
        : phone && <button type="button" className="btn" onClick={() => open(openTile.uploadKey ? "library" : "camera", retakeKey(openTile))}>{openTile.uploadKey ? "Choose another photo" : "Take another photo"}</button>}
      {!phone && <p className="small">Take it again with your phone. The page waits there.</p>}
    </> : openTile.status === "waiting" ? <>
      <h2>{openTile.reason ? "There is no room for this photo yet." : "This photo is waiting its turn."}</h2>
      <p>{roomNote(stack) ?? "It keeps its place and goes on its own."}</p>
    </> : <>
      <h2>{openTile.status === "ready" ? (checkProblem?.photo === openTile.photoId ? "Check this photo." : "We can read this page.") : openTile.status === "sent" ? "Sent for marking." : openTile.status === "unavailable" ? "We cannot check pages of this printing yet." : openTile.status === "saved" ? "Photo saved." : "We are checking this page."}</h2>
      {openTile.status === "unavailable" && <p>The photo stays here.</p>}
      {openTile.status === "sent" && (listing?.marking && openTile.photoId ? <Link className="btn ghost" href={`/account/scan/results/${openTile.photoId}`}>View page results</Link> : <p>Marking is not ready yet. The page waits here.</p>)}
    </>}
    {checks && openTile.photoId && openTile.status === "ready" && <ScanPreview key={openTile.photoId} photo={openTile.photoId} child={name}
      onRetake={phone ? () => open(openTile.uploadKey ? "library" : "camera", retakeKey(openTile)) : undefined}
      onSendAnyway={sending ? undefined : () => { const id = openTile.photoId!; setSheet(null); void send([id]); }}
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

  const addSheet = sheet?.kind === "add" && <Sheet label="Add pages" onClose={() => setSheet(null)}>
    <h2>Add pages</h2>
    <button type="button" className="btn" onClick={() => open("camera")}>Take photos</button>
    <button type="button" className="btn ghost" onClick={() => open("library")}>Choose from your photos</button>
    <p className="small">You can choose several at once, in any order.</p>
  </Sheet>;

  const childPicker = childrenList.length > 1 && <label className="scan-child">Child
    <select value={child} disabled={uploads.some((u) => u.status !== "refused") || sending} onChange={(e) => { uploadsRef.current.forEach(release); clearAll(); setMessage(null); setChild(e.target.value); }}>
      {childrenList.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}
    </select>
  </label>;

  const inputs = phone && <>
    <input ref={camera} hidden aria-label="Take a photo of a page" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    <input ref={library} hidden aria-label="Choose photos of pages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
  </>;

  const status = message && <p role={message.failed ? "alert" : "status"} className={`acct-alert${message.failed ? "" : " acct-saved"}`}>{message.text}</p>;
  const focusLine = phone && focus && focus.childId === child && <p className="scan-focus">Take a photo of {focus.label}.</p>;

  if (loadFailed && !listing) {
    return <div className="scan-pages">{childPicker}<p role="alert" className="acct-alert">We cannot load photos. Try again.</p>
      <button type="button" className="btn ghost" onClick={() => void load().catch(() => setLoadFailed(true))}>Try again</button></div>;
  }

  // The start screen (picked): the tips, then the two ways in, in the thumb's reach (#915): take photos now, or choose
  // photos already taken, as many as the parent likes, in any order.
  if (phone && empty) {
    return <div className="scan-pages is-start">
      {inputs}
      <p className="lead">Take a photo of each finished page, or choose photos you already took. {checks ? "We check each photo, then you send the pages for marking." : `Later, we will use the photos to mark ${name}'s work.`}</p>
      {childPicker}
      {focusLine}
      <ul className="scan-tips">
        <li>{ICONS.fold}<span>Fold the book back, so only one page shows.</span></li>
        <li>{ICONS.light}<span>Find good light. Keep shadows off the page.</span></li>
        <li>{ICONS.corners}<span>Keep all four corners and the QR code in view.</span></li>
      </ul>
      <p className="small scan-privacy-line">Photos are private and kept for 90 days. <button type="button" className="scan-link" onClick={() => setSheet({ kind: "notice", then: null })}>More about photos</button></p>
      {status}
      <div className="scan-dock">
        <div className="scan-dock-row is-choice">
          <button type="button" className="btn" disabled={!child} onClick={() => open("camera")}>Take photos</button>
          <button type="button" className="btn ghost" disabled={!child} onClick={() => open("library")}>Choose from your photos</button>
        </div>
        <p className="small">You can choose several at once, in any order.</p>
      </div>
      {notice}
    </div>;
  }

  const group = (key: string, title: string, list: StackTile[], extra?: ReactNode, aside?: string) => <section key={key} className="scan-group" aria-label={title}>
    <div className="scan-group-h"><h2>{title}</h2>{aside && <span className="scan-count">{aside}</span>}</div>
    {extra}
    <ul className="scan-tiles">{list.map((t) => <Tile key={t.key} tile={t} thumb={thumbOf(t)} onOpen={() => setSheet({ kind: "tile", key: t.key })} />)}</ul>
  </section>;

  const one = phone && stack.one;
  return <div className={`scan-pages is-stack${phone ? "" : " is-desktop"}`}>
    {inputs}
    {childPicker}
    {listing && <p className="lead scan-summary">{stackSummary(stack, checks)}</p>}
    {focusLine}
    {status}
    {stack.guide && <section className="scan-guide" aria-label={`${stack.guide.day} pages`}>
      <p className="scan-guide-next">{stack.guide.next ? <><b>Next:</b> {stack.guide.next.title}</> : stack.guide.stillText}</p>
      {stack.guide.next && <p>{stack.guide.stillText}</p>}
      <ul>{stack.guide.pages.map((g) => <li key={g.pageId} className={`is-${g.status}`}>{g.title}: {GUIDE_WORDS[g.status]}</li>)}</ul>
      <p className="small">Scan the pages in any order.</p>
    </section>}
    {!listing && <p className="small" role="status">Loading photos...</p>}
    {!phone && empty && <p className="scan-empty">Your pages show here as you take them.</p>}

    {one ? <section className="scan-one" aria-label={one.title}>
      <button type="button" className="scan-one-ph" onClick={() => setSheet({ kind: "tile", key: one.key })} aria-label={`Open the photo of ${one.title}`}>
        {thumbOf(one) ? <Image unoptimized width={600} height={800} src={thumbOf(one)} alt="" /> : <span className="scan-ph-empty" />}
      </button>
      <div className="scan-one-t">
        <p className="scan-one-id"><b>{one.title}</b><span>{name}</span></p>
        <p className={`scan-state is-${one.status}`}>{one.status === "ready" ? <><i>{ICONS.check}</i>We can read this page.</> : one.status === "refused" ? one.reason : STATUS_WORDS[one.status]}</p>
      </div>
    </section> : <>
      {stack.refused.length > 0 && <section className="scan-need" aria-label="Pages that need another photo">
        <h2>{stack.refused.length === 1 ? "1 page needs another photo" : `${stack.refused.length} pages need another photo`}</h2>
        <ul className="scan-tiles">{stack.refused.map((t) => <Tile key={t.key} tile={t} thumb={thumbOf(t)} onOpen={() => setSheet({ kind: "tile", key: t.key })} />)}</ul>
        {phone && firstRefused
          ? <button type="button" className="btn ghost" onClick={() => open(firstRefused.uploadKey ? "library" : "camera", retakeKey(firstRefused))}>{stack.refused.length === 1 ? "Take the photo again" : `Take ${stack.refused.length} photos again`}</button>
          : !phone && <p className="small">{stack.refused.length === 1 ? "Take it again with your phone. The page waits there." : "Take them again with your phone. The pages wait there."}</p>}
      </section>}
      {stack.addingTiles.length > 0 && group("new", "New photos", stack.addingTiles, undefined, addingCount(stack))}
      {stack.days.map((d) => group(d.key, d.label, d.tiles, d.missingText ? <p className="scan-gap">{d.missingText}</p> : undefined, d.tiles.length === 1 ? "1 photo" : `${d.tiles.length} photos`))}
    </>}
    {stack.sent.length > 0 && group("sent", "Sent for marking", stack.sent, <p className="scan-gap">{listing?.marking ? "Open a page to view its results." : "Marking is not ready yet. These pages wait here."}</p>)}

    {listing && (phone || (checks && tiles.length > 0)) && <div className="scan-dock">
      {room ? <p className="small scan-room" role="status">{room}</p> : checks && note && <p className="small">{note}</p>}
      <div className="scan-dock-row">
        {phone && (one
          ? <button type="button" className="btn ghost scan-add" onClick={() => setSheet({ kind: "add" })}>+ Page</button>
          : <button type="button" className="btn ghost scan-add" aria-label="Add pages" onClick={() => setSheet({ kind: "add" })}>{ICONS.camera}</button>)}
        {checks && <button type="button" className="btn" disabled={!stack.counts.ready || sending} onClick={() => void send()}>{sending ? "Sending..." : sendLabel(stack.counts.ready)}</button>}
      </div>
      {phone && one && <button type="button" className="scan-link" onClick={() => void remove(one)}>Delete this photo</button>}
    </div>}
    {listing?.marking && <ScanHistory key={`${parent}:${child}`} parent={parent} child={child} />}
    {tileSheet}
    {notice}
    {addSheet}
  </div>;
}

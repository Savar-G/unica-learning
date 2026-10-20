"use client";
// Live test progress on the admin pages (admin-progress.ts): a small cell for the families table and a panel for the
// family drawer and the test page. One poll per page for every test on it: /api/admin/progress, every POLL_MS, only while
// the tab is visible and a test on the page is still open. The child's test page is not touched by any of this.
import { useEffect, useSyncExternalStore } from "react";
import type { ProgressSnapshot, TestProgress } from "@/lib/admin-progress";
import "./admin-progress.css";

const POLL_MS = 5000;
/** A child the server saw within this time counts as active now. */
const ACTIVE_MS = 3 * 60_000;

// One store per page: the tests on screen, the newest answer, and one timer.
const watched = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: ProgressSnapshot = { now: new Date(0).toISOString(), tests: {} };
let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

const emit = () => listeners.forEach((l) => l());
const anyOpen = () => [...watched.keys()].some((id) => snapshot.tests[id]?.open ?? true);

/** Takes the server's first answer, rendered with the page, unless a poll already has a newer one. */
function seed(s: ProgressSnapshot) {
  if (Date.parse(s.now) <= Date.parse(snapshot.now)) return;
  snapshot = { now: s.now, tests: { ...snapshot.tests, ...s.tests } };
  emit();
}

async function poll() {
  timer = null;
  if (busy || watched.size === 0 || document.visibilityState !== "visible" || !anyOpen()) return;
  busy = true;
  try {
    const res = await fetch(`/api/admin/progress?ids=${[...watched.keys()].join(",")}`, { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as ProgressSnapshot;
      snapshot = { now: next.now, tests: { ...snapshot.tests, ...next.tests } };
      emit();
    }
  } catch {
    // A lost poll waits for the next one.
  } finally {
    busy = false;
    schedule();
  }
}

function schedule() {
  if (timer || watched.size === 0 || !anyOpen()) return;
  timer = setTimeout(poll, POLL_MS);
}

function onVisible() {
  if (document.visibilityState === "visible") void poll();
}

function watch(id: string): () => void {
  watched.set(id, (watched.get(id) ?? 0) + 1);
  if (watched.size === 1) document.addEventListener("visibilitychange", onVisible);
  schedule();
  return () => {
    const n = (watched.get(id) ?? 1) - 1;
    if (n > 0) watched.set(id, n);
    else watched.delete(id);
    if (watched.size === 0) {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The test's newest progress and the server's time of it. `live` false (demo data) shows the first answer only. */
function useProgress(id: string, initial: ProgressSnapshot, live: boolean): { p: TestProgress | undefined; now: string } {
  const s = useSyncExternalStore(subscribe, () => snapshot, () => initial);
  useEffect(() => {
    seed(initial);
  }, [initial]);
  useEffect(() => (live ? watch(id) : undefined), [id, live]);
  const fresh = Date.parse(s.now) >= Date.parse(initial.now) ? s : initial;
  return { p: fresh.tests[id] ?? initial.tests[id], now: fresh.now };
}

/** "4 min", "2 h", "35 s". */
function span(fromIso: string, nowIso: string): string {
  const s = Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(fromIso)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const activeNow = (p: TestProgress, now: string) => p.open && Date.parse(now) - Date.parse(p.lastActivityAt) < ACTIVE_MS;

/** The bar: answered questions, with marks where Part 2 and the extra round start. */
function Bar({ p }: { p: TestProgress }) {
  const pct = (n: number) => `${(100 * n) / Math.max(1, p.total)}%`;
  return (
    <span className="dash-prog-bar" role="img" aria-label={`${p.answered} of ${p.total} questions answered`}>
      <span className="dash-prog-fill" style={{ width: pct(p.answered) }} />
      {p.part1 < p.total && <span className="dash-prog-mark" style={{ left: pct(p.part1) }} />}
      {p.main < p.total && <span className="dash-prog-mark" style={{ left: pct(p.main) }} />}
    </span>
  );
}

const Dot = ({ on }: { on: boolean }) => <span className={`dash-live-dot${on ? " is-on" : ""}`} aria-hidden />;

/** For the families table: "Q 26 of 42", the bar, and how long the child has been on it. */
export function ProgressCell({ id, initial, live }: { id: string; initial: ProgressSnapshot; live: boolean }) {
  const { p, now } = useProgress(id, initial, live);
  if (!p) return null;
  const on = activeNow(p, now);
  const head = p.short;
  return (
    <span className="dash-prog-cell" title={`${p.text}, for ${span(p.since, now)}. ${p.answered} of ${p.total} answered.`}>
      <span className="dash-prog-head"><Dot on={on} />{head}</span>
      <Bar p={p} />
      {p.open && <span className="dash-sub">{on ? "active now" : `quiet ${span(p.lastActivityAt, now)}`}</span>}
    </span>
  );
}

/** For the family drawer and the test page: where the child is, the question on screen, and the parts. */
export function ProgressPanel({ id, initial, live }: { id: string; initial: ProgressSnapshot; live: boolean }) {
  const { p, now } = useProgress(id, initial, live);
  if (!p) return null;
  const on = activeNow(p, now);
  return (
    <div className="dash-prog">
      <p className="dash-prog-status">
        <Dot on={on} />
        <b>{p.open ? (on ? "Active now" : `Quiet for ${span(p.lastActivityAt, now)}`) : p.phase === "finished" ? "Finished" : "Closed"}</b>
        {p.open && live && <span className="dash-muted"> · updates every {POLL_MS / 1000} s</span>}
      </p>
      <p className="dash-prog-text">{p.text}{p.open && <span className="dash-muted"> for {span(p.since, now)}</span>}</p>
      <Bar p={p} />
      <p className="dash-prog-legend dash-muted">
        {p.answered} of {p.total} answered · Part 1: {Math.min(p.answered, p.part1)} of {p.part1} · Part 2: {Math.max(0, Math.min(p.answered, p.main) - p.part1)} of {p.main - p.part1}
        {p.main < p.total && <> · Extra: {Math.max(0, p.answered - p.main)} of {p.total - p.main}</>}
        {p.facts && <> · Quick facts: {p.facts.answered}{p.facts.done ? "" : " so far"}</>}
      </p>
      {p.current && (
        <p className="dash-prog-q">
          <span className="dash-kicker">{p.open ? "On screen" : "Stopped at"}: question {p.current.number}, {p.current.part}</span>
          {p.current.prompt ?? "-"}
        </p>
      )}
    </div>
  );
}

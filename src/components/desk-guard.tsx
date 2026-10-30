"use client";

import { useEffect } from "react";
import { createDeskGuard, DESK_CHANNEL, DESK_HIDDEN as HIDDEN, DESK_OPENED } from "@/lib/desk-guard";
import { DESK_HOME } from "@/lib/desk";

// The desk guard's browser parts (#301, review R349-2; the logic is src/lib/desk-guard.ts). <DeskGuard /> sits on every
// parent page (the account and admin layouts); <AnnounceDesk /> on the desk tells the other tabs it opened.


let guard: ReturnType<typeof createDeskGuard> | null = null;
function theGuard() {
  guard ??= createDeskGuard({
    deskOpen: async () => {
      const res = await fetch("/api/desk/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`desk state ${res.status}`);
      return ((await res.json()) as { open?: unknown }).open === true;
    },
    hide: () => document.documentElement.setAttribute(HIDDEN, ""),
    show: () => document.documentElement.removeAttribute(HIDDEN),
    toDesk: () => window.location.replace(DESK_HOME),
  });
  return guard;
}

/** Before a parent action that goes straight to Supabase (password change, sign-out): false while the desk is open. */
export const mayActAsParent = () => theGuard().mayAct();

export function DeskGuard() {
  useEffect(() => {
    const g = theGuard();
    // A back or forward load from the browser's cache fires no request: check it as a restored page.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward" || document.documentElement.hasAttribute(HIDDEN)) void g.pageShown(true);
    const onShow = (e: PageTransitionEvent) => void g.pageShown(e.persisted);
    const onVisible = () => { if (document.visibilityState === "visible") void g.visible(); };
    const onStorage = (e: StorageEvent) => { if (e.key === DESK_CHANNEL) g.message(DESK_OPENED); };
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(DESK_CHANNEL) : null;
    if (channel) channel.onmessage = (e) => g.message(e.data);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.close();
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

export function AnnounceDesk() {
  useEffect(() => {
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(DESK_CHANNEL);
      channel.postMessage(DESK_OPENED);
      channel.close();
    }
    // A storage event reaches the other tabs too, in a browser without BroadcastChannel.
    try { localStorage.setItem(DESK_CHANNEL, String(Date.now())); } catch {}
  }, []);
  return null;
}

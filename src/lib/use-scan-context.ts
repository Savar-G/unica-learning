"use client";
import { useEffect, useRef } from "react";
import { browserClient } from "@/lib/supabase-browser";
/** Pending browser work belongs to one mounted account and page. Sign-out/replacement invalidates every callback. */
export function useScanContext(parent: string | undefined, scope: string) {
  const state = useRef({ epoch: 0, active: true });
  useEffect(() => {
    const close = () => { state.current.epoch++; state.current.active = false; };
    state.current.active = true;
    const auth = parent ? browserClient().auth.onAuthStateChange((_event, session) => { if (session?.user.id !== parent) close(); }) : null;
    window.addEventListener("pagehide", close);
    return () => { close(); auth?.data.subscription.unsubscribe(); window.removeEventListener("pagehide", close); };
  }, [parent, scope]);
  return () => { const epoch = state.current.epoch; return () => state.current.active && state.current.epoch === epoch; };
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * #312: while a workbook run works, the page reads its progress again every 5 seconds (no change in the address). A
 * read still on its way stops the next one: on a slow database, reads would pile up and make it slower (2026-11-06).
 */
export function RunRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const [reading, startReading] = useTransition();
  const busy = useRef(reading);
  useEffect(() => {
    busy.current = reading;
  }, [reading]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || busy.current) return;
      busy.current = true;
      startReading(() => router.refresh());
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}

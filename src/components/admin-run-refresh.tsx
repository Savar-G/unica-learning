"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** #312: while a workbook run works, the page reads its progress again every 5 seconds (no change in the address). */
export function RunRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}

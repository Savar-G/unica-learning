"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readReceipt } from "@/lib/receipt";
import { resultCopy } from "@/lib/booking-result";
import { Heard } from "@/components/heard";
import { track } from "@/lib/track";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

const subscribe = () => () => {};

/** path "report": the parent chose a plan on the child's report (#66), so the assessment is done and they have an account. */
export function BookingResult({ card, confirmationRef, path = "signup" }: { card: "saved" | "unconfirmed" | "cancelled" | null; confirmationRef: string | null; path?: "report" | "signup" }) {
  const fromReport = path === "report" && card !== null;
  const reported = useRef(false);
  useEffect(() => {
    if (card === "saved" && !reported.current) {
      reported.current = true;
      if (confirmationRef) {
        try {
          const raw: unknown = JSON.parse(sessionStorage.getItem("pw-card-saved-events") ?? "[]");
          const seen = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
          if (seen.includes(confirmationRef)) return;
          sessionStorage.setItem("pw-card-saved-events", JSON.stringify([...seen.slice(-19), confirmationRef]));
        } catch {}
      }
      track("card_saved", fromReport ? { src: "report" } : {});
    }
  }, [card, confirmationRef, fromReport]);
  const receipt = useSyncExternalStore(subscribe, readReceipt, () => null);
  const copy = resultCopy({ card, fromReport, receipt });

  return <>
    <h1>{copy.title}</h1>
    <p className="lead">{copy.lead}</p>
    {copy.support && <p>Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> for help.</p>}
    {card !== "unconfirmed" && !fromReport && <Heard />}
    <Link className="btn" href={copy.next.href}>{copy.next.label} <span aria-hidden="true">→</span></Link>
  </>;
}

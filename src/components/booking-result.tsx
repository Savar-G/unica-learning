"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readReceipt } from "@/lib/receipt";
import { track } from "@/lib/track";

const subscribe = () => () => {};

export function BookingResult({ card, confirmationRef }: { card: "saved" | "unconfirmed" | null; confirmationRef: string | null }) {
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
      track("card_saved");
    }
  }, [card, confirmationRef]);
  const receipt = useSyncExternalStore(subscribe, readReceipt, () => null);
  const title = card === "saved" ? "Your card is saved."
    : card === "unconfirmed" ? "We could not confirm your card setup."
    : receipt === "waitlist" ? "You are on the waitlist."
    : receipt === "reserved" ? "Your request is saved."
    : "Thank you for your interest.";

  return <>
    <h1>{title}</h1>
    <p className="lead">
      {card === "saved" ? "Nothing was charged at card setup. We will email you to arrange your child's free placement assessment. Your first month is charged when the first workbook ships."
        : card === "unconfirmed" ? "Your card status is not confirmed on this page. If you completed card setup, the Pagewise team can check the result before you try again."
        : receipt === "waitlist" ? "We will email you when books for your selected curriculum are ready. You did not add a card and nothing was charged."
        : receipt === "reserved" ? "We will email you with the next step for card setup and your child's free assessment. Nothing was charged."
        : "This page does not confirm a new booking. If you submitted a request, the Pagewise team will contact you by email."}
    </p>
    <Link className="btn" href="/">Back to home <span aria-hidden="true">→</span></Link>
  </>;
}

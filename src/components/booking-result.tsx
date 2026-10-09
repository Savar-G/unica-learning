"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readReceipt } from "@/lib/receipt";
import { Heard } from "@/components/heard";
import { track } from "@/lib/track";
import { BRAND } from "@/lib/site";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

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
    : card === "unconfirmed" ? "We could not check whether your card was added."
    : receipt === "waitlist" ? "You are on the waitlist."
    : receipt === "reserved" ? "We received your request."
    : "Thank you for your interest.";

  return <>
    <h1>{title}</h1>
    <p className="lead">
      {card === "saved" ? "You have not been charged. We will email you to arrange your child's free assessment. We charge your first month when your first workbook ships."
        : card === "unconfirmed" ? "If you finished adding your card, contact us before you try again. We can check for you."
        : receipt === "waitlist" ? "We will email you when books for your selected curriculum are ready. You did not add a card and nothing was charged."
        : receipt === "reserved" ? "We will email you about adding your card and arranging your child's free assessment. You have not been charged."
        : `Thanks for visiting ${BRAND}. To request your child's free assessment, return to our home page.`}
    </p>
    {card === "unconfirmed" && <p>Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> for help.</p>}
    {card !== "unconfirmed" && <Heard />}
    <Link className="btn" href="/">Back to home <span aria-hidden="true">→</span></Link>
  </>;
}

"use client";

// Old booking card pages (D-053) can still return to the home page after the public launch (#82): Stripe sends a
// cancelled setup to /?card=cancelled, and very old sessions used /?card=saved. Both go to /thank-you, which never
// treats the address as proof of a saved card. The booking form itself is gone, so nothing reopens a plan choice.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";

export function CardReturn() {
  const router = useRouter();
  useEffect(() => {
    const card = new URLSearchParams(window.location.search).get("card");
    if (card === "saved") router.replace("/thank-you?card=unconfirmed");
    if (card === "cancelled") {
      track("card_cancelled");
      router.replace("/thank-you?card=cancelled");
    }
  }, [router]);
  return null;
}

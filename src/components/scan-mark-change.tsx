"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { markingPageView } from "@/lib/scan-marking";
import { ScanPrivateImages } from "@/components/scan-private-images";

type Page = ReturnType<typeof markingPageView> & { photoAvailable: boolean; budgetHeld?: boolean };
/** One review screen for pending answers and saved judgments. No option is selected by default. */
export function ScanMarkChange({ photo, item }: { photo: string; item: Page["items"][number] }) {
  const router = useRouter();
  const [saved, setCurrent] = useState(item);
  const current = item.version >= saved.version ? item : saved;
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  async function save(choice: "right" | "wrong" | "blank") {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/account/scans/${photo}/marking`, { method: "PATCH", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: current.itemId, version: current.version, result: choice }) });
      if (!response.ok && response.status !== 409) throw new Error("unavailable");
      const answer: { status: string; recoveryPending?: boolean; result: Page } = await response.json();
      const next = answer.result.items.find((i) => i.itemId === current.itemId);
      if (!next) throw new Error("unavailable");
      setCurrent(next);
      setMessage(answer.status === "conflict" ? "This mark changed on another device. Check the current mark before you choose again."
        : answer.recoveryPending ? "Your mark is saved. Progress will update shortly." : "Your mark is saved.");
      router.refresh();
    } catch { setMessage("We could not confirm the save. Refresh the results before you try again."); }
    finally { setSaving(false); }
  }
  return <div className="scan-mark-change">
    <button type="button" className="scan-link" aria-expanded={open} onClick={() => setOpen(!open)}>{item.result === null ? "Check this answer" : "Change this mark"}</button>
    {open && <div className="scan-mark-review" aria-label={`Review question ${item.number}`}>
      <p><b>Question {item.number}</b>: {current.label}</p>
      {current.photoAvailable && current.evidencePhoto ? <ScanPrivateImages photo={current.evidencePhoto} numbers={[item.number]} cropsOnly /> : <p>Photo no longer available</p>}
      <p>We read: {current.readAnswerText === null ? "Not read" : current.readAnswerText === "" ? "Empty answer" : current.readAnswerText}</p>
      <p>Choose the mark for the original answer. This does not record another try.</p>
      <div className="scan-mark-choices" role="group" aria-label={`Mark question ${item.number}`}>
        {(["right", "wrong", "blank"] as const).map((choice) => <button type="button" className="btn ghost" key={choice} disabled={saving} onClick={() => void save(choice)}>{choice === "right" ? "Right" : choice === "wrong" ? "Wrong" : "Blank"}</button>)}
      </div>
      <a className="scan-link" href="/account/scan">Take another photo</a>
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}

"use client";
import { useRef, useState } from "react";
import { useScanContext } from "@/lib/use-scan-context";
import { scanEventTicket } from "@/lib/scan-track";
import { useRouter } from "next/navigation";
import type { markingPageView } from "@/lib/scan-marking";
import { ScanProblemExplanation } from "@/components/scan-problem-explanation";
import { ScanPrivateImages } from "@/components/scan-private-images";

type Page = ReturnType<typeof markingPageView> & { photoAvailable: boolean; budgetHeld?: boolean };
/**
 * A parent corrects a finished mark here. An answer with no mark yet has no control: the AI and our team mark it, and
 * no screen asks a parent to judge an answer (#715). No option is selected by default.
 */
export function ScanMarkChange({ photo, item, parent, complete = false }: { photo: string; item: Page["items"][number]; parent?: string; complete?: boolean }) {
  const router = useRouter();
  const begin = useScanContext(parent, photo);
  const wasComplete = useRef(complete);
  const [saved, setCurrent] = useState(item);
  const current = item.version >= saved.version ? item : saved;
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  async function save(choice: "right" | "wrong" | "blank") {
    const currentContext = begin();
    if (!currentContext()) return;
    const emit = scanEventTicket(currentContext);
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/account/scans/${photo}/marking`, { method: "PATCH", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: current.itemId, version: current.version, result: choice }) });
      if (!response.ok && response.status !== 409) throw new Error("unavailable");
      const answer: { status: string; recoveryPending?: boolean; result: Page } = await response.json();
      if (!currentContext()) return;
      const next = answer.result.items.find((i) => i.itemId === current.itemId);
      if (!next) throw new Error("unavailable");
      if (answer.status === "saved" && !wasComplete.current && answer.result.completion.status === "complete") emit("scan_review_complete", "completed");
      wasComplete.current = answer.result.completion.status === "complete";
      setCurrent(next);
      setMessage(answer.status === "conflict" ? "This mark changed on another device. Look at the current mark before you change it again."
        : answer.recoveryPending ? "Your mark is saved. Progress will update shortly." : "Your mark is saved.");
      router.refresh();
    } catch { if (currentContext()) setMessage("We could not confirm the save. Refresh the results before you try again."); }
    finally { if (currentContext()) setSaving(false); }
  }
  return <div className="scan-mark-change">
    {complete && current.result === "wrong" && (current.state === "scored" || current.state === "parent-checked") && current.readAnswerText?.trim() && <ScanProblemExplanation
      key={`${parent}:${photo}:${current.itemId}:${current.version}:${current.readAnswerText}`} parent={parent} photo={photo} itemId={current.itemId} version={current.version} number={current.number} />}
    {current.result !== null && <button type="button" className="scan-link" aria-expanded={open} onClick={() => setOpen(!open)}>Change this mark</button>}
    {open && current.result !== null && <div className="scan-mark-review" aria-label={`Review question ${item.number}`}>
      <p><b>Question {item.number}</b>: {current.label}</p>
      {current.photoAvailable && current.evidencePhoto ? <ScanPrivateImages photo={current.evidencePhoto} numbers={[item.number]} cropsOnly /> : <p>Photo no longer available</p>}
      <p>We read: {current.readAnswerText === null ? "Not read" : current.readAnswerText === "" ? "Empty answer" : current.readAnswerText}</p>
      <p>Choose the right mark for the original answer if ours is wrong. This does not record another try.</p>
      <div className="scan-mark-choices" role="group" aria-label={`Mark question ${item.number}`}>
        {(["right", "wrong", "blank"] as const).map((choice) => <button type="button" className="btn ghost" key={choice} disabled={saving} onClick={() => void save(choice)}>{choice === "right" ? "Right" : choice === "wrong" ? "Wrong" : "Blank"}</button>)}
      </div>
      <a className="scan-link" href="/account/scan">Take another photo</a>
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}

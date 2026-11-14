"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import "./scan-help.css";

const subscribe = (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); };
const serverSeen = () => true;

/** Dismissal is per signed-in parent in this browser, across children and ordinary visits. No photo or child data is stored. */
export function ScanHelp({ parent, mode, checks, marking }: { parent: string; mode: "phone" | "desktop"; checks: boolean; marking: boolean }) {
  const storageKey = `unica.scan-help.v1:${parent}`;
  const seen = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(storageKey) === "seen"; } catch { return false; }
  }, serverSeen);
  const [dismissed, setDismissed] = useState(false);
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useId();
  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(storageKey, "seen"); } catch { /* Storage may be blocked; this visit still remembers. */ }
  }
  function close() { setOpened(false); trigger.current?.focus(); }
  return <div className="scan-help">
    <button ref={trigger} type="button" className="scan-link scan-help-trigger" aria-haspopup="dialog" onClick={() => { dismiss(); setOpened(true); }}>How scanning works</button>
    {!seen && !dismissed && <aside className="scan-help-offer" aria-label="Scanning instructions">
      <p><strong>New to scanning?</strong> See how to add finished pages and what happens next.</p>
      <div><button type="button" className="scan-link" onClick={() => { dismiss(); setOpened(true); }}>Show instructions</button>
        <button type="button" className="scan-link" onClick={() => { dismiss(); trigger.current?.focus(); }}>Not now</button></div>
    </aside>}
    {opened && <Instructions title={title} mode={mode} checks={checks} marking={marking} onClose={close} />}
  </div>;
}

function Instructions({ title, mode, checks, marking, onClose }: { title: string; mode: "phone" | "desktop"; checks: boolean; marking: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal(); heading.current?.focus();
    return () => { if (element.open) element.close(); };
  }, []);
  const phone = mode === "phone";
  function finish() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} className="scan-help-dialog" aria-labelledby={title}
    onCancel={(event) => { event.preventDefault(); finish(); }}
    onClick={(event) => { if (event.target === event.currentTarget) finish(); }}>
    <div className="scan-help-body">
      <header><h2 ref={heading} id={title} tabIndex={-1}>How scanning works</h2>
        <button type="button" className="scan-link" onClick={finish}>Close instructions</button></header>
      {!phone && <p>Add photos and take them again on your phone, signed in to this account. This screen shows the saved pages{checks ? " and lets you send ready pages for marking" : ""}.</p>}
      <ol>
        <li><h3>Choose your child</h3><p>If you have more than one child, select the child whose finished workbook pages you are adding. Use the page number printed at the bottom of the sheet. Do not count cover or instruction sheets yourself, or use the page&apos;s position within a day.</p></li>
        <li><h3>One photo for each finished page</h3><p>{phone ? "Use the camera or choose existing photos with the photo buttons. " : "On your phone, use the camera or choose existing photos. "}Keep the whole page, all four corners and the QR code in view. Keep the writing sharp and readable, with good light and no heavy shadows. Check for blur before you add the photo.</p></li>
        <li><h3>{checks ? "Wait for the photo check" : "Your photos stay here"}</h3><p>{checks ? "Adding a photo uploads and saves it. The photo check then checks whether the page can be read. A ready photo has not yet been sent for marking." : "Adding a photo uploads and saves it. Photo checks and sending pages for marking are not available for this account yet. A saved photo does not mean the page has been marked."}</p>
          <p>If a photo needs another try, open it and read the reason. {phone ? "Use Take another photo or Choose another photo when offered to replace it." : "Take or choose another photo on your phone when offered to replace it."} Keep any missing writing and the QR code in the new photo. If the message asks you to wait or try again, follow that message.</p></li>
        {checks && <li><h3>Send the ready pages</h3><p>Use Send pages for marking when the pages are ready. Uploading or passing the photo check does not send them for marking. Results can take time. An unclear answer may wait for a team mark.</p></li>}
        <li><h3>{marking ? "Find the results" : "Marking results"}</h3><p>{marking ? "Open Page history, or open a page sent for marking and choose View page results. The page shows the marks that are ready and any answers still waiting for the team." : "Marking results are not available for this account yet. Saved photos stay on Scan pages."}</p></li>
      </ol>
      <p className="small">The photo privacy notice still applies. Read it before adding your first photo; these instructions do not replace it.</p>
      <button type="button" className="btn" onClick={finish}>Back to Scan pages</button>
    </div>
  </dialog>;
}

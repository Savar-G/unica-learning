"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ScanPreview as Preview, ScanRefusal } from "@/lib/scan-crops";
import { PHOTO_CHECK_POLL_MS, PHOTO_CHECK_WAIT_MS, PHOTO_PROBLEM_TEXT, type PhotoCheckView, type PhotoProblem } from "@/lib/scan-photo-check-text";

/** The longest a parent waits for another call's work, in tries, two seconds apart. */
const WAIT_TRIES = 15;

const REFUSED: Record<ScanRefusal, string> = {
  "marks-missing": "We could not find the four corner marks on this page. To check it, take another photo with all four corners in view.",
  "marks-inconsistent": "We could not line up the corner marks on this page. To check it, lay the page flat and take another photo.",
  "page-mismatch": "This photo does not match the printed page in its code. To check it, take another photo of the right page.",
  "orientation-unclear": "We could not tell which way up this page is. To check it, take another photo with the page upright.",
  "ambiguous-page": "This photo seems to show more than one page. To check it, take another photo with only this page in view.",
  "qr-mismatch": "We could not read this page's QR code in the photo. To check it, take another photo with the code clear and in view.",
  "another-page": "Part of this photo looks like a different page. To check it, take another photo of this page on its own, flat, with nothing on top of it.",
  faint: "Part of the page is too bright or faint to read. Take another photo without glare.",
  "check-timeout": "We couldn't check this page right now. Try again in a minute.",
  "printed-page-changed": "We cannot line up this photo with the printed page.",
  failed: "We cannot line up this photo with the printed page.",
};

const UNAVAILABLE = {
  "no-contract": "This workbook was printed before we could check pages. Your photo stays here, but checking is not available for this workbook.",
  "other-revision": "This photo is of an earlier printing of this page. Your photo stays here, but checking is not available for it.",
  "photo-ended": "This photo is no longer available.",
};

/** "2", "2 and 5", "2, 5 and 7". */
const listed = (numbers: number[]) => (numbers.length < 2 ? `${numbers[0]}` : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`);

/**
 * The straightened page and numbered answer crops of one photo, for test families and admins (D-236). Images arrive only
 * through the checked image route, live as object URLs, and are revoked when this view goes away.
 * The photo check (#855): while it is pending, the view asks again every second for at most 6 s. A problem shows one
 * sentence with "Take again" (main) and "Send anyway" (second); nothing is blocked. A later result is not shown.
 */
export function ScanPreview({ photo, child, onRetake, onSendAnyway, onProblem }: {
  photo: string; child?: string;
  /** Take the photo again. Without it, the problem tells the parent to use the phone. */
  onRetake?: () => void;
  /** Send this photo for marking as it is. */
  onSendAnyway?: () => void;
  /** Told the problem shown on this photo, or null. Keep it stable (useCallback). */
  onProblem?: (photo: string, problem: PhotoProblem | null) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [check, setCheck] = useState<PhotoCheckView>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const urls = useRef<string[]>([]);

  const clear = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setImages({});
  }, []);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checkTimer: ReturnType<typeof setTimeout> | undefined;
    const base = `/api/account/scans/${photo}/preview`;
    const load = async (tries: number) => {
      const response = await fetch(base, { method: "POST", cache: "no-store" });
      if (!live) return;
      if (!response.ok) { setFailed(true); return; }
      const body: { preview: Preview; photoCheck?: PhotoCheckView } = await response.json();
      const answer = body.preview;
      if (!live) return;
      setCheck(body.photoCheck ?? null);
      // While the check is pending, ask the preview again every second, for at most 6 s. Then stop: a later result is not shown.
      if (answer.status === "ready" && body.photoCheck?.state === "pending") {
        const until = Date.now() + PHOTO_CHECK_WAIT_MS;
        const poll = async () => {
          if (!live) return;
          const again = await fetch(base, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (!live) return;
          const view: PhotoCheckView = again?.photoCheck ?? null;
          if (view?.state === "pending" && Date.now() + PHOTO_CHECK_POLL_MS <= until) { checkTimer = setTimeout(() => void poll(), PHOTO_CHECK_POLL_MS); return; }
          setCheck(view?.state === "pending" ? { state: "unknown" } : view);
        };
        checkTimer = setTimeout(() => void poll(), PHOTO_CHECK_POLL_MS);
      }
      if (answer.status === "busy" && tries > 0) { timer = setTimeout(() => { void load(tries - 1).catch(() => { if (live) setFailed(true); }); }, 2000); return; }
      if (answer.status === "busy") { setFailed(true); return; }
      setPreview(answer);
      // Another call starts nothing while the job's lease holds, so the button waits for it to end.
      if (answer.status === "refused" && answer.reason === "check-timeout") { timer = setTimeout(() => setCanRetry(true), answer.retryInMs ?? 0); return; }
      if (answer.status !== "ready") return;
      await Promise.all([answer.straight.part, ...answer.crops.map((c) => c.part)].map(async (part) => {
        const image = await fetch(`${base}/${part}`, { cache: "no-store" });
        if (!image.ok) throw new Error("unavailable");
        const blob = await image.blob();
        if (!live) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setImages((held) => ({ ...held, [part]: url }));
      }));
    };
    void load(WAIT_TRIES).catch(() => { if (live) setFailed(true); });
    const hide = () => { live = false; clear(); };
    window.addEventListener("pagehide", hide);
    return () => { live = false; if (timer) clearTimeout(timer); if (checkTimer) clearTimeout(checkTimer); window.removeEventListener("pagehide", hide); clear(); };
  }, [photo, attempt, clear]);

  const problem = check?.state === "done" ? check.problem : null;
  useEffect(() => { onProblem?.(photo, problem); }, [photo, problem, onProblem]);

  const heading = <h3>How we read this page</h3>;
  if (failed) {
    return <section className="scan-preview" aria-label="How we read this page">{heading}
      <p role="alert" className="acct-alert">We cannot show this now. Your photo is still here.</p>
      <button type="button" className="btn ghost" onClick={() => { setFailed(false); setPreview(null); setAttempt((n) => n + 1); }}>Try again</button>
    </section>;
  }
  if (!preview || preview.status === "busy" || preview.status === "not-started") {
    return <section className="scan-preview" aria-label="How we read this page">{heading}<p role="status" className="small">Lining up the page...</p></section>;
  }
  if (preview.status === "refused" || preview.status === "unavailable") {
    const text = preview.status === "refused" ? `${REFUSED[preview.reason]} Your photo is still here.` : UNAVAILABLE[preview.reason];
    return <section className="scan-preview" aria-label="How we read this page">{heading}<p role="status" className="acct-alert">{text}</p>
      {preview.status === "refused" && preview.reason === "check-timeout" && <button type="button" className="btn ghost" disabled={!canRetry} onClick={() => { setCanRetry(false); setPreview(null); setAttempt((n) => n + 1); }}>Try again</button>}
    </section>;
  }
  return <section className="scan-preview" aria-label="How we read this page">
    {problem && <div className="scan-check-problem" role="alert">
      <p>{PHOTO_PROBLEM_TEXT[problem]}</p>
      <div className="scan-check-actions">
        {onRetake ? <button type="button" className="btn" onClick={onRetake}>Take again</button> : <p className="small">Take it again with your phone. The page waits there.</p>}
        {onSendAnyway && <button type="button" className="btn ghost" onClick={onSendAnyway}>Send anyway</button>}
      </div>
    </div>}
    {heading}
    {check?.state === "pending" && <p role="status" className="small">Checking the photo...</p>}
    <p className="small">No marks yet. This shows what we would check.</p>
    <div className="scan-preview-layout">
      <figure className="scan-straight">
        {images[preview.straight.part]
          ? <Image unoptimized width={preview.straight.width} height={preview.straight.height} src={images[preview.straight.part]} alt={`Straightened page for ${child ?? "your child"}`} />
          : <span className="scan-holder" style={{ aspectRatio: `${preview.straight.width} / ${preview.straight.height}` }} />}
        <figcaption>Your photo, straightened</figcaption>
      </figure>
      <div className="scan-answers">
        {preview.crops.length > 0
          ? <ol className="scan-crops">{preview.crops.map((c) => <li key={c.part}>
            <span className="scan-number">Question {c.number}</span>
            {images[c.part]
              ? <Image unoptimized width={c.width} height={c.height} src={images[c.part]} alt={`Answer space for question ${c.number}`} />
              : <span className="scan-holder" style={{ aspectRatio: `${c.width} / ${c.height}` }} />}
          </li>)}</ol>
          : <p className="acct-alert">This page has no answers we can show yet.</p>}
        {preview.crops.length > 0 && preview.notSupported.length > 0 && <p className="small">We cannot show the {preview.notSupported.length === 1 ? "answer to question" : "answers to questions"} {listed(preview.notSupported)} yet.</p>}
      </div>
    </div>
  </section>;
}

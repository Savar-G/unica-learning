"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FEEDBACK_MESSAGES, FEEDBACK_PRODUCTS, FEEDBACK_SIGN_IN, feedbackInput, feedbackSource, type FeedbackError, type FeedbackProduct, type FeedbackResult } from "@/lib/feedback";

interface ViewProps {
  product: FeedbackProduct | ""; text: string; result: FeedbackResult | null; busy: boolean;
  onProduct?: (value: FeedbackProduct | "") => void; onText?: (value: string) => void; onSubmit?: (event: FormEvent) => void;
}
/** The actual form and states, also used by the authenticated Admin sandbox. */
export function FeedbackFormView({ product, text, result, busy, onProduct, onText, onSubmit }: ViewProps) {
  const message = useRef<HTMLParagraphElement>(null);
  const inputError = result && !result.ok && ["empty", "too_long", "invalid"].includes(result.error);
  const productError = result && !result.ok && result.error === "no_product";
  useEffect(() => { if (result) message.current?.focus(); }, [result]);
  const announcement = result && <p ref={message} id="feedback-result" tabIndex={-1} role={result.ok ? "status" : "alert"} className={result.ok ? "acct-alert acct-saved" : "err"}>
    {result.ok ? "Thank you. Your feedback is saved." : FEEDBACK_MESSAGES[result.error]}
    {!result.ok && result.error === "signed_out" && <> <Link href={FEEDBACK_SIGN_IN}>Sign in</Link>.</>}
  </p>;
  return <form className="acct-form" onSubmit={onSubmit} noValidate aria-busy={busy}>
    <div className={`fld${productError ? " bad" : ""}`}><label htmlFor="feedback-product">Product</label>
      <select id="feedback-product" value={product} onChange={e => onProduct?.(e.target.value as FeedbackProduct | "")} disabled={busy} required
        aria-invalid={productError ? true : undefined} aria-describedby={productError ? "feedback-result" : undefined}>
        <option value="">Choose a product</option>
        {FEEDBACK_PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {productError && announcement}
    </div>
    <div className={`fld${inputError ? " bad" : ""}`}><label htmlFor="feedback-text">Your feedback</label>
      <textarea id="feedback-text" value={text} onChange={e => onText?.(e.target.value)} rows={7} disabled={busy} required
        aria-invalid={inputError ? true : undefined} aria-describedby={`feedback-limit${inputError ? " feedback-result" : ""}`} />
      <p id="feedback-limit" className="small">Use 5,000 characters or fewer.</p>
      {inputError && announcement}
    </div>
    {!productError && !inputError && announcement}
    <button className="btn" type="submit" disabled={busy}>{busy ? "Sending..." : "Send"}</button>
  </form>;
}

export function FeedbackForm({ initialProduct = "", childId = null, source = "/account/feedback" }: { initialProduct?: FeedbackProduct | ""; childId?: string | null; source?: string }) {
  const [product, setProduct] = useState(initialProduct);
  const [text, setText] = useState("");
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    let from = source;
    if (from === "/account/feedback" && document.referrer) {
      const previous = new URL(document.referrer);
      if (previous.origin === window.location.origin) from = previous.pathname;
    }
    const payload = { product, text, childId, source: feedbackSource(from) };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    const body = { ...payload, requestId: retry.current.requestId };
    const checked = feedbackInput(body);
    if ("ok" in checked) { setResult(checked); return; }
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/account/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data: unknown = await response.json();
      const r = data && typeof data === "object" ? data as Record<string, unknown> : {};
      if (response.ok && r.ok === true) { setResult({ ok: true }); setText(""); retry.current = null; }
      else {
        const error: FeedbackError = r.error === "family_deleted" ? "family_unavailable" : typeof r.error === "string" && Object.hasOwn(FEEDBACK_MESSAGES, r.error) ? r.error as FeedbackError : "unavailable";
        setResult({ ok: false, error });
        if (error === "conflict") retry.current = null;
      }
    } catch { setResult({ ok: false, error: "unavailable" }); }
    finally { pending.current = false; setBusy(false); }
  }
  // No maxLength: a paste must produce a visible refusal, never silent truncation.
  return <FeedbackFormView product={product} text={text} result={result} busy={busy} onProduct={p => { setProduct(p); setResult(null); }} onText={t => { setText(t); setResult(null); }} onSubmit={submit} />;
}

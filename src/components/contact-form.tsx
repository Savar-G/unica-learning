"use client";

// The contact form on /contact (D-130): name, email and message, sent through /api/contact.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { EMAIL_MAX, MESSAGE_MAX, NAME_MAX, contactFieldErrors, type ContactField, type ContactResult } from "@/lib/contact-form";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { track } from "@/lib/track";

const ERRORS: Record<ContactField, string> = {
  name: "Enter your name.",
  email: "Enter an email like name@example.com.",
  message: "Write a message.",
};

function Field({ id, label, bad, children }: { id: ContactField; label: string; bad: boolean; children: ReactNode }) {
  return (
    <div className={`fld${bad ? " bad" : ""}`}>
      <label htmlFor={`c-${id}`}>{label}</label>
      {children}
      {bad && <span className="err" id={`e-c-${id}`}>{ERRORS[id]}</span>}
    </div>
  );
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [bad, setBad] = useState<ContactField[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<null | "sent" | "failed" | "unknown">(null);
  const openedAt = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (outcome === "sent") done.current?.focus();
  }, [outcome]);

  const showErrors = (fields: ContactField[]) => {
    setBad(fields);
    if (fields.length) form.current?.querySelector<HTMLElement>(`#c-${fields[0]}`)?.focus();
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const fields = contactFieldErrors({ name, email, message });
    showErrors(fields);
    if (fields.length) return;
    setBusy(true);
    setOutcome(null);
    let result: ContactResult;
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website, elapsed: Date.now() - openedAt.current }),
      });
      result = (await res.json()) as ContactResult;
    } catch {
      result = { ok: false, error: "unknown" };
    }
    setBusy(false);
    if (result.ok) {
      track("contact_sent", { status: "sent" });
      setOutcome("sent");
    } else if (result.error === "invalid") {
      showErrors(result.fields);
    } else {
      track("contact_sent", { status: result.error === "unknown" ? "unknown" : "failed" });
      setOutcome(result.error === "unknown" ? "unknown" : "failed");
    }
  }

  if (outcome === "sent") {
    const first = name.trim().split(" ")[0];
    return (
      <div className="contact-sent" role="status" tabIndex={-1} ref={done}>
        <span className="tick" aria-hidden="true">✓</span>
        <div>
          <p className="t">Thanks, {first}. Your message is sent.</p>
          <p>We will reply to {email.trim()}. <Link href="/">Back to home</Link></p>
        </div>
      </div>
    );
  }

  const isBad = (f: ContactField) => bad.includes(f);
  const describedBy = (f: ContactField) => (isBad(f) ? `e-c-${f}` : undefined);
  return (
    <form ref={form} className="acct-form contact-form" onSubmit={onSubmit} noValidate>
      <Field id="name" label="Your name" bad={isBad("name")}>
        <input id="c-name" autoComplete="name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} aria-invalid={isBad("name")} aria-describedby={describedBy("name")} />
      </Field>
      <Field id="email" label="Email" bad={isBad("email")}>
        <input id="c-email" type="email" autoComplete="email" inputMode="email" value={email} maxLength={EMAIL_MAX} onChange={(e) => setEmail(e.target.value)} aria-invalid={isBad("email")} aria-describedby={describedBy("email")} />
      </Field>
      <Field id="message" label="Message" bad={isBad("message")}>
        <textarea id="c-message" rows={6} value={message} maxLength={MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} aria-invalid={isBad("message")} aria-describedby={describedBy("message")} />
      </Field>
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {outcome === "failed" && <p role="alert" className="acct-alert">We could not send your message. Try again, or email us at <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
      {outcome === "unknown" && <p role="alert" className="acct-alert">We are not sure your message was sent. To be safe, email us at <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
      <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? <span className="spin" aria-label="Sending" /> : <>Send message <span className="arr">→</span></>}
      </button>
      <p className="small">We only use your email to reply. You can also write to <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>
    </form>
  );
}

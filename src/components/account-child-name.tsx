"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ChildNameError, ChildNameResult } from "@/lib/account";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { DESK_HOME } from "@/lib/desk";
import { ACCOUNT_PATH } from "@/lib/parent-shell";

const email = <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;

function failure(error: ChildNameError, name: string): ReactNode {
  switch (error) {
    case "invalid":
      return "Enter a first name.";
    case "book_in_progress":
      return <>We are making {name}&apos;s next workbook, so the name cannot change now. Try again when the workbook is ready, or email {email}.</>;
    case "too_many_names":
      return <>This name has been changed many times. To change it again, email {email}.</>;
    case "not_found":
      return <>We could not find this child on your account. Reload the page, or email {email}.</>;
    default:
      return <>We could not save the name. Try again in a moment, or email {email}.</>;
  }
}

/** A child's first name on the Account tab (#555). A saved name reloads the page's data, so the frame shows it too. */
export function ChildNameForm({ childId, name }: { childId: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChildNameError | null>(null);
  const [saved, setSaved] = useState(false);
  const sending = useRef(false);
  const id = `child-name-${childId}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    setSaved(false);
    const firstName = value.trim();
    if (!firstName) {
      setError("invalid");
      document.getElementById(id)?.focus();
      return;
    }
    if (firstName === name) {
      setValue(firstName);
      setError(null);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    let status = 0;
    let result: ChildNameResult | null = null;
    try {
      const res = await fetch(`/api/account/children/${encodeURIComponent(childId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName }) });
      status = res.status;
      result = (await res.json()) as ChildNameResult;
    } catch {}
    sending.current = false;
    setBusy(false);
    // 423: the child's desk is open on this device (#301); an old page goes to the desk.
    if (status === 423) return window.location.replace(DESK_HOME);
    if (status === 401) return router.push(`/sign-in?next=${encodeURIComponent(ACCOUNT_PATH)}`);
    if (!result?.ok) return setError(result?.error ?? "store_failed");
    setValue(firstName);
    setSaved(true);
    router.refresh();
  };

  return (
    <form className="acd-name" onSubmit={(e) => void submit(e)} noValidate>
      <div className={`fld${error === "invalid" ? " bad" : ""}`}>
        <label htmlFor={id}>First name</label>
        <div className="acd-row">
          <input id={id} autoComplete="off" value={value} maxLength={60} onChange={(e) => { setValue(e.target.value); setSaved(false); }} aria-invalid={error === "invalid"} aria-describedby={`h-${id}`} />
          <button className="btn ghost" type="submit" disabled={busy} aria-busy={busy}>{busy ? <span className="spin" aria-label="Saving" /> : "Save name"}</button>
        </div>
        <span className="hint" id={`h-${id}`}>The next workbook prints the new name. A workbook we already made keeps the old one.</span>
      </div>
      {error && <p role="alert" className="acct-alert">{failure(error, name)}</p>}
      <p className="small acd-saved" role="status">{saved ? "The name is saved." : ""}</p>
    </form>
  );
}

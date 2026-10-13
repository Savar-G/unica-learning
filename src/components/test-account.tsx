"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Marks a family as a test, so the dashboard leaves it out of its numbers (D-099). An admin's own family is always left out. */
export function TestAccount({ parentId, marked, admin }: { parentId: string; marked: boolean; admin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (admin) return <p className="adm-note">This is an admin&rsquo;s own family. The dashboard leaves it out of its numbers.</p>;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/parents/${parentId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: !marked }) });
      if (!res.ok) { setError("The change did not save. Try again."); return; }
      router.refresh();
    } catch {
      setError("The change did not save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="adm-row">
      <span className="adm-note">{marked ? "Marked as a test family: the dashboard leaves it out of its numbers." : "A real family: the dashboard counts it."}</span>
      <button type="button" className="btn adm-btn" onClick={toggle} disabled={busy}>{busy ? "Saving..." : marked ? "Count this family" : "Mark as a test family"}</button>
      {error && <span role="alert" className="adm-note">{error}</span>}
    </div>
  );
}

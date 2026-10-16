"use client";

// How many of a flyer were handed out: a number and a Save button. Posts to /api/admin/flyers, then reloads the page's numbers.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function DeliveredForm({ code, delivered }: { code: string; delivered: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(delivered));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100_000) return setState("failed");
    setState("saving");
    try {
      const res = await fetch("/api/admin/flyers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, delivered: n }) });
      if (!res.ok) return setState("failed");
      setState("saved");
      router.refresh();
    } catch {
      setState("failed");
    }
  }

  return (
    <form onSubmit={save} className="adm-filters" aria-label={`Flyer ${code.toUpperCase()} handed out`}>
      <label>
        Handed out
        <input type="number" inputMode="numeric" min={0} max={100000} step={1} value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} style={{ width: "6rem", marginLeft: ".5rem" }} />
      </label>
      <button className="adm-btn" type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving..." : "Save"}</button>
      <span role="status">{state === "saved" ? "Saved" : state === "failed" ? "Not saved. Enter a whole number from 0 to 100000, then try again." : ""}</span>
    </form>
  );
}

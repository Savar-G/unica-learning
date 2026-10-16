"use client";

// The unsubscribe page's action (#73). One click: the link in a reminder opens the page, and the page turns reminders
// off as it loads. It posts from the browser, so a mail scanner that only fetches the link does not unsubscribe
// anyone. Without JavaScript the page shows a button instead (src/app/(product)/unsubscribe/page.tsx); this renders nothing then.
import { useEffect, useState, type ReactNode } from "react";
import { track } from "@/lib/track";

type Status = "idle" | "working" | "done" | "failed";

export function Unsubscribe({ token, done, failed }: { token: string; done: ReactNode; failed: ReactNode }) {
  const [status, setStatus] = useState<Status>("idle");
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    // Deferred, so the state change happens after the effect, and a second run (Strict Mode) cancels the first.
    const timer = setTimeout(() => {
      setStatus("working");
      fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" })
        .then((res) => (res.ok ? "done" : "failed"))
        .catch(() => "failed" as const)
        .then((s) => {
          if (!live) return;
          setStatus(s);
          track("unsubscribe", { status: s });
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [token, round]);

  if (status === "idle") return null;
  if (status === "working") return <h1 role="status">Turning off reminders…</h1>;
  if (status === "done") return <div role="status">{done}</div>;
  return (
    <div role="alert">
      {failed}
      <p><button className="btn" type="button" onClick={() => setRound((n) => n + 1)}>Try again <span className="arr">→</span></button></p>
    </div>
  );
}

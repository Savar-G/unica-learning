"use client";
import { useEffect, useRef, useState } from "react";

// The body of a kept email (D-103), in a frame that shows it the way a mail app does: its own styles, no scripts, and
// links that open in a new tab. The frame grows to the email's height, so the page scrolls, not the frame. A toggle
// shows it at a phone's width too.
const PHONE = 390;

export function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(640);
  const [phone, setPhone] = useState(false);
  const measure = () => {
    const doc = ref.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.body?.childElementCount) setHeight(Math.max(320, doc.body.scrollHeight + 8));
  };
  // A frame can finish loading before the page attaches onLoad, so measure once after mount too.
  useEffect(measure, [html]);
  // The base tag makes every link open in a new tab; without it a click would load the page inside the frame.
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><base target="_blank"><style>body{margin:0}</style></head><body>${html}</body></html>`;
  const show = (on: boolean) => {
    setPhone(on);
    // The email reflows at the new width: measure it again once the frame has its new size.
    requestAnimationFrame(() => requestAnimationFrame(measure));
  };
  return (
    <div className="mail-body">
      <div className="mail-widths" role="group" aria-label="Width">
        <button type="button" aria-pressed={!phone} onClick={() => show(false)}>Desktop</button>
        <button type="button" aria-pressed={phone} onClick={() => show(true)}>Phone</button>
      </div>
      <iframe
        ref={ref}
        title={title}
        className="mail-frame"
        // No allow-scripts: the email cannot run code. allow-same-origin only lets this page read the email's height.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        style={{ height, width: phone ? PHONE : "100%" }}
        onLoad={measure}
      />
    </div>
  );
}

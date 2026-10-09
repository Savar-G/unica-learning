"use client";

// "How did you hear about us?" on /thank-you. One tap saves the answer; "ai" and "social" offer a second, optional tap.
// Shown only in the tab that made the booking (the ref comes from sessionStorage), so it never adds a step to the form.
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { CHANNELS, readHeardRef, type ChannelId } from "@/lib/heard";
import { track } from "@/lib/track";

const subscribe = () => () => {};
const IDS = Object.keys(CHANNELS) as ChannelId[];

export function Heard() {
  const ref = useSyncExternalStore(subscribe, readHeardRef, () => null);
  const [channel, setChannel] = useState<ChannelId | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  if (!ref) return null;

  // Each answer is a new row; the newest per ref wins, so a parent can change their mind.
  const send = (c: ChannelId, detail?: string) => {
    setSent(true);
    void fetch("/api/heard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, channel: c, detail }),
      keepalive: true,
    }).catch(() => {});
  };

  const choose = (c: ChannelId) => {
    setChannel(c);
    setPick(null);
    track("heard_from", { channel: c });
    send(c);
  };

  const c = channel ? CHANNELS[channel] : null;

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    if (channel && text.trim()) send(channel, text.trim());
  };

  return (
    <section className="heard" aria-labelledby="heardT">
      <h2 id="heardT">How did you hear about us?</h2>
      <p className="small">Optional. It helps us learn where families find us.</p>
      <div className="heard-picks" role="radiogroup" aria-labelledby="heardT">
        {IDS.map((id) => (
          <label key={id} className="heard-pick">
            <input type="radio" name="heard" checked={channel === id} onChange={() => choose(id)} />
            {CHANNELS[id].label}
          </label>
        ))}
      </div>
      {channel && c?.picks && (
        <div className="heard-picks sub" role="radiogroup" aria-label={c.ask}>
          <span className="small">{c.ask}</span>
          {c.picks.map((p) => (
            <label key={p} className="heard-pick">
              <input type="radio" name="heard-pick" checked={pick === p} onChange={() => { setPick(p); send(channel, p); }} />
              {p}
            </label>
          ))}
        </div>
      )}
      {channel && c?.ask && !c.picks && (
        <form className="heard-other" onSubmit={submitText}>
          <div className="fld">
            <label htmlFor="heard-text">{c.ask}</label>
            <input id="heard-text" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} placeholder="A school newsletter, a podcast..." />
          </div>
          <button className="btn sm" type="submit">Send</button>
        </form>
      )}
      <p className="small heard-thanks" role="status">{sent ? "Thank you for telling us." : ""}</p>
    </section>
  );
}

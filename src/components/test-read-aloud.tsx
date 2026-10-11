"use client";

// "Read it to me" (#69): speaks the text with the browser's built-in speech. For a question, the screen builds the text
// with readAloudText, so the choices are read in the order of its buttons (#79).
// Renders nothing when the browser has no speech or no voices. Chrome loads its voices a moment after the first request,
// so the test page asks for them early (warmUpVoices).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/track";
import "./test-base.css";
import "./test-parts.css";

// Clear, natural English voices first; the browser's own default is the fallback.
const PREFERRED = [/Samantha/i, /Google US English/i, /Natural/i, /Ava/i, /Allison/i, /Karen/i, /Daniel/i];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = en.find((x) => re.test(x.name));
    if (v) return v;
  }
  return en.find((v) => /^en[-_]CA/i.test(v.lang)) ?? en.find((v) => v.default) ?? en[0] ?? null;
}

const hasSpeechApi = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

// Chrome loads its voices after the page, then fires "voiceschanged". Some browsers (Chromium on Linux) have the
// speech API but no voices at all. So the button shows only once there is at least one voice to speak with.
const hasVoices = () => hasSpeechApi() && window.speechSynthesis.getVoices().length > 0;

/**
 * Starts loading the browser's voices. Call it when the test page opens: Chrome loads them a moment after the first
 * request, and without this the button appears a moment after the first question and pushes the question aside (#79).
 */
export function warmUpVoices(): void {
  if (hasSpeechApi()) window.speechSynthesis.getVoices();
}
function onVoicesChanged(notify: () => void) {
  if (!hasSpeechApi()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener?.("voiceschanged", notify);
  // Asking for the voices starts the load in browsers that wait for the first request.
  synth.getVoices();
  return () => synth.removeEventListener?.("voiceschanged", notify);
}

/** Give it a `key` per question, so a new question starts silent. */
export function ReadAloud({ text }: { text: string }) {
  // False on the server and in the first render, so the button never flashes on a browser without speech.
  const supported = useSyncExternalStore(onVoicesChanged, hasVoices, () => false);
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    // Leaving the question (the parent keys each question) or the test stops the voice.
    return () => {
      current.current = null;
      synth.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    current.current = null;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(() => {
    const synth = window.speechSynthesis;
    // Chrome can drop a new utterance right after cancel() when nothing was playing.
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // The button shows only after the voices load, so the full list is here on the first tap.
    const voice = pickVoice(synth.getVoices());
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-CA";
    u.rate = 0.9;
    // A cancelled utterance also ends; only the one playing now may turn the button off.
    const done = () => {
      if (current.current !== u) return;
      current.current = null;
      setSpeaking(false);
    };
    u.onend = done;
    u.onerror = done;
    current.current = u;
    setSpeaking(true);
    synth.speak(u);
    track("read_aloud");
  }, [text]);

  if (!supported) return null;
  return (
    <button type="button" className="test-read" data-speaking={speaking || undefined} onClick={speaking ? stop : speak} aria-label={speaking ? "Stop reading" : "Read it to me"}>
      <SpeakerIcon on={speaking} />
    </button>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" fillOpacity=".15" />
      {on ? (
        <>
          <path d="M16 8.5a5 5 0 010 7" />
          <path d="M18.8 5.8a9 9 0 010 12.4" />
        </>
      ) : (
        <path d="M16.5 9.5a3.5 3.5 0 010 5" />
      )}
    </svg>
  );
}

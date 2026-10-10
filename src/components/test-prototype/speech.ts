"use client";

// PROTOTYPE ONLY (ticket #60). "Read it to me" with the browser's built-in speech (spec: version 1).
// Hidden when the browser has no speech. The prototype bar shows which voice was picked.
import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/track";

const PREFERRED = [/Samantha/i, /Google US English/i, /Natural/i, /Ava/i, /Allison/i, /Karen/i, /Daniel/i];

function pickVoice(voices: SpeechSynthesisVoice[]) {
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = en.find((x) => re.test(x.name));
    if (v) return v;
  }
  return en.find((v) => /en[-_]CA/i.test(v.lang)) ?? en.find((v) => v.default) ?? en[0] ?? null;
}

export function useSpeech(src: string) {
  const [supported, setSupported] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true); // eslint-disable-line react-hooks/set-state-in-effect -- feature check after hydration
    const load = () => setVoice(pickVoice(window.speechSynthesis.getVoices()));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-CA";
    u.rate = 0.88;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
    track("read_aloud", { src });
  }, [supported, voice, src]);

  const toggle = useCallback((text: string) => (speaking ? stop() : speak(text)), [speaking, stop, speak]);

  return { supported, speaking, speak, stop, toggle, voiceName: voice ? `${voice.name} (${voice.lang})` : supported ? "default" : "none" };
}

export type Speech = ReturnType<typeof useSpeech>;

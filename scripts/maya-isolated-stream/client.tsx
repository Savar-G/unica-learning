import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatBoard, ChatControls, useDeskChat } from "@/components/desk-chat";
import "@/components/desk.css";
import "./local.css";

const CHILD = "22222222-2222-4222-8222-222222222222";
const BOOK = "44444444-4444-4444-8444-444444444444";
const STUCK = "I don't get 2 minus 8.";
const initial = { used: 0, left: 60, resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" };
async function control(path: string, body: unknown = {}) {
  const r = await fetch(`/local/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await r.json();
  if (!r.ok) throw Error(result.error);
  return result;
}
function App() {
  const state = useDeskChat(initial, { book: BOOK, page: 1, question: 1 }, CHILD);
  const [diagnostic, setDiagnostic] = useState<unknown>(null);
  const [mode, setMode] = useState("normal");
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => { void fetch("/local/state").then(r => r.json()).then(setDiagnostic).catch(() => {}); }, 500);
    return () => clearInterval(timer);
  }, []);
  async function perform(work: () => Promise<unknown>) {
    try { setError(""); await work(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }
  async function reset() {
    await control("reset");
    // This origin belongs only to the harness. Clear the actual board and chat storage before each new case.
    localStorage.clear(); sessionStorage.clear(); location.reload();
  }
  async function arm(value: string) { await control("arm", { mode: value }); setMode(value); }
  return <>
    <section className="local-controls" aria-label="Local test controls">
      <strong>Local test. Fake responses. Synthetic records in memory.</strong>
      <p>52 minus 28. Open the chat. Send: <code>{STUCK}</code> Then send: <code>2</code></p>
      <div>
        <button onClick={() => void perform(reset)}>Reset</button>
        <label>Case <select value={mode} disabled={!!state.chat} onChange={e => void perform(() => arm(e.target.value))}>
          <option value="normal">Spaced reply</option><option value="pending">Hold pending prefix</option><option value="confirmed">Hold confirmed prefix</option>
        </select></label>
        <button disabled={!state.chat || state.busy || state.chat.ended} onClick={() => void state.act("child", STUCK)}>Send stuck sentence</button>
        <button disabled={!state.chat || state.busy || state.chat.ended} onClick={() => void state.act("child", "2")}>Send 2</button>
        <button disabled={!state.busy} onClick={() => void perform(() => control("drop"))}>Cut connection</button>
        {(["retry", "end", "sweep"] as const).map(how => <button key={how} disabled={!state.chat} onClick={() => void perform(async () => {
          await control("recover", { id: state.chat!.id, how }); await state.retry();
        })}>Recover: {how}</button>)}
      </div>
      <p role="status">{state.busy ? "Reply pending" : "Reply settled"}. Case: {mode}. {error}</p>
      <details><summary>Private record state</summary><pre>{JSON.stringify(diagnostic, null, 2)}</pre></details>
    </section>
    <main className="desk-root">
      <aside className="desk-maya">
        <header className="desk-maya-head"><h1>Maya</h1><p>52 minus 28</p></header>
        <div className="desk-talk" aria-live="polite">
          {state.chat?.transcript.map((line, i) => <p key={`${state.chat!.id}-${i}`} className={`desk-bubble${line.speaker === "child" ? " desk-child-bubble" : ""}`}><span className="sr-only">{line.speaker === "child" ? "You" : "Maya"}: </span>{line.text}</p>)}
        </div>
        <footer className="desk-say"><ChatControls state={state} picked={true} /></footer>
      </aside>
      <section className="desk-main">
        {state.chat && <ChatBoard chat={state.chat} still={false} restore={state.callInk?.id === state.chat.id ? state.callInk.log : null} onBoard={history => state.saveBoard(state.chat!.id, history)} />}
      </section>
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);

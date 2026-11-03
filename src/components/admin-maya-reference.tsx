"use client";
import { useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { REFERENCE_LIMIT_MS, REFERENCE_RPC, REFERENCE_TOPIC } from "@/lib/maya-workbook-speech";

/** The microphone is used only for one reference. The server resolves the final transcript again. */
export function MayaReferenceMicrophone({ childId, workbookId, available, disabled, onReference }: {
  childId: string; workbookId: string; available: boolean; disabled: boolean; onReference(text: string): void;
}) {
  const [state, setState] = useState<"idle" | "connecting" | "listening">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fake, setFake] = useState(false);
  const [words, setWords] = useState("");
  const active = useRef<{ room: Room; worker: string | null; stop(): void } | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; active.current?.stop(); }, []);

  function stop() { generation.current++; active.current?.stop(); active.current = null; setState("idle"); setFake(false); }
  async function start() {
    stop();
    const run = ++generation.current;
    setError(null); setState("connecting");
    try {
      const response = await fetch("/api/admin/maya/workbook/reference", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId, workbookId }) });
      const ticket = await response.json();
      if (!ticket.ok) throw Error("reference unavailable");
      const { Room, RoomEvent, ParticipantKind } = await import("livekit-client");
      if (run !== generation.current) return;
      const room = new Room();
      const timer = setTimeout(() => { if (run === generation.current) { stop(); setError("I did not hear a reference. Try again, or type it below."); } }, REFERENCE_LIMIT_MS);
      const connection = { room, worker: null as string | null, stop: () => { clearTimeout(timer); void room.disconnect(true); } };
      active.current = connection;
      const worker = () => {
        const agent = [...room.remoteParticipants.values()].find(p => p.kind === ParticipantKind.AGENT && p.attributes["maya.reference"] === ticket.id);
        if (!agent || run !== generation.current) return;
        connection.worker = agent.identity;
        setFake(agent.attributes["maya.speech"] === "fake");
        setState("listening");
      };
      room.on(RoomEvent.ParticipantConnected, worker);
      room.on(RoomEvent.ParticipantAttributesChanged, worker);
      room.on(RoomEvent.DataReceived, (data, participant, _kind, topic) => {
        if (run !== generation.current || topic !== REFERENCE_TOPIC || participant?.kind !== ParticipantKind.AGENT || participant.attributes["maya.reference"] !== ticket.id) return;
        try {
          const input = JSON.parse(new TextDecoder().decode(data));
          if (typeof input.text !== "string" || input.text.length > 100) return;
          stop();
          onReference(input.text);
        } catch { stop(); setError("The reference could not be read. Type it below."); }
      });
      await room.connect(ticket.url, ticket.token);
      if (run !== generation.current) { connection.stop(); return; }
      worker();
      await room.localParticipant.setMicrophoneEnabled(true);
      if (run !== generation.current) connection.stop();
    } catch {
      if (run === generation.current) { stop(); setError("The microphone could not connect. Check its permission, or type the reference below."); }
    }
  }
  async function sayFake() {
    const connection = active.current;
    if (!connection?.worker) return;
    try { await connection.room.localParticipant.performRpc({ destinationIdentity: connection.worker, method: REFERENCE_RPC, payload: JSON.stringify({ text: words }) }); }
    catch { stop(); setError("The test speech could not be sent. Try again."); }
  }
  return <div className="mc-reference-mic">
    <div className="adm-row">
      <button type="button" className="btn sm ghost adm-btn" disabled={!available || disabled || state !== "idle"} onClick={start}>Say page and number</button>
      {state !== "idle" && <button type="button" className="btn sm ghost adm-btn" onClick={stop}>Stop listening</button>}
    </div>
    <p className="adm-note" role="status">{state === "connecting" ? "Connecting the microphone..." : state === "listening" ? 'Say "page 4, number 3".' : available ? "The microphone listens for one reference, then stops." : "Speaking needs the voice setup. You can type the reference below."}</p>
    {fake && <label className="mc-field"><span>Test speech</span><input value={words} maxLength={100} onChange={e => setWords(e.target.value)} /><button type="button" className="btn sm adm-btn" onClick={sayFake}>Send test speech</button></label>}
    {error && <p className="mc-error" role="alert">{error}</p>}
  </div>;
}

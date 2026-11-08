// A bounded speech-only connection. It has no Maya call, model, package, transcript store or recording.
import { stt, type JobContext } from "@livekit/agents";
import { AudioStream, RoomEvent, RpcError, TrackSource, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "@livekit/rtc-node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { referenceJoiner, REFERENCE_LIMIT_MS, REFERENCE_RPC, REFERENCE_TOPIC, type ReferenceRoom } from "@/lib/maya-workbook-speech";
import { voiceProviders } from "@/lib/maya-voice";
import { makeProviders } from "./providers";

/** Only completed, confident speech becomes a reference. All other forms ask again in the picker. */
export async function readWorkbookReference(stream: stt.SpeechStream, deliver: (text: string) => Promise<void>) {
  for await (const event of stream) {
    if (event.type !== stt.SpeechEventType.FINAL_TRANSCRIPT) continue;
    const alternatives = event.alternatives ?? [];
    const first = alternatives[0];
    const text = first && first.confidence >= 0.6 && alternatives.length === 1 && first.text.length <= 100 ? first.text : "";
    await deliver(text);
    return;
  }
}

export async function runWorkbookReference(ctx: JobContext, job: ReferenceRoom, db: SupabaseClient<Database>) {
  const [book, child, test] = await Promise.all([
    db.from("workbooks").select("parent_id, child_id, status, printed_at").eq("id", job.workbookId).maybeSingle(),
    db.from("children").select("parent_id").eq("id", job.childId).maybeSingle(),
    db.from("test_accounts").select("parent_id").eq("parent_id", job.parentId).maybeSingle(),
  ]);
  if (book.error || child.error || test.error || !test.data || child.data?.parent_id !== job.parentId ||
    book.data?.parent_id !== job.parentId || book.data.child_id !== job.childId || !book.data.printed_at || !["printed", "shipped"].includes(book.data.status)) return ctx.shutdown("reference refused");
  const config = voiceProviders(process.env);
  if (!config.ok) return ctx.shutdown("speech not configured");
  const made = await makeProviders(config);
  const stream = made.stt.stream();
  let stopped = false;
  const audio = new Set<{ cancel(): Promise<void> }>();
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    stream.close();
    await Promise.allSettled([...audio].map(a => a.cancel()));
    await Promise.allSettled([made.stt.close(), made.tts.close()]);
    await ctx.shutdown("reference complete");
  };
  const timer = setTimeout(() => { void stop(); }, REFERENCE_LIMIT_MS);
  ctx.addShutdownCallback(async () => {
    if (stopped) return;
    clearTimeout(timer); stopped = true; stream.close();
    await Promise.allSettled([...audio].map(a => a.cancel()));
    await Promise.allSettled([made.stt.close(), made.tts.close()]);
  });
  const fits = (p: RemoteParticipant) => referenceJoiner(ctx.room.name ?? "", job, p.identity, p.attributes);
  let microphone = false;
  const attach = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (stopped || microphone || !fits(participant) || publication.source !== TrackSource.SOURCE_MICROPHONE) return;
    microphone = true;
    const input = new AudioStream(track, { sampleRate: 16_000, numChannels: 1 });
    const reader = input.getReader();
    audio.add(reader);
    void (async () => {
      try { while (!stopped) { const frame = await reader.read(); if (frame.done) break; stream.pushFrame(frame.value); } }
      catch { await stop(); }
      finally { audio.delete(reader); reader.releaseLock(); }
    })();
  };
  ctx.room.on(RoomEvent.TrackSubscribed, attach);
  ctx.room.on(RoomEvent.ParticipantDisconnected, p => { if (fits(p)) void stop(); });
  await ctx.connect();
  if (stopped) return;
  for (const participant of ctx.room.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) {
    if (publication.track) attach(publication.track, publication, participant);
  }
  const local = ctx.room.localParticipant!;
  // The SDK starts its STT task on the next timer. Admit test speech only after it has a listener.
  while (made.fakeSpeech && !made.fakeSpeech.listening && !stopped) await new Promise(resolve => setTimeout(resolve, 1));
  if (stopped) return;
  if (made.fakeSpeech) local.registerRpcMethod(REFERENCE_RPC, async data => {
    const participant = ctx.room.remoteParticipants.get(data.callerIdentity);
    if (!participant || !fits(participant) || stopped) throw new RpcError(1403, "reference refused");
    const input = JSON.parse(data.payload || "{}") as { text?: unknown };
    if (typeof input.text !== "string" || input.text.length > 100) throw new RpcError(1400, "reference refused");
    return made.fakeSpeech!.say(input.text) ? "heard" : "not listening";
  });
  await local.setAttributes({ "maya.reference": job.id, "maya.speech": made.fakeSpeech ? "fake" : "live" });
  try {
    await readWorkbookReference(stream, async text => {
      if (stopped) return;
      const participant = [...ctx.room.remoteParticipants.values()].find(fits);
      if (!participant) return;
      await local.publishData(new TextEncoder().encode(JSON.stringify({ text })), { reliable: true, topic: REFERENCE_TOPIC, destination_identities: [participant.identity] });
      await stop();
    });
  } catch { await stop(); }
}

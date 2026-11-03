import { randomUUID } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { adminSession } from "@/lib/admin-store";
import { adminWorkbookReader } from "@/lib/maya-workbook-server";
import { workbookSelectionContext } from "@/lib/maya-workbook-question";
import { referenceRoomName } from "@/lib/maya-workbook-speech";
import { livekitProject, VOICE_AGENT_NAME } from "@/lib/maya-voice";

export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return new Response("Bad request", { status: 400 });
  const context = await workbookSelectionContext(body, adminWorkbookReader(admin));
  if (!context.ok) return Response.json(context, { status: 404, headers: { "cache-control": "no-store" } });
  const project = livekitProject(process.env);
  if (!project) return Response.json({ ok: false, error: "voice_unavailable" }, { status: 503 });
  const job = { id: randomUUID(), parentId: context.parentId, childId: context.childId, workbookId: context.book.id };
  const room = referenceRoomName(job.id), identity = `child-${job.childId}`;
  const token = new AccessToken(project.apiKey, project.apiSecret, { identity, name: "Admin", ttl: 60,
    attributes: { "maya.reference": job.id, "maya.parent": job.parentId, "maya.child": job.childId, "maya.workbook": job.workbookId } });
  token.addGrant({ roomJoin: true, room, roomCreate: false, roomAdmin: false, roomList: false, roomRecord: false,
    canPublish: true, canPublishSources: [TrackSource.MICROPHONE], canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: false });
  token.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: VOICE_AGENT_NAME, metadata: JSON.stringify({ reference: job }) })] });
  return Response.json({ ok: true, id: job.id, url: project.url, token: await token.toJwt() }, { headers: { "cache-control": "no-store" } });
}

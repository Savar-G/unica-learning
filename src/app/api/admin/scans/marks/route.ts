import { adminSession } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { setScanTeamMark, teamMarkChoice } from "@/lib/scan-team-marks";

// #715: our team sets the mark of an answer the AI was unsure of. Body { item, version, result }. Answers
// { status: "saved", recoveryPending } or { status: "conflict" | "not_waiting" | "no_photo", version } (409), or an error.
export async function POST(request: Request) {
  // Checks Auth and live admin membership for every request; the database function checks it again.
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const text = await request.text();
  if (text.length > 1024) return Response.json({ error: "invalid" }, { status: 400 });
  let choice;
  try { choice = teamMarkChoice(JSON.parse(text)); } catch { return Response.json({ error: "invalid" }, { status: 400 }); }
  if (!choice) return Response.json({ error: "invalid" }, { status: 400 });
  const service = adminClient();
  if (!service) return Response.json({ error: "unavailable" }, { status: 503 });
  try {
    const result = await setScanTeamMark(admin.db, service, choice);
    if (result.status === "refused") return Response.json({ error: "refused" }, { status: 404 });
    return Response.json(result, { status: result.status === "saved" ? 200 : 409 });
  } catch { return Response.json({ error: "unavailable" }, { status: 503 }); }
}

import { EXPORT_TYPES, exportFileName, exportStream, parseExportRequest } from "@/lib/admin-export";
import { demoExportReader } from "@/lib/admin-export-demo";
import { adminSession, exportReader } from "@/lib/admin-store";

// The raw data export (#200, D-118): one dataset as a CSV or JSON file, streamed a page at a time, so thousands of tests
// download within the time limit. Admins only, as the other admin routes: everyone else gets 404 and nothing is read.
// A GET link, so the browser saves the file; it only reads. ?demo=1 in local development exports the made-up families
// of src/lib/admin-export-demo.ts without a sign-in, as the dashboard (D-099).
export const maxDuration = 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const demo = query.get("demo") === "1" && process.env.NODE_ENV === "development";
  const admin = demo ? null : await adminSession();
  if (!demo && !admin) return new Response("Not found", { status: 404 });
  const req = parseExportRequest(query);
  if (!req) return new Response("Bad request", { status: 400 });
  // The dataset and the error only: never a row, so no name or email reaches the logs.
  const failed = (e: unknown) => console.error("[admin] export failed", req.dataset, e instanceof Error ? e.message : e);
  let body: ReadableStream<Uint8Array>;
  try {
    body = await exportStream(admin ? exportReader(admin) : demoExportReader(), req, failed);
  } catch (e) {
    failed(e);
    return new Response("The export could not read the database. Try again.", { status: 503, headers: { "cache-control": "no-store" } });
  }
  return new Response(body, {
    headers: {
      "content-type": EXPORT_TYPES[req.format],
      "content-disposition": `attachment; filename="${exportFileName(req, new Date())}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

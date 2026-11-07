import { NextResponse } from "next/server";

// Retired for every parent. This path must never read a family, make a signed URL, or redirect to a full workbook.
export async function GET() {
  return new NextResponse("Workbook PDFs are not available.", { status: 410, headers: {
    "Cache-Control": "private, no-store, max-age=0", "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff",
  } });
}

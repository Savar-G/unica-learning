// A published v2 book from Supabase: its saved input from Storage and what made it, for a replay or a bug fixture.
// Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ReplayExpected } from "@/lib/workbook-v2-publish/replay";
import { v2Files, v2PublishStore } from "@/lib/workbook-v2-publish/supabase-store";

export async function storedReplayBundle(id: string): Promise<{ saved: unknown; expected: ReplayExpected }> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  const book = await v2PublishStore(db).storedBook(id);
  if (!book) throw new Error(`No v2 book ${id}.`);
  if (!book.pdfSha256 || book.pages.some((p) => !p.imageSha256)) throw new Error(`The book ${id} has no fingerprint of its PDF or of a page.`);
  const bytes = await v2Files(db).get(book.inputPath);
  if (!bytes) throw new Error(`The input file ${book.inputPath} is not in Storage.`);
  return {
    saved: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    expected: { ...book, pdfSha256: book.pdfSha256, pageSha256s: book.pages.map((p) => p.imageSha256 ?? "") },
  };
}

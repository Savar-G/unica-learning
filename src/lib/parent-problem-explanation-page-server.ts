import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { markingPageView } from "@/lib/scan-marking";
import { EXPLANATION_MODEL, type ExplanationContext } from "@/lib/parent-problem-explanation";
import { explanationAvailable } from "@/lib/parent-problem-explanation-ai";
import { explanationPriceReady } from "@/lib/parent-explanation-price";
import { pageExplanationItem } from "@/lib/parent-problem-explanation-page";

export async function readPageExplanations(db: SupabaseClient<Database>, parent: string,
  source: { child_id: string; workbook_id: string | null; page_id: string | null; printed_revision: string | null }, view: ReturnType<typeof markingPageView>,
  env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!source.workbook_id || !source.page_id || !source.printed_revision) return view.items.map(item => ({ ...item, explainable: false, questionText: null, correctAnswer: null }));
  const photo = { child_id: source.child_id, workbook_id: source.workbook_id, page_id: source.page_id, printed_revision: source.printed_revision };
  const [price, page, questions, workbook] = await Promise.all([
    db.from("parent_explanation_prices").select("enabled,verified_at,protocol,max_input_bytes,max_tokens,maximum_micros").eq("model", EXPLANATION_MODEL).maybeSingle(),
    db.from("workbook_pages").select("page_number,print_contract").eq("id", photo.page_id).eq("workbook_id", photo.workbook_id).eq("parent_id", parent).maybeSingle(),
    db.from("workbook_questions").select("question_number,package,schema_version,teaching,regions").eq("page_id", photo.page_id).eq("workbook_id", photo.workbook_id).eq("parent_id", parent),
    db.from("workbooks").select("status,printed_revision").eq("id", photo.workbook_id).eq("parent_id", parent).eq("child_id", photo.child_id).maybeSingle(),
  ]);
  const ready = !price.error && explanationPriceReady(price.data, Date.now()) && explanationAvailable(env);
  const complete = view.completion.status === "complete" && !page.error && !!page.data?.print_contract && !questions.error
    && !workbook.error && workbook.data?.status === "shipped" && workbook.data.printed_revision === photo.printed_revision;
  return view.items.map(item => {
    const question = questions.data?.find(question => question.question_number === item.number);
    const context: ExplanationContext | null = page.data && question ? { parent, child: photo.child_id, workbook: photo.workbook_id,
      revision: photo.printed_revision, page: photo.page_id, pageNumber: page.data.page_number, itemId: item.itemId, number: item.number,
      version: item.version, context: "", package: question.package, schemaVersion: question.schema_version, teaching: question.teaching,
      regions: question.regions, readAnswer: item.readAnswerText ?? "" } : null;
    return { ...item, ...pageExplanationItem(item, context, complete, ready) };
  });
}

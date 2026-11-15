import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { readScanMarking } from "@/lib/scan-marking-server";
import { scanView } from "@/lib/scan-photo-server";
import { checkedReady } from "@/lib/scan-crops";
import { waitsForTeam } from "@/lib/scan-marking";
import { storedPrintContract, storedRegions } from "@/lib/workbook-print-contract";
import { answerBoxes, normalizedBox, type ScanResultsPageData } from "@/lib/scan-page-results";

export async function readScanResultsPage(db: SupabaseClient<Database>, parent: string, id: string,
  result: NonNullable<Awaited<ReturnType<typeof readScanMarking>>>): Promise<ScanResultsPageData | null> {
  const photo = await scanView(db, parent, id);
  if (!photo) return null;
  const otherIds = [...new Set(result.items.flatMap(item => item.photoAvailable && item.evidencePhoto && item.evidencePhoto !== id ? [item.evidencePhoto] : []))];
  const [source, page, book, questions, calibration] = await Promise.all([
    db.from("scan_photos").select("printed_revision").eq("id", id).eq("parent_id", parent).maybeSingle(),
    db.from("workbook_pages").select("page_number,image_width,image_height,print_contract").eq("id", photo.page_id ?? "").eq("workbook_id", photo.workbook_id ?? "").eq("parent_id", parent).maybeSingle(),
    db.from("workbooks").select("printed_revision,status").eq("id", photo.workbook_id ?? "").eq("child_id", photo.child_id).eq("parent_id", parent).maybeSingle(),
    db.from("workbook_questions").select("question_number,regions,box_x,box_y,box_width,box_height").eq("page_id", photo.page_id ?? "").eq("workbook_id", photo.workbook_id ?? "").eq("parent_id", parent),
    db.from("scan_calibrations").select("state,printed_revision,result").eq("photo_id", id).eq("parent_id", parent).maybeSingle(),
  ]);
  const image = page.data?.image_width && page.data.image_height ? { width: page.data.image_width, height: page.data.image_height } : null;
  const contract = !page.error && page.data && photo.workbook_id ? storedPrintContract(page.data.print_contract,
    { workbookId: photo.workbook_id, page: page.data.page_number, image }) : null;
  const samePrint = !source.error && !book.error && !!source.data?.printed_revision && book.data?.status === "shipped"
    && book.data.printed_revision === source.data.printed_revision;
  const stored = calibration.data;
  const aligned = !!(samePrint && contract && !calibration.error && stored?.state === "ready"
    && stored.printed_revision === source.data?.printed_revision && checkedReady(stored.result)
    && stored.result?.parts?.includes("straight") && stored.result.straight?.width === image?.width && stored.result.straight?.height === image?.height);
  const photoSize = aligned ? image : photo.width && photo.height ? { width: photo.width, height: photo.height } : null;
  const otherPhotos = otherIds.length ? await db.from("scan_photos").select("id,width,height,state,expires_at,printed_revision")
    .eq("parent_id", parent).eq("child_id", photo.child_id).eq("page_id", photo.page_id ?? "").eq("workbook_id", photo.workbook_id ?? "").in("id", otherIds) : null;
  return {
    child: photo.child ?? "Your child", day: photo.day ?? null, page: photo.page ?? null,
    photo: result.photoAvailable && photo.state === "saved" && photoSize ? {
      src: `/api/account/scans/${encodeURIComponent(id)}/${aligned ? "preview/straight" : "image"}`,
      ...photoSize, aligned,
    } : null,
    budgetHeld: !!result.budgetHeld, unfinished: !!result.unfinished,
    questions: result.items.map(item => {
      const mark = result.marks.find(mark => mark.expected.identity.itemId === item.itemId);
      const team = !!mark && waitsForTeam(mark);
      const finished = !team && (item.state === "scored" || item.state === "parent-checked");
      const kind = team ? "team" : finished && item.result === "right" ? "right" : finished && (item.result === "wrong" || item.result === "blank") ? "review" : item.state === "unscored" ? "unscored" : "pending";
      const question = !questions.error && questions.data?.find(question => question.question_number === item.number);
      const mapped = aligned && image && item.evidencePhoto === id && question;
      const evidence = !otherPhotos?.error && otherPhotos?.data?.find(evidence => evidence.id === item.evidencePhoto
        && evidence.state === "saved" && Date.parse(evidence.expires_at) > Date.now() && evidence.printed_revision === source.data?.printed_revision);
      return {
        itemId: item.itemId, version: item.version, number: item.number, kind,
        readAnswer: team ? null : item.readAnswerText,
        questionText: kind === "review" && samePrint && contract ? item.questionText : null,
        correctAnswer: kind === "review" && samePrint && contract ? item.correctAnswer : null,
        explainable: kind === "review" && samePrint && !!contract && item.explainable && !!item.correctAnswer,
        evidencePhoto: item.photoAvailable ? item.evidencePhoto : null,
        evidenceImage: evidence && evidence.width && evidence.height ? { src: `/api/account/scans/${encodeURIComponent(evidence.id)}/image`, width: evidence.width, height: evidence.height, aligned: false } : null,
        regions: mapped ? answerBoxes(storedRegions(question.regions, image), image) : [],
        questionBox: mapped ? normalizedBox({ x: question.box_x, y: question.box_y, width: question.box_width, height: question.box_height }, image) : null,
      };
    }),
  };
}

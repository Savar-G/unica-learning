import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { markingCommand, scanMarkChanges } from "@/lib/scan-marking-store";
import { readScanMarking } from "@/lib/scan-marking-server";
import type { ScanRejectReason } from "@/lib/scan-states";
import { waitsForTeam } from "@/lib/scan-marking";
import { readingIssueText, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { AdminTeamMark } from "@/components/admin-team-mark";
import { teamMarkNeedsPhoto } from "@/lib/scan-team-marks";
import { isUuid } from "@/lib/workbook-content";
import { when } from "@/lib/admin-view";
import { Table } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { MarkHead, ResultChip, actorText, readText } from "@/components/admin-marking";
import type { ScanCalibrationResult } from "@/lib/scan-crops";
import { ScanPrivateImages } from "@/components/scan-private-images";
import { PHOTO_CHECK_THRESHOLDS, PHOTO_PROBLEMS, readPhotoCheck, type PhotoCheck } from "@/lib/scan-photo-check";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** A result or reading state, in words, for a change. */
/** The photo check's values in words (#855). */
function photoCheckText(check: PhotoCheck | null): string {
  if (!check) return "Not run. It runs on a ready page, for test families and admins only, with the decision key set.";
  if (check.state === "pending") return `Checking since ${when(check.at)}.`;
  if (check.state === "unknown") return `No result (${check.error}) · ${check.model} · thresholds version ${check.version} · ${when(check.at)}. The parent saw no problem.`;
  const values = PHOTO_PROBLEMS.filter((p) => check.probabilities[p] !== undefined)
    .map((p) => `${p} ${check.probabilities[p]!.toFixed(2)} (threshold ${PHOTO_CHECK_THRESHOLDS[p] ?? "off"})`).join(", ");
  return `${check.problem ? `Problem: ${check.problem}` : "No problem"} · ${values || "no values"} · ${check.model} · thresholds version ${check.version} · ${check.ms} ms · ${when(check.at)}`;
}

const resultText = (r: string | null | undefined) => r === "right" ? "Right" : r === "wrong" ? "Wrong" : r === "blank" ? "Blank" : r === "unscored" ? "Not scored" : "Not marked";

const REJECT_REASON_TEXT: Record<ScanRejectReason, string> = {
  qr: "The page code could not be read.",
  size: "The image was too large.",
  image: "The image could not be read.",
  flat: "The page was not flat enough.",
  page: "The page could not be matched to an open workbook.",
  duplicate: "This page already had a photo.",
  refused: "The upload was refused.",
  expired: "The upload expired.",
  busy: "The upload could not start because other scans were in progress.",
  unavailable: "The upload service was temporarily unavailable.",
  unexpected: "An unexpected error interrupted the upload.",
};

const CORNERS = ["top left", "top right", "bottom right", "bottom left"];
const corners = (indices: number[]) => indices.map(i => CORNERS[i]).join(", ") || "None";

function PageCheckDetails({ result }: { result: ScanCalibrationResult }) {
  const { details, reason, review } = result;
  if (!details) return null;
  const { marks, markCandidates, qrRead, qrCorners, placement, qrPatches, pageFit, covered } = details;
  return <>
    <h3>Page alignment check</h3>
    <dl>
      {(reason || review) && <><dt>Reason</dt><dd>{reason ?? review}</dd></>}
      {markCandidates !== undefined && <><dt>Possible marks</dt><dd>{markCandidates}</dd></>}
      {marks && <>
        <dt>Marks found</dt><dd>{corners(marks.found)}</dd>
        <dt>Marks hidden</dt><dd>{corners(marks.hidden)}</dd>
        <dt>Marks outside the photo</dt><dd>{corners(marks.missing)}</dd>
      </>}
      <dt>QR code</dt><dd>{qrRead === 2 ? "This page's code" : qrRead === 1 ? "Another code" : "No code read"}</dd>
      {qrCorners && <><dt>QR corners in photo pixels</dt><dd>{qrCorners.map(({ x, y }) => `(${x}, ${y})`).join(", ")}</dd></>}
      {placement !== undefined && <><dt>Placement method</dt><dd>{placement === 2 ? "QR code and print" : "Corner marks"}</dd></>}
      {qrPatches !== undefined && <><dt>Matched print patches for QR placement</dt><dd>{qrPatches}</dd></>}
      {pageFit !== undefined && <><dt>Page fit</dt><dd>{pageFit}</dd></>}
    </dl>
    {covered?.length ? <Table label="Covered answer regions" head={["Question", "Region", "Ring cells visible", "Ring cells checked", "Minimum visible"]} empty="No covered regions.">
      {covered.map(({ question, region, shown, examined, required }) => <tr key={`${question}-${region}`}>
        <td>{question}</td><td>{region}</td><td>{shown}</td><td>{examined}</td><td>{required}</td>
      </tr>)}
    </Table> : null}
  </>;
}

// One marked page (D-313, D-315): the photo large, the answers for our team to mark beside it, every answer's reading as
// a compact list, the mark changes as a timeline, and the raw data in a closed "Technical details" section.
export default async function AdminScanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string }> }) {
  const admin = await requireAdmin(), { id } = await params;
  if (!isUuid(id)) notFound();
  // Ownership comes from an RLS read with the verified admin session, before the server-only detail read.
  const row = await admin.db.from("scan_photos").select("parent_id,state").eq("id", id).maybeSingle();
  const db = adminClient();
  if (row.error || !row.data || !db) notFound();
  const result = await readScanMarking(db, row.data.parent_id, id);
  if (!result) notFound();
  const after = (await searchParams).after ?? "0";
  if (!/^\d{1,15}$/.test(after)) notFound();
  const { parent_id: parent, state } = row.data;
  const rejected = state === "rejected";
  // Fetch separately so a missing reason column during rollout cannot hide existing photo details.
  const [checkRow, rejection, pageCheck] = await Promise.all([
    db.from("scan_photos").select("photo_check").eq("id", id).eq("parent_id", parent).maybeSingle(),
    rejected
      ? db.from("scan_photos").select("reject_reason").eq("id", id).eq("parent_id", parent).maybeSingle()
      : null,
    admin.db.from("scan_calibrations").select("result").eq("photo_id", id).eq("parent_id", parent).maybeSingle(),
  ]);
  const rejectReason = rejection?.data?.reject_reason;
  const photoCheck = checkRow.error || !checkRow.data ? null : readPhotoCheck(checkRow.data.photo_check);
  const history = await scanMarkChanges(markingCommand(db), row.data.parent_id, id, Number(after));
  const waiting = result.marks.filter(waitsForTeam);
  // The team mark names the item's row. Read the row ids of this page's waiting items with the server key.
  const rows = waiting.length ? await db.from("scan_marking_items").select("id,item_id,workbook_id,page_id,printed_revision,owner_photo").eq("parent_id", row.data.parent_id)
    .in("item_id", waiting.map((m) => m.expected.identity.itemId)) : { data: [], error: null };
  if (rows.error) throw new Error("team_mark_rows");
  const itemRow = (m: (typeof waiting)[number]) => (rows.data ?? []).find((r) => r.item_id === m.expected.identity.itemId && r.workbook_id === m.expected.identity.workbookId
    && r.page_id === m.expected.identity.pageId && r.printed_revision === m.expected.identity.printedRevision);
  const rowId = (m: (typeof waiting)[number]) => itemRow(m)?.id ?? null;
  // One rule with admin_set_scan_mark: no buttons where the mark cannot be saved.
  const needsPhoto = (m: (typeof waiting)[number]) => teamMarkNeedsPhoto({ eligible: m.expected.mastery.eligible, hasEvent: m.originalEvent !== null,
    photo: m.observation.evidence?.photoRevision ?? itemRow(m)?.owner_photo ?? null });
  const reason = (issue: unknown) => typeof issue === "string" && READING_ISSUES.includes(issue as ReadingIssue) ? readingIssueText(issue as ReadingIssue) : "Waiting for a person to mark it.";
  const waitingNumbers = new Set(waiting.map((m) => m.expected.number));
  const otherNumbers = result.items.map((i) => i.number).filter((n) => !waitingNumbers.has(n));
  return <AdminFrame email={admin.email} title="Marked page" lead="The photo, the answers our team must mark, and every change to the marks."
    actions={<Link className="btn adm-btn ghost" href="/admin/scans">All marking</Link>}>
    <div className="adm-mk-page">
      <section className="adm-mk-photo" aria-label="The scanned page">
        {result.photoAvailable ? <ScanPrivateImages photo={id} numbers={[]} /> : <p className="adm-mk-empty">Photo no longer available</p>}
        {rejected && <p className="adm-mk-empty">Upload rejected. {rejectReason ? REJECT_REASON_TEXT[rejectReason] : "No reason was recorded."}</p>}
      </section>
      <section className="adm-mk-side" aria-labelledby="mk-mark">
        <MarkHead id="mk-mark" title="Answers for our team to mark" count={waiting.length}>The AI was not sure of these answers. Look at the photo, then set the mark. The family sees it at once and can still change it.</MarkHead>
        {waiting.length === 0 ? <p className="adm-mk-empty">No answers are waiting for our team on this page.</p>
          : <ul className="adm-mk-marks">{waiting.map((m) => <li key={m.expected.identity.itemId}>
            {result.photoAvailable && <ScanPrivateImages photo={id} numbers={[m.expected.number]} cropsOnly />}
            <div className="adm-mk-mark-text">
              <b>Question {m.expected.number}</b>
              <span>The AI read <q>{readText(m.observation.readAnswerText)}</q></span>
              <span className="adm-mk-why">{reason(m.observation.issue)}</span>
            </div>
            <div className="adm-mk-mark-act">{!rowId(m) ? <p className="adm-note">Reload the page</p> : needsPhoto(m) ? <p className="adm-note">This answer has no saved photo, and its mark would count toward progress, so it cannot be marked here. Ask the family to send a new photo of this page.</p>
              : <AdminTeamMark item={rowId(m)!} version={m.observation.resultVersion} number={m.expected.number} />}</div>
          </li>)}</ul>}
      </section>
    </div>
    <section className="adm-mk" aria-labelledby="mk-check">
      <MarkHead id="mk-check" title="Photo check">Whether the answers in the photo look readable, checked at upload. The parent sees a problem with &quot;Take again&quot; and &quot;Send anyway&quot;. Times are Pacific.</MarkHead>
      <p className="adm-mk-empty">{photoCheckText(photoCheck)}</p>
    </section>
    <section className="adm-mk" aria-labelledby="mk-items">
      <MarkHead id="mk-items" title="Every answer on this page" count={result.items.length}>What the AI read and the mark now. Times are Pacific.</MarkHead>
      {result.items.length === 0 ? <p className="adm-mk-empty">No readings yet.</p>
        : <ul className="adm-mk-items">{result.items.map((i) => <li key={i.itemId}>
          <b>Q{i.number}</b>
          <span className="adm-mk-read">{readText(i.readAnswerText)}</span>
          <ResultChip result={i.result} waiting={i.result === null && waitingNumbers.has(i.number)} label={i.result ? resultText(i.result) : i.state === "unscored" ? "Not scored" : waitingNumbers.has(i.number) ? "Our team is checking" : "Not marked yet"} />
          <span className="adm-mk-by">{actorText(i.actor)} · {when(i.at)}</span>
        </li>)}</ul>}
      {result.photoAvailable && otherNumbers.length > 0 && <details className="adm-mk-crops">
        <summary>Pictures of the other {pl(otherNumbers.length, "answer", "answers")}</summary>
        <ScanPrivateImages photo={id} numbers={otherNumbers} cropsOnly />
      </details>}
    </section>
    <section className="adm-mk" aria-labelledby="mk-changes">
      <MarkHead id="mk-changes" title="Mark changes" count={history.length}>Each change by a parent or our team, oldest first. Times are Pacific.</MarkHead>
      {history.length === 0 ? <p className="adm-mk-empty">No changes on this page.</p>
        : <ol className="adm-mk-timeline" aria-label="Mark changes by a parent or our team">{history.map((h) => <li key={h.id}>
          <span className="adm-mk-dot" aria-hidden="true" />
          <div>
            <p><b>Question {h.previous.expected.number}</b>: {resultText(h.previous.observation.result ?? h.previous.observation.state)} to {resultText(h.current.result)}</p>
            <p className="adm-mk-by">{actorText(h.actor)} · {when(h.at)} · version {h.from} to {h.to} · the AI read <q>{h.previous.observation.readAnswerText ?? "Not read"}</q></p>
          </div>
        </li>)}</ol>}
      <p className="adm-row">
        {history.length > 0 && <Link href={`/admin/scans/${id}?after=${history[history.length - 1].id}`}>More changes</Link>}
        {Number(after) > 0 && <Link href={`/admin/scans/${id}`}>First changes</Link>}
      </p>
    </section>
    <details className="adm-tech">
      <summary>Technical details</summary>
      {pageCheck.data?.result && <PageCheckDetails result={pageCheck.data.result} />}
      <Table label="What the AI read and the result of each question" head={["Question", "What the AI read", "Result", "By / time", "Counts toward progress", "Learning event"]} empty="No readings yet.">
        {result.marks.map((m) => <tr key={m.expected.identity.itemId}>
          <td>{m.expected.number}</td><td>{m.observation.readAnswerText ?? "Not read"}</td>
          <td>{m.observation.result ?? m.observation.state} (version {m.observation.resultVersion})</td>
          <td>{m.observation.actor} / {m.at}</td>
          <td>{m.expected.mastery.eligible ? "Yes" : m.expected.mastery.reason}</td>
          <td>{m.eventId ? <Link href={`/admin/scans/${id}#event-${m.eventId}`}>{m.eventId}</Link> : "None"}</td>
        </tr>)}
      </Table>
      <h3>Marking job and its cost</h3>
      <pre>{JSON.stringify(result.detail, null, 2)}</pre>
      {result.marks.filter((m) => m.eventId).map((m) => <div key={m.eventId} id={`event-${m.eventId}`}><h3>Learning event for question {m.expected.number}</h3><pre>{JSON.stringify(m.originalEvent, null, 2)}</pre></div>)}
    </details>
  </AdminFrame>;
}

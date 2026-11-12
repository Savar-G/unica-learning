import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { getChild, requireAdmin } from "@/lib/admin-store";
import { whenExact } from "@/lib/admin-view";
import { localDay, PACIFIC_ZONE } from "@/lib/family-time";
import { readBook1Baseline } from "@/lib/workbook-book1-baseline";
import { replayWorkbookPreviewAny } from "@/lib/workbook-preview-record";
import { compareWorkbookPreviews } from "@/lib/workbook-preview-comparison";
import { makePreview } from "./actions";

async function todayInVancouver() { return localDay(Date.now(), PACIFIC_ZONE); }

export default async function PreviewMarks({ params, searchParams }: PageProps<"/admin/children/[id]/preview-marks">) {
  const admin = await requireAdmin();
  const today = await todayInVancouver();
  const { id } = await params;
  const query = await searchParams;
  const record = await getChild(admin, id);
  if (!record) notFound();
  const [books, baselines, saved] = await Promise.all([
    admin.db.from("workbooks").select("id,number,printed_revision,status").eq("child_id", id).eq("parent_id", record.child.parent_id).eq("status", "shipped").order("number"),
    admin.db.from("workbook_book1_baselines").select("draft_id,payload,payload_hash").eq("child_id", id).eq("parent_id", record.child.parent_id),
    admin.db.from("workbook_plan_previews").select("id,payload,payload_hash,created_at").eq("child_id", id).eq("parent_id", record.child.parent_id).eq("actor_id", admin.userId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (books.error || baselines.error || saved.error) throw Error("Could not read previews.");
  const docs = (await Promise.all(saved.data.map(async row => {
    try {
      const request = JSON.parse(row.payload).request;
      const doc = await replayWorkbookPreviewAny({ payload: row.payload, hash: row.payload_hash }, admin.userId, request);
      return doc && doc.request.childId === id ? { row, doc } : null;
    } catch { return null; }
  }))).filter(x => x !== null);
  const selected = docs.find(x => x.row.id === query.preview);
  const previous = docs.find(x => x.row.id === query.compare);
  const comparable = (x: NonNullable<typeof selected>) => x.doc.outcome.ok ? {
    childId: x.doc.request.childId, workbookId: x.doc.request.workbookId, selection: x.doc.request.selection,
    cutoff: x.doc.request.cutoff, consumedVersions: x.doc.outcome.consumedVersions,
    decision: x.doc.outcome.decision, plan: x.doc.outcome.plan,
  } : null;
  const old = previous && comparable(previous), current = selected && comparable(selected);
  const change = old && current ? compareWorkbookPreviews(old, current) : null;
  const describeMark = (key: string) => {
    const item = current?.decision.items.find(i => i.key === key) ?? old?.decision.items.find(i => i.key === key);
    return item ? `Page ${item.question.page}, question ${item.question.question}` : "A mark outside this sample";
  };
  const stepName = (skill: string, step: number) => `${skill.replace(/^[0-9.]+-/, "").replaceAll("-", " ")}, step ${step}`;
  return <AdminFrame email={admin.email} title={`Preview from marks for ${record.child.first_name}`}>
    <p><Link href={`/admin/children/${id}`}>Back to the child</Link></p>
    <p>This preview uses marks from one skill. It saves the evidence and the plan. It does not start a workbook.</p>
    <h2>Make a preview</h2>
    {!baselines.data.some(b => books.data.some(book => book.id === b.draft_id && book.printed_revision)) && <p>A delivered book with a saved starting record is required before you can make a preview.</p>}
    {books.data.map(book => {
      const row = baselines.data.find(b => b.draft_id === book.id);
      const baseline = row && readBook1Baseline({ payload: row.payload, hash: row.payload_hash });
      if (!baseline || !book.printed_revision) return null;
      return <form key={book.id} action={makePreview.bind(null, id)}>
        <h3>Workbook {book.number}</h3>
        <input type="hidden" name="workbook" value={book.id} /><input type="hidden" name="revision" value={book.printed_revision} />
        <label>Skill and step <select name="selection" required>{baseline.initialIssues.map(i => <option key={JSON.stringify(i.selection)} value={JSON.stringify(i.selection)}>{baseline.curriculum.skills.find(s => s.skill.id === i.selection.skill)?.skill.text ?? i.selection.skill}, step {i.selection.step}</option>)}</select></label>{" "}
        <label>Marks through date (Vancouver) <input type="date" name="cutoff" defaultValue={today} max={today} required /></label>{" "}
        <label>Pages <select name="scope"><option value="day7">Days 1 to 7</option><option value="later-book">All available days</option></select></label>{" "}
        <button type="submit" className="btn adm-btn">Save preview</button>
      </form>;
    })}
    <h2>Saved previews</h2><p>Shows up to 100 of your latest previews.</p>
    {!docs.length && <p>No saved previews.</p>}
    <ul>{docs.map(x => <li key={x.row.id}><Link href={`?preview=${x.row.id}`}>{whenExact(x.row.created_at)} Vancouver - {x.doc.request.selection.skill}, step {x.doc.request.selection.step}</Link></li>)}</ul>
    {selected && <section><h2>Saved preview</h2><p>Marks through {whenExact(new Date(selected.doc.request.cutoff).toISOString())} Vancouver.</p>
      {!selected.doc.outcome.ok ? <p role="status">A plan is not available for this evidence. Check that the book has marks and a saved starting record.</p> : <>
        <p>Step decision: {selected.doc.outcome.decision.action.replaceAll("-", " ")}. Target step {selected.doc.outcome.decision.target.step}.</p>
        <p>First answers correct without help: {selected.doc.outcome.decision.score.independentFirstRight} of {selected.doc.outcome.decision.score.required}. Marks used: {selected.doc.outcome.consumedVersions.length}.</p>
        <h3>Results</h3><ul>{selected.doc.outcome.decision.items.map(item => <li key={item.key}>Page {item.question.page}, question {item.question.question}: {item.effective?.observation.result ?? item.status}; help: {item.first?.observation.help ?? "unknown"}; mark version: {item.effective?.observation.resultVersion ?? "not available"}; {item.secondTries.some(t => t.result === "right" && t.basedOnResultVersion === item.effective?.observation.resultVersion) ? "fixed on another try" : item.unresolved ? "still needs attention" : "no open mistake"}</li>)}</ul>
        <h3>Next plan</h3><ul>{selected.doc.outcome.plan.days.map(day => <li key={day.day}>Day {day.day}: {day.pages.map(p => `page ${p.number} ${p.type.replaceAll("-", " ")}`).join(", ")}</li>)}</ul>
        <p>Fix it items still waiting for space: {selected.doc.outcome.plan.fixItLater.join(", ") || "none"}.</p>
        <p>Review timing for marks is not yet included.</p>
      </>}
      <form><input type="hidden" name="preview" value={selected.row.id} /><label>Compare with an earlier preview <select name="compare"><option value="">Choose a preview</option>{docs.filter(x => x.row.id !== selected.row.id).map(x => <option key={x.row.id} value={x.row.id}>{whenExact(x.row.created_at)} Vancouver - {x.doc.request.selection.skill}</option>)}</select></label>{" "}<button type="submit">Compare</button></form>
      {query.compare && !change && <p role="status">These previews cannot be compared. Choose an earlier preview for the same book and skill.</p>}
      {change && <div><h3>What changed</h3><p>New marks: {change.newMarks.length}. Changed marks: {change.changedMarks.length}. Marks no longer used: {change.removedMarks.length}.</p><ul>{change.newMarks.map(m => <li key={m.key}>New: {describeMark(m.key)} (version {m.effectiveVersion})</li>)}{change.changedMarks.map(m => <li key={m.key}>Changed: {describeMark(m.key)} (version {m.effectiveVersion})</li>)}{change.removedMarks.map(m => <li key={m.key}>No longer used: {describeMark(m.key)}</li>)}</ul><p>These marks may have contributed to the changes. The comparison does not prove which mark caused a change.</p><p>Step decision changed: {change.decisionChanged ? "yes" : "no"}. Planned steps changed: {change.stepsChanged ? "yes" : "no"}.</p><ul>{change.addedSteps.map(s => <li key={`added-${s.unit}-${s.skill}-${s.step}`}>Added: {stepName(s.skill, s.step)}, Day {s.day}</li>)}{change.removedSteps.map(s => <li key={`removed-${s.unit}-${s.skill}-${s.step}`}>Removed: {stepName(s.skill, s.step)}, Day {s.day}</li>)}{change.movedSteps.map(({ before, after }) => <li key={`moved-${after.unit}-${after.skill}-${after.step}`}>Moved: {stepName(after.skill, after.step)}, Day {before.day}, group {before.track} to Day {after.day}, group {after.track}</li>)}</ul><p>Changed pages: {change.changedPages.map(p => `Day ${p.day}, page ${p.page}`).join("; ") || "none"}.</p></div>}
    </section>}
  </AdminFrame>;
}

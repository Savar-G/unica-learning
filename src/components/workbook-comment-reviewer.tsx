"use client";
import { workbookEditMessage } from "@/lib/workbook-edit-message";
import { watchWorkbookEditProgress, type EditProgress } from "@/lib/workbook-edit-progress";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RunDetail } from "@/lib/admin-store";
import type { ReviewComment } from "@/lib/workbook-edit";
import { workbookEditItem } from "@/lib/workbook-edit-item";
import { GENERATED_FORMATS, buildQuestion } from "@/lib/workbook-generator-items";
import { valueText } from "@/lib/question-package";
import { commentPosition } from "@/lib/workbook-comment-position";
import { plainReason, NEEDS_A_LOOK } from "@/lib/workbook-reason";
import { LAYOUT_REVIEW_MESSAGE, UNCHANGED_COMMENT_MESSAGE, workbookCommentRoute, workbookCommentStatus, type CommentRoute } from "@/lib/workbook-comment-route";
import { WorkbookLayoutReview } from "./workbook-layout-review";
import "./workbook-comment-reviewer.css";

type Anchor = { page: number; question: number | null; x: number; y: number; id?: string; requestKey?: string };
const location = (c: { page: number; question: number | null }) => `Page ${c.page}${c.question === null ? "" : ` · Question ${c.question}`}`;
const labels: Record<string, string> = { text: "Words", operation: "Calculation", operands: "Numbers", kind: "Operation",
  easier: "Easier example", wrongAnswers: "Expected wrong answers", value: "Number", numerator: "Top number", denominator: "Bottom number",
  whole: "Whole number", type: "Number type", difficulty: "Difficulty", expression: "Expression or equation", unit: "Unit",
  format: "Question type", figure: "Picture", figureShows: "Picture shows", name: "Person", thing: "Counted thing", numbers: "Numbers",
  places: "Places", direction: "Order", sequence: "Sequence", start: "First number", step: "Change each time", terms: "Number of terms",
  blanks: "Blank places, counting from zero", pattern: "Pattern", core: "Repeated shapes", shapes: "Number of shapes", blank: "Blank place, counting from zero",
  relation: "Comparison", to: "Compare with", labels: "Names", cause: "Mistake", description: "Explanation", shownWrong: "Wrong answer to show, counting from zero",
  hours: "Hours", minutes: "Minutes", period: "Time of day", parts: "Parts", values: "Values of letters" };
const plain = (s: string) => s.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase());

function Fields({ data, change, label }: { data: unknown; change(v: unknown): void; label: string }) {
  if (Array.isArray(data)) return <fieldset><legend>{label}</legend>{data.map((v, i) => <Fields key={i} data={v} label={`${label} ${i + 1}`} change={(n) => change(data.map((x, k) => k === i ? n : x))} />)}</fieldset>;
  if (data && typeof data === "object") return <fieldset><legend>{label}</legend>{Object.entries(data).filter(([k, v]) =>
    !["slot", "skill", "cause"].includes(k) && !(k === "step" && typeof v === "string") && v !== null && (!Array.isArray(v) || v.length > 0)).map(([k, v]) =>
      <Fields key={k} label={labels[k] ?? plain(k)} data={v} change={(n) => change({ ...data, [k]: n })} />)}</fieldset>;
  if (typeof data === "number") return <label>{label}<input type="number" step="any" value={data} onChange={(e) => change(Number(e.target.value))} /></label>;
  const choices = label === "Question type" ? GENERATED_FORMATS : label === "Operation" ? ["add", "subtract", "multiply", "divide", "missing-addend", "decimal-add", "decimal-subtract", "decimal-multiply", "fraction-add", "fraction-subtract", "fraction-multiply", "fraction-divide", "fraction-simplify", "fraction-equivalent", "convert", "quantity-add", "quantity-subtract", "quantity-multiply", "money-round", "elapsed-time", "time-add", "clock-convert", "evaluate", "solve"] : label === "Picture" ? ["dots", "ten-frame", "number-line", "base-ten", "array"] : null;
  if (choices && typeof data === "string") return <label>{label}<select value={data} onChange={(e) => change(e.target.value)}>{choices.map((v) => <option key={v} value={v}>{plain(v)}</option>)}</select></label>;
  if (label === "Number type" && typeof data === "string") return <label>{label}<output>{plain(data)}</output></label>;
  return <label>{label}{typeof data === "string" && (label === "Words" || label === "Explanation")
    ? <textarea value={data} onChange={(e) => change(e.target.value)} />
    : <input value={String(data ?? "")} onChange={(e) => change(e.target.value)} />}</label>;
}
function commentReason(reason: string) {
  if (reason === LAYOUT_REVIEW_MESSAGE || reason === UNCHANGED_COMMENT_MESSAGE || reason.startsWith("Partly applied.") || reason.startsWith("This request did not change") || reason.startsWith("The page did not change")) return reason;
  if (/story|person with a first name|counted thing/.test(reason)) return "Use a person's first name. Name the counted things in the question.";
  const plain = plainReason(reason);
  if (plain !== NEEDS_A_LOOK) return plain;
  if (/Reload the page|no longer exists|unavailable|previous version is unchanged|call limit of 5/.test(reason)) return reason;
  return "The check could not confirm this change. Edit the comment and try again.";
}
function preview(value: unknown): string {
  if (!value || typeof value !== "object") return "No question";
  const v = value as { package?: { text?: string }; questions?: { package?: { text?: string } }[] };
  return v.package?.text ?? v.questions?.map((q) => q.package?.text).filter(Boolean).join("\n") ?? "No question";
}

export function WorkbookCommentReviewer({ detail, history }: { detail: RunDetail; history: { id: number; text: string }[] }) {
  const router = useRouter(), draft = detail.draft!;
  const pages = draft.workbook.pages;
  const [selected, setSelected] = useState(pages.find((p) => p.questions.length)?.number ?? 1);
  const [anchor, setAnchor] = useState<Anchor | null>(null), [note, setNote] = useState("");
  const [item, setItem] = useState<unknown>(null), [exact, setExact] = useState(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [requestedRoute, setRequestedRoute] = useState<CommentRoute | "auto">("auto");
  const [progress, setProgress] = useState<EditProgress | null>(null), [progressErrors, setProgressErrors] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const locked = detail.approved?.status === "printed" || detail.approved?.status === "shipped";
  const active = detail.editBatch?.status === "queued" || detail.editBatch?.status === "running";
  const currentProgress = progress?.id === detail.editBatch?.id ? progress : null;
  const loadingResult = active && (currentProgress?.status === "done" || currentProgress?.status === "failed");
  const stalled = active && (currentProgress ? currentProgress.phase === "stalled" : detail.editBatch?.stalled);
  const working = active && !stalled;
  const resultMessage = workbookEditMessage(detail.editBatch, detail.comments);
  const pending = detail.comments.filter((c) => c.status === "pending" || c.status === "failed");
  const layoutComments = pending.filter(c => workbookCommentRoute(pages.find(p => p.number === c.page), c.note, c.route) === "layout");
  const page = pages.find((p) => p.number === selected)!;
  const rendered = draft.rendering?.pages.find((p) => p.number === selected);
  const comments = detail.comments.filter((c) => c.page === selected);
  useEffect(() => {
    if (!active) return;
    return watchWorkbookEditProgress({
      async read(signal) {
        const response = await fetch(`/api/admin/workbooks/runs/${detail.run.id}/edit`, { cache: "no-store", signal });
        if (!response.ok) throw new Error("Progress is unavailable.");
        return response.json();
      },
      update(next) {
        setProgressErrors(0);
        if (!next || next.id !== detail.editBatch?.id || next.status === "done" || next.status === "failed") {
          setProgress(next); router.refresh(); return false;
        }
        setProgress(next); return true;
      },
      unavailable() { setProgressErrors(n => n + 1); },
    });
  }, [active, detail.editBatch?.id, detail.run.id, router]);
  useEffect(() => { if (anchor) input.current?.focus(); }, [anchor]);
  function select(a: Anchor, comment?: ReviewComment) {
    if (locked || working) return;
    setSelected(a.page); setAnchor({ ...a, requestKey: a.requestKey ?? crypto.randomUUID() }); setNote(comment?.note ?? ""); setExact(!!comment?.item); setItem(comment?.item ?? null); setError("");
    setRequestedRoute(comment?.route ?? "auto");
  }
  async function post(body: object) {
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await fetch(`/api/admin/workbooks/runs/${detail.run.id}/edit`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: draft.revision, ...body }) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.reason ?? "The comment could not be saved.");
      if (result.status === "layout-review") setNotice(result.reason);
      router.refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Reload to check whether the comment was saved."); return false; }
    finally { setSaving(false); }
  }
  async function add() {
    if (!anchor || !note.trim() || saving) return;
    const route = workbookCommentRoute(pages.find(p => p.number === anchor.page), note, requestedRoute === "auto" ? undefined : requestedRoute);
    if (await post({ comment: { ...anchor, note, route, item: exact && route === "question" ? item : null } })) { setAnchor(null); setNote(""); setExact(false); }
  }
  const question = anchor?.question ? pages.find((p) => p.number === anchor.page)?.questions.find((q) => q.number === anchor.question) : null;
  const questionRouteAvailable = !!anchor && workbookCommentRoute(pages.find(p => p.number === anchor.page), note) === "question";
  const displayRoute = requestedRoute === "question" && !questionRouteAvailable ? "layout" : requestedRoute;
  const built = exact && question?.package && item ? buildQuestion(item, { id: question.package.id, workbookId: draft.workbook.id,
    page: selected, question: question.number, level: question.package.level, skills: question.package.skill.skills }) : null;
  const changed = new Set(comments.filter((c) => c.status === "done").map((c) => c.question));
  const workingPages = [...new Set(detail.comments.filter((c) => c.status === "sent").map((c) => c.page))];
  const phaseText: Record<EditProgress["phase"], string> = { waiting: "Waiting for your Mac", working: "Applying comments",
    retrying: "Retrying with saved work", stalled: "The edit stopped", saving: "Saving the new revision",
    done: "Changes saved. Loading the new revision", failed: "The edit stopped. Loading the comment results" };
  const state = active && currentProgress ? phaseText[currentProgress.phase]
    : working ? detail.editBatch?.status === "queued" && detail.editBatch.runner === "mac" ? "Waiting for your Mac"
      : `Applying comments to ${workingPages.length} ${workingPages.length === 1 ? "page" : "pages"}` : "Comment mode";
  return <section className="wbr" aria-label="Workbook review">
    <header className="wbr-bar"><div><strong>Review workbook</strong><span>Version {draft.revision} · {state}</span></div>
      <div className="wbr-progress"><button className="btn adm-btn" disabled={locked || working || saving || (!pending.length && !stalled)} onClick={() => post({ send: true })}>
        {loadingResult ? "Loading results..." : stalled ? "Try again" : working ? "Applying comments..." : `Send all comments (${pending.length})`}</button>
        {active && <span role="status">{currentProgress
          ? `${currentProgress.checked} of ${currentProgress.total} pages checked. ${currentProgress.ready} ready. ${currentProgress.failed} need attention.`
          : "Checking saved progress..."}</span>}
      </div>
    </header>
    {locked && <p className="wbr-message" role="note">This workbook is {detail.approved?.status}. It cannot change. You can read its comments.</p>}
    {stalled && <p role="alert" className="wbr-message">The edit stopped. Try again to continue with the saved responses.</p>}
    {working && <p className="wbr-message" role="status">{state} Your current workbook stays in place until the checked changes are ready.</p>}
    {active && progressErrors > 0 && <p className="wbr-message" role="alert">Progress is unavailable. Retrying shortly.{currentProgress ? " The last saved counts stay above." : " No saved count is available yet."}</p>}
    {resultMessage && <p role="alert" className="wbr-message">{resultMessage}</p>}
    {notice && <p role="status" className="wbr-message">{notice}</p>}
    {layoutComments.length > 0 && <p className="wbr-message" role="note">{layoutComments.length} page-layout {layoutComments.length === 1 ? "comment needs" : "comments need"} review. Send all comments applies supported question text. Layout requests stay open in the review path below.</p>}
    <div className="wbr-body">
      <nav className="wbr-thumbs" aria-label="Workbook pages">{pages.map((p) => {
        const count = detail.comments.filter((c) => c.page === p.number).length;
        const image = draft.rendering?.pages.find((i) => i.number === p.number);
        return <button key={p.number} aria-current={selected === p.number ? "page" : undefined} onClick={() => { setSelected(p.number); setAnchor(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && detail.images[image.image.path] && <img src={detail.images[image.image.path]} alt="" loading="lazy" />}
          Page {p.number}{count > 0 && <b title={`${count} comments`}>{count}</b>}</button>;
      })}</nav>
      <div className="wbr-canvas"><p>Page {selected} · {page.questions.length} questions</p>
        <div className="wbr-sheet" style={{ aspectRatio: rendered ? `${rendered.image.width}/${rendered.image.height}` : "8.5/11" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {rendered && detail.images[rendered.image.path] && <img src={detail.images[rendered.image.path]} alt={`Workbook page ${selected}`} />}
          <button className="wbr-page-hit" disabled={locked || working} aria-label={`Comment on page ${selected}`} onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect(); select({ page: selected, question: null, ...commentPosition(e.detail, e.clientX, e.clientY, r) });
          }} />
          {rendered?.questions.map((q) => <button key={q.number} disabled={locked || working} aria-label={`Comment on question ${q.number} on page ${selected}`}
            className={`wbr-question${changed.has(q.number) || changed.has(null) ? " wbr-changed" : ""}`}
            style={{ left: `${q.box.x / rendered.image.width * 100}%`, top: `${q.box.y / rendered.image.height * 100}%`, width: `${q.box.width / rendered.image.width * 100}%`, height: `${q.box.height / rendered.image.height * 100}%` }}
            onClick={() => select({ page: selected, question: q.number, x: q.box.x / rendered.image.width, y: q.box.y / rendered.image.height })}>
              <span>{changed.has(q.number) || changed.has(null) ? "Changed · " : ""}{q.number}</span></button>)}
          {comments.map((c) => <button key={c.id} className={`wbr-pin ${c.status}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
            aria-label={`${location(c)}: ${c.note}`} onClick={() => { if (["pending", "failed", "stale"].includes(c.status)) select({ ...c }, c); else document.getElementById(`comment-${c.id}`)?.scrollIntoView({ block: "nearest" }); }}>{detail.comments.findIndex((x) => x.id === c.id) + 1}</button>)}
        </div>
        <label className="wbr-question-list">Select a question<select disabled={locked || working} value={anchor?.page === selected ? anchor.question ?? "page" : ""} onChange={(e) => select({ page: selected, question: e.target.value === "page" ? null : Number(e.target.value), x: .5, y: .2 })}>
          <option value="" disabled>Choose a location</option><option value="page">Whole page</option>{page.questions.map((q) => <option key={q.number} value={q.number}>Question {q.number}: {q.package?.text ?? "Needs fixing"}</option>)}</select></label>
      </div>
      <aside className="wbr-comments" aria-label="Review comments"><h3>Comments <span>{pending.length} pending</span></h3>
        <p className="adm-sub">Select a question or a place on the page. Save each comment, then send them together.</p>
        {anchor && <form className="wbr-compose" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <strong>{location(anchor)}</strong><label>What needs to change?<textarea ref={input} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setAnchor(null); } if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void add(); } }} /></label>
          <label>Change type<select value={displayRoute} onChange={e => setRequestedRoute(e.target.value as CommentRoute | "auto")}>
            <option value="auto">Choose automatically</option><option value="question" disabled={!questionRouteAvailable}>Question text</option><option value="layout">Page layout, cover or instructions</option>
          </select></label>
          {workbookCommentRoute(pages.find(p => p.number === anchor.page), note, requestedRoute === "auto" ? undefined : requestedRoute) === "layout"
            ? <p role="note">{LAYOUT_REVIEW_MESSAGE}</p>
            : question && <button type="button" className="wbr-link" onClick={() => { setExact(!exact); if (!item) setItem(workbookEditItem(question)); }}>Edit myself</button>}
          {exact && workbookCommentRoute(pages.find(p => p.number === anchor.page), note, requestedRoute === "auto" ? undefined : requestedRoute) === "question" && <div className="wbr-exact"><p>The code calculates the answer and worked steps. The solve check checks your words when you send the comments.</p>
            <Fields label="Question fields" data={item} change={setItem} />
            <label>Answer, calculated by code<output>{built?.package?.answer ? valueText(built.package.answer.value) : "Calculated from the question fields"}</output></label>
            {built?.check.status === "failed" && <p role="alert">{commentReason(built.check.reason)}</p>}</div>}
          <div className="wbr-buttons"><button type="submit" className="btn adm-btn" disabled={saving || !note.trim()}>Save comment</button><button type="button" className="wbr-link" onClick={() => setAnchor(null)}>Cancel</button></div>
          <small>Enter to save · Esc to cancel · Shift+Enter for a new line</small>
        </form>}
        {error && <p role="alert">{error}</p>}
        <WorkbookLayoutReview comments={layoutComments} pages={pages.map(p => p.number)} busy={locked || active || saving} apply={layout => post({ layout })} />
        {!detail.comments.length && <p className="wbr-empty">No comments yet.</p>}
        {detail.comments.map((c, i) => <article id={`comment-${c.id}`} key={c.id} className={`wbr-comment ${c.status}`}>
          <button className="wbr-location" onClick={() => setSelected(c.page)}>{i + 1}. {location(c)}</button><span className="wbr-result">{workbookCommentStatus(c, workbookCommentRoute(pages.find(p => p.number === c.page), c.note, c.route))}</span>
          <p>{c.note}</p>{c.item ? <small>Exact fields saved</small> : null}
          {c.resultNote && <p className="wbr-reason">{c.resultNote}</p>}
          {c.error && <p className="wbr-reason">{commentReason(c.error)}</p>}
          {c.status === "stale" && <p>Select a new location to add this comment again.</p>}
          {c.status === "done" && c.route !== "layout" && <details><summary>Before and after</summary><p><b>Before</b><br />{preview(c.before)}</p><p><b>After</b><br />{preview(c.after)}</p></details>}
          {!locked && !working && ["pending", "failed", "stale"].includes(c.status) && <div className="wbr-buttons"><button className="wbr-link" onClick={() => select({ page: c.page, question: c.question, x: c.x, y: c.y, id: c.id }, c)}>Edit comment</button><button className="wbr-link" disabled={saving} onClick={() => post({ delete: true, comment: { id: c.id } })}>Delete</button></div>}
        </article>)}
      </aside>
    </div>
    <details className="wbr-history"><summary>Review history</summary>{history.map((e) => <p key={e.id}>{e.text}</p>)}</details>
  </section>;
}

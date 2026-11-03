"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Workbook } from "@/lib/workbook-content";
import type { WorkbookQuestionRef } from "@/lib/question-package";
import { ADMIN_PATH } from "@/lib/admin-view";
import { MayaReferenceMicrophone } from "@/components/admin-maya-reference";
import "./admin-maya.css";
import "./admin-workbook.css";
import "./admin-maya-workbook.css";

export function MayaWorkbookPicker({ book, images, voice, initialPage, initialQuestion }: {
  book: Workbook; images: Record<string, string>; voice: boolean; initialPage?: number; initialQuestion?: number;
}) {
  const router = useRouter();
  const [pageNumber, setPageNumber] = useState(initialPage ?? book.pages.find(p => p.questions.length)?.number ?? book.pages[0]?.number);
  const [reference, setReference] = useState(initialPage && initialQuestion ? `page ${initialPage}, number ${initialQuestion}` : "");
  const [selected, setSelected] = useState<{ ref: WorkbookQuestionRef; text: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [speechGeneration, setSpeechGeneration] = useState(0);
  const page = book.pages.find(p => p.number === pageNumber);

  async function request(mode: "select" | "text" | "voice", at: { reference: string } | { page: number; question: number }) {
    setSpeechGeneration(value => value + 1);
    setBusy(true);
    setMessage(null);
    setSelected(null);
    try {
      const response = await fetch("/api/admin/maya/workbook", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ childId: book.childId, workbookId: book.id, mode, ...at }) });
      const body = await response.json();
      if (!body.ok) {
        setMessage(body.say ?? (body.error === "voice_unavailable" ? "Voice calls are not set up yet. Use a text session." : "The session could not start. Choose the question again."));
        return;
      }
      if (mode === "select") {
        setSelected({ ref: body.ref, text: body.text });
        setPageNumber(body.ref.page);
      } else router.push(`${ADMIN_PATH}/maya/${body.callId}`);
    } catch { setMessage("The question could not load. Try again."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void request("select", { reference }); }
  const ready = book.status === "printed" || book.status === "shipped";
  return <section className="mc-pick mc-workbook" aria-labelledby="workbook-question-title">
    <h2 id="workbook-question-title">Choose a workbook question</h2>
    <p className="adm-note">Tap a question on the page, or type its page and number. Only printed workbooks from test families can be used.</p>
    {!ready && <p role="status" className="mc-error">This workbook is not printed. Choose a printed workbook.</p>}
    <MayaReferenceMicrophone key={speechGeneration} childId={book.childId} workbookId={book.id} available={voice} disabled={busy || !ready}
      onReference={text => { setReference(text); void request("select", { reference: text }); }} />
    <fieldset disabled={busy || !ready} className="mc-workbook-fields">
      <form onSubmit={submit} className="mc-reference-form">
        <label className="mc-field"><span>Page and number</span>
          <input value={reference} placeholder="page 4, number 3" maxLength={100} onChange={e => { setSpeechGeneration(value => value + 1); setReference(e.target.value); setSelected(null); setMessage(null); }} />
        </label>
        <button className="btn sm adm-btn" type="submit">Find question</button>
      </form>
      <p className="adm-note">Use exactly &quot;page 4, number 3&quot; or &quot;page four number three&quot;. Number words from one to twenty also work.</p>
      <div className="mc-workbook-grid">
        <div>
          <label className="mc-field"><span>Workbook page</span><select value={pageNumber} onChange={e => setPageNumber(Number(e.target.value))}>
            {book.pages.map(p => <option key={p.number} value={p.number}>Page {p.number}{p.dayLabel ? `: ${p.dayLabel}` : ""}</option>)}
          </select></label>
          {page?.image && images[page.image.path] ? <figure className="adm-wb-page" style={{ aspectRatio: `${page.image.width}/${page.image.height}` }}>
            {/* Private signed URL; the image optimizer must not cache it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[page.image.path]} alt={`Workbook ${book.number}, page ${page.number}, as printed`} />
            {page.questions.map(q => <button type="button" key={q.number} className={`adm-wb-box mc-question-box${selected?.ref.page === page.number && selected.ref.question === q.number ? " is-selected" : ""}`}
              aria-label={`Choose page ${page.number}, number ${q.number}`} aria-pressed={selected?.ref.page === page.number && selected.ref.question === q.number}
              style={{ left: `${q.box.x / page.image!.width * 100}%`, top: `${q.box.y / page.image!.height * 100}%`, width: `${q.box.width / page.image!.width * 100}%`, height: `${q.box.height / page.image!.height * 100}%` }}
              onClick={() => { setReference(`page ${page.number}, number ${q.number}`); void request("select", { page: page.number, question: q.number }); }}>{q.number}</button>)}
          </figure> : <p className="adm-empty">No page image is available. Use the page and number above.</p>}
        </div>
        <div className="mc-workbook-choice" aria-live="polite" aria-busy={busy}>
          {busy && <p>Loading question...</p>}
          {message && <p className="mc-error" role="alert">{message}</p>}
          {selected ? <>
            <p className="adm-crumb">Question selected</p>
            <h3>Page {selected.ref.page}, number {selected.ref.question}</h3>
            <p className="mc-q-text">{selected.text}</p>
            <p className="adm-note">Maya will confirm the question before she helps. This session uses Scripted Maya. It uses no child minutes.</p>
            <div className="adm-row">
              <button type="button" className="btn sm adm-btn" onClick={() => request("text", { page: selected.ref.page, question: selected.ref.question })}>Start text session</button>
              <button type="button" className="btn sm ghost adm-btn" disabled={!voice} onClick={() => request("voice", { page: selected.ref.page, question: selected.ref.question })}>Start voice call</button>
            </div>
            {!voice && <p className="adm-note">Voice calls are not set up yet.</p>}
          </> : !busy && !message && <p className="adm-empty">Choose a question to start.</p>}
        </div>
      </div>
    </fieldset>
  </section>;
}

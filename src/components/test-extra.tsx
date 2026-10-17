"use client";

// The optional extra round (#190, spec #181) on the child's test screens, in the split desk (D-088), option A of round
// r190: after the last main question, when an area is an early sign, a message screen like the halfway break asks
// whether the child wants more questions. "Yes" starts the round; "No, thanks" goes on to "Did anyone help?". Each
// question of the round has "Stop here" (test.tsx). When the report offers a skipped or stopped round again, the round
// has its own start screen and end screen.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/ds";
import type { ExtraRoundOffer } from "@/lib/assessment";
import { ReadAloud } from "./test-read-aloud";
import "./test-base.css";
import "./test-parts.css";

/** A round the report offers again (#190): the completed test, the round's size, the answers in so far, and the report. */
export interface ExtraEntry {
  testId: string;
  questions: number;
  /** Round questions already answered: more than 0 when the child stopped part way. */
  answered: number;
  /** The report to go back to; null when unknown (then the account). */
  reportHref: string | null;
}

export interface ExtraOfferProps {
  name: string;
  offer: ExtraRoundOffer;
  /** Sends the choice. Resolves false when it failed and the child can choose again. */
  onChoose: (take: boolean) => Promise<boolean>;
  /** The error line to show, if the last try failed. */
  problem: ReactNode;
}

/** The offer after the last main question: a choice of two, like the halfway break. Any choice is fine. */
export function ExtraOffer({ name, offer, onChoose, problem }: ExtraOfferProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [sending, setSending] = useState<boolean | null>(null);
  const choose = async (take: boolean) => {
    if (sending !== null) return;
    setSending(take);
    // On success the next screen replaces this one; on failure the child can choose again.
    if (!(await onChoose(take))) setSending(null);
  };
  const n = offer.questions;
  const title = `Do you want to try ${n} more question${n === 1 ? "" : "s"}, ${name}?`;
  const lead = "They help us see more clearly what you know. It is fine to skip them.";
  return (
    <section className="test-split test-extra" aria-labelledby="test-extra-title">
      <div className="test-pane test-pane-l is-msg">
        <p className="test-kicker">Main questions done</p>
        <div className="test-qrow">
          <ReadAloud text={`${title} ${lead} Choose yes, or no, thanks.`} />
          <h1 id="test-extra-title" ref={heading} tabIndex={-1} className="test-title">{title}</h1>
        </div>
        <p className="test-lead">{lead}</p>
        {problem}
        <div className="test-btns">
          <Button onClick={() => choose(true)} disabled={sending !== null} aria-busy={sending === true}>{sending === true ? "Starting…" : `Yes, ${n} more`}</Button>
          <Button variant="ghost" onClick={() => choose(false)} disabled={sending !== null} aria-busy={sending === false}>No, thanks</Button>
        </div>
      </div>
      <div className="test-pane test-pane-r test-field" aria-hidden />
    </section>
  );
}

/** The start screen of a round the report offers again, or of one the child stopped part way. */
export function ExtraIntro({ name, entry, busy, onStart, problem }: { name: string; entry: ExtraEntry; busy: boolean; onStart: () => void; problem: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const again = entry.answered > 0;
  return (
    <section className="test-split test-intro" aria-labelledby="test-extra-intro-title">
      <div className="test-pane test-pane-l is-msg">
        <p className="test-kicker">Extra questions</p>
        <h1 id="test-extra-intro-title" ref={heading} tabIndex={-1} className="test-title">
          {again ? `Welcome back, ${name}!` : `Hi ${name}! Here are ${entry.questions} more questions.`}
        </h1>
        <ul className="test-rules">
          <li><b>No calculator.</b> Work the answers out yourself.</li>
          <li><b>No help from a parent.</b> Do the questions on your own. Grown-ups, please let your child work alone.</li>
          <li><b>Scrap paper is fine.</b> Work things out on paper or on the whiteboard, if it helps. We only need your answers.</li>
        </ul>
        <p className="test-intro-note">
          {again ? "Your answers are saved. You go on from the question where you stopped." : "Answer one question at a time. You cannot go back, so check each answer before you press Next."}
        </p>
        {problem}
        <Button onClick={onStart} disabled={busy} aria-busy={busy}>{busy ? "Opening…" : again ? "Continue" : "Start"}</Button>
      </div>
      <div className="test-pane test-pane-r test-field" aria-hidden />
    </section>
  );
}

/**
 * The start screen when the child left part way through a round taken during the test (#190): "Keep going" goes on
 * from the question where the child stopped; "Stop here" goes on to "Did anyone help?". Either choice is fine.
 */
export function ExtraReturn({ name, busy, onGo, onStop, problem }: { name: string; busy: boolean; onGo: () => void; onStop: () => void; problem: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [stopping, setStopping] = useState(false);
  return (
    <section className="test-split test-intro" aria-labelledby="test-extra-return-title">
      <div className="test-pane test-pane-l is-msg">
        <p className="test-kicker">Extra questions</p>
        <h1 id="test-extra-return-title" ref={heading} tabIndex={-1} className="test-title">Welcome back, {name}!</h1>
        <p className="test-lead">You were doing the extra questions. Your answers are saved. You can keep going, or stop here. It is fine to stop.</p>
        {problem}
        <div className="test-btns">
          <Button onClick={() => { setStopping(false); onGo(); }} disabled={busy} aria-busy={busy && !stopping}>{busy && !stopping ? "Opening…" : "Keep going"}</Button>
          <Button variant="ghost" onClick={() => { setStopping(true); onStop(); }} disabled={busy} aria-busy={busy && stopping}>{busy && stopping ? "Stopping…" : "Stop here"}</Button>
        </div>
      </div>
      <div className="test-pane test-pane-r test-field" aria-hidden />
    </section>
  );
}

/**
 * The end of a round the report offered again: the finish builds the report again. `stoppedAfter`: the child pressed
 * Stop here after this many answers; they are saved, and the report offers the rest.
 */
export function ExtraEnd({ name, questions, reportHref, stoppedAfter }: { name: string; questions: number; reportHref: string | null; stoppedAfter?: number }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const stopped = stoppedAfter !== undefined;
  return (
    <section className="test-end test-field" aria-labelledby="test-extra-end-title">
      <div>
        <p className="test-kicker">{stopped ? `${stoppedAfter} of ${questions} done` : `All ${questions} done`}</p>
        <h1 id="test-extra-end-title" ref={heading} tabIndex={-1} className="test-title">Thank you, {name}!</h1>
        <p className="test-lead">{stopped ? "Your answers are saved. You can do the rest another time." : <>Your answers are in. Your grown-up&apos;s report is being updated with them.</>}</p>
        <p className="test-end-link">{reportHref ? <Link href={reportHref}>Back to the report</Link> : <Link href="/account">Back to the account</Link>}</p>
      </div>
    </section>
  );
}

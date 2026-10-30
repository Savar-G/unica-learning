"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { DESK_HOME, type LeaveResult, type QuestionCrop, type TapArea } from "@/lib/desk";
import type { QuestionBoard } from "@/lib/desk-board";
import type { ForgotPinResult } from "@/lib/parent-pin-server";
import { track } from "@/lib/track";
import { AnnounceDesk } from "@/components/desk-guard";
import { Avatar, Icon } from "@/components/desk-icons";
import { OurBoard } from "@/components/our-board";
import "./desk.css";

// The child's desk (#301, D-184), as in the guidance demo video: a slim rail (the desk, the workbooks, progress, and the
// lock that leaves with the parent's PIN), Maya's column (her name, the workbook and day, the limits, the conversation
// and the picked question as a card cut from the printed page), the Chat / Call / Call + board tabs, and the shared
// board. "Pick from my page" opens the page image with a tap area on each question. Chat (#358) and calls (#337) come
// later: their controls are here, turned off, with one plain line that says so. Nothing on the desk shows an answer.

const noSubscribe = () => () => {};

/** A time as "3:05 p.m.", in the device's time zone (after hydration; the server renders nothing). */
function Time({ at }: { at: number }) {
  const text = useSyncExternalStore(noSubscribe, () => new Date(at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }), () => "");
  return <>{text || "a few minutes"}</>;
}

const subscribeMotion = (change: () => void) => {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)");
  q.addEventListener("change", change);
  return () => q.removeEventListener("change", change);
};
/** True when the device asks for less motion: the board then shows the question at once. */
// The server and the first render say false: the board starts to draw after hydration, never shows the end first.
const useStill = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);

// ---------- the desk ----------

export interface DeskBook {
  id: string;
  number: number;
  /** "Sent October 29", or null. */
  sent: string | null;
}

export interface DeskCard {
  number: number;
  /** The question as printed, or null. */
  text: string | null;
  /** The question cut from the page image, or null when the page image cannot be shown. */
  crop: QuestionCrop | null;
  /** The question in columns on the board, or null when the board cannot lay it out. */
  board: QuestionBoard | null;
}

type DeskProps = {
  name: string | null;
  notice?: string | null;
} & (
  | { problem: string; books?: undefined }
  | {
      problem?: undefined;
      books: DeskBook[];
      book: DeskBook;
      page: { number: number; dayLabel: string | null; pages: number[] };
      /** A short-lived link to the page image, or null when it could not be made. */
      image: { url: string; width: number; height: number } | null;
      areas: TapArea[];
      questions: DeskCard[];
      picked: number | null;
      openPicker: boolean;
      fromQr: boolean;
    }
);

const deskHref = (o: { w: string; p?: number; q?: number; pick?: boolean }) => {
  const at = new URLSearchParams({ w: o.w });
  if (o.p !== undefined) at.set("p", String(o.p));
  if (o.q !== undefined) at.set("q", String(o.q));
  if (o.pick) at.set("pick", "1");
  return `${DESK_HOME}?${at}`;
};

export function Desk(props: DeskProps) {
  const ready = props.problem === undefined ? props : null;
  const [picked, setPicked] = useState<number | null>(ready?.picked ?? null);
  const picker = useRef<HTMLDialogElement>(null);
  const books = useRef<HTMLDialogElement>(null);
  const talk = useRef<HTMLDivElement>(null);
  const still = useStill();

  useEffect(() => {
    if (ready?.openPicker) picker.current?.showModal();
    // Only on arrival: a later render never opens it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new card goes to the end of the conversation: show it there (the column scrolls on a laptop or tablet only).
  useEffect(() => {
    if (picked !== null && talk.current) talk.current.scrollTop = talk.current.scrollHeight;
  }, [picked]);

  const card = ready?.questions.find((q) => q.number === picked) ?? null;
  const where = ready ? `Workbook ${ready.book.number} · ${ready.page.dayLabel ?? `Page ${ready.page.number}`}` : null;

  const pick = (n: number) => {
    if (!ready) return;
    setPicked(n);
    picker.current?.close();
    // The address keeps the question, so a reload shows the same card; "pick" and "from" are spent.
    window.history.replaceState(null, "", deskHref({ w: ready.book.id, p: ready.page.number, q: n }));
  };

  const greeting = `Hi${props.name ? ` ${props.name}` : ""}! Which question are you on? Pick it from your page.`;

  return (
    <div className="look-root desk-root" data-look="warm">
      <AnnounceDesk />
      <header className="desk-top">
        <p className="desk-title"><Avatar size={24} /><span className="desk-title-name">{props.name ? `${props.name}'s desk` : "Your desk"}</span><span className="desk-brand">Unica<b /></span></p>
        <button type="button" className="desk-sound" disabled><Icon name="sound" size={18} />Sound on</button>
      </header>

      <nav className="desk-rail" aria-label="Desk">
        <span className="desk-rail-item" aria-current="page"><Icon name="home" /><span>Desk</span></span>
        <button type="button" className="desk-rail-item" onClick={() => books.current?.showModal()} disabled={!ready}><Icon name="book" /><span>Workbooks</span></button>
        <button type="button" className="desk-rail-item" disabled title="Coming soon"><Icon name="chart" /><span>Progress</span></button>
        <LeaveDesk />
      </nav>

      <main id="main" className="desk-body">
      <section className="desk-maya" aria-label="Maya">
        <header className="desk-maya-head">
          <Avatar size={48} />
          <div className="desk-who"><h1>Maya</h1>{where && <p>{where}</p>}</div>
          <dl className="desk-limits" aria-label="Help from Maya">
            <div><dt><Icon name="phone" size={14} />Calls</dt><dd>30 min a week</dd></div>
            <div><dt><Icon name="chat" size={14} />Chat</dt><dd>60 messages a day</dd></div>
          </dl>
        </header>

        <div ref={talk} className="desk-talk" aria-live="polite">
          {props.notice && <p className="desk-event warn">{props.notice}</p>}
          {ready?.fromQr && <p className="desk-event"><Icon name="qr" size={15} />Opened from Workbook {ready.book.number} · QR code</p>}
          {props.problem ? (
            <p className="desk-bubble">{props.problem}</p>
          ) : (
            <p className="desk-bubble">{greeting}</p>
          )}
          {card && ready && <QuestionCard card={card} where={where!} image={ready.image} />}
        </div>

        <footer className="desk-say">
          {ready && (
            <button type="button" className="desk-pick" onClick={() => picker.current?.showModal()}>
              <Icon name="page" />{card ? "Pick another question" : "Pick from my page"}
            </button>
          )}
          <p className="desk-soon">Chat and calls with Maya start soon.</p>
          <div className="desk-compose">
            <input type="text" disabled placeholder="Write to Maya" aria-label="Write to Maya" />
            <button type="button" disabled aria-label="Send"><Icon name="send" size={20} /></button>
          </div>
        </footer>
      </section>

      <div className="desk-main">
        <div className="desk-modes" role="group" aria-label="How Maya helps">
          <button type="button" disabled><Icon name="chat" size={18} />Chat</button>
          <button type="button" disabled><Icon name="phone" size={18} />Call</button>
          <button type="button" disabled aria-pressed="true"><Icon name="board" size={18} />Call + board</button>
        </div>

        <OurBoard
          key={`${ready?.book.id ?? "none"}:${ready?.page.number ?? 0}:${card?.number ?? "none"}`}
          question={card?.board ?? null}
          at={{ book: ready?.book.id ?? "none", page: ready?.page.number ?? 0, question: card?.number ?? null }}
          still={still}
          label={card ? `Question ${card.number}${card.text ? `: ${card.text}` : ""}, written in columns` : "Our board"}
          caption={!card ? "Pick a question from your page. It shows here."
            : card.board ? `Number ${card.number}, from your page.` : `Number ${card.number} is on your card.`}
        />
      </div>
      </main>

      {ready && (
        <>
          <dialog ref={picker} className="desk-sheet-dialog" aria-labelledby="desk-picker-title">
            <header>
              <div>
                <h2 id="desk-picker-title">Pick from my page</h2>
                <p>Workbook {ready.book.number} · Page {ready.page.number} of {ready.page.pages.length}{ready.page.dayLabel ? ` · ${ready.page.dayLabel}` : ""}</p>
              </div>
              <button type="button" className="desk-x" onClick={() => picker.current?.close()} aria-label="Close"><Icon name="close" /></button>
            </header>
            <PagePicker ready={ready} picked={picked} onPick={pick} />
          </dialog>
          <dialog ref={books} className="desk-books-dialog" aria-labelledby="desk-books-title">
            <header>
              <h2 id="desk-books-title">My workbooks</h2>
              <button type="button" className="desk-x" onClick={() => books.current?.close()} aria-label="Close"><Icon name="close" /></button>
            </header>
            <ul>
              {ready.books.map((b) => (
                <li key={b.id}>
                  <Link
                    className="desk-cover"
                    href={deskHref({ w: b.id, pick: true })}
                    aria-current={b.id === ready.book.id ? "page" : undefined}
                    // The open workbook: no new page, so the desk would not start again. Go straight to its page.
                    onClick={(e) => {
                      if (b.id !== ready.book.id) return;
                      e.preventDefault();
                      books.current?.close();
                      picker.current?.showModal();
                    }}
                  >
                    <b>Workbook {b.number}</b>{b.sent && <span>{b.sent}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </dialog>
        </>
      )}
    </div>
  );
}

/** The picked question as a card: its number, the workbook and day, and the question cut from the printed page. */
function QuestionCard({ card, where, image }: { card: DeskCard; where: string; image: { url: string } | null }) {
  const { crop } = card;
  return (
    <figure className="desk-card">
      <figcaption><b>{card.number}</b><span>{where}</span></figcaption>
      {crop && image ? (
        <div className="desk-crop" style={{ aspectRatio: `${crop.box.width} / ${crop.box.height}` }}>
          {/* A private, short-lived link: the image cannot go through the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={card.text ? `Question ${card.number}: ${card.text}` : `Question ${card.number} on your page`}
            style={{ width: `${crop.imageWidth}%`, left: `${crop.left}%`, top: `${crop.top}%` }} />
        </div>
      ) : (
        <p className="desk-card-text">{card.text ?? `Question ${card.number}`}</p>
      )}
    </figure>
  );
}

/** The page image with a tap area on each question, and the arrows to the pages before and after. */
function PagePicker({ ready, picked, onPick }: {
  ready: Extract<DeskProps, { problem?: undefined }>;
  picked: number | null;
  onPick: (n: number) => void;
}) {
  const { page, image, areas, book } = ready;
  const at = page.pages.indexOf(page.number);
  const prev = page.pages[at - 1];
  const next = page.pages[at + 1];
  const title = `Page ${page.number}${page.dayLabel ? ` · ${page.dayLabel}` : ""}`;
  return (
    <div className="desk-picker">
      {image ? (
        <div className="desk-stage">
          <div className="desk-sheet" style={{ "--w": image.width, "--h": image.height } as CSSProperties}>
            {/* A private, short-lived link: the image cannot go through the image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={`${title} of the workbook`} width={image.width} height={image.height} />
            {areas.map((a) => (
              <button
                key={a.question}
                type="button"
                className="desk-area"
                style={{ left: `${a.left}%`, top: `${a.top}%`, width: `${a.width}%`, height: `${a.height}%` }}
                aria-pressed={picked === a.question}
                aria-label={`Question ${a.question}`}
                onClick={() => onPick(a.question)}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="desk-missing">This page cannot be shown right now. Try again in a moment.</p>
      )}
      <nav className="desk-pagebar" aria-label="Pages">
        {prev === undefined ? <span /> : <Link className="prev" href={deskHref({ w: book.id, p: prev, pick: true })}>← Page {prev}</Link>}
        <p>{image && areas.length ? "Tap the question you are on." : image ? "This page has no questions." : ""}</p>
        {next === undefined ? <span /> : <Link className="next" href={deskHref({ w: book.id, p: next, pick: true })}>Page {next} →</Link>}
      </nav>
    </div>
  );
}

/** "Leave": a grown-up enters the PIN, checked on the server; then the account page opens. */
export function LeaveDesk() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const open = () => {
    setPin("");
    setError(null);
    dialog.current?.showModal();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter the 4 digits of the PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    let answer: LeaveResult;
    try {
      const res = await fetch("/api/desk/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      answer = (await res.json()) as LeaveResult;
    } catch {
      answer = { ok: false, error: "unavailable" };
    }
    if (answer.ok) {
      track("desk_left");
      router.replace("/account");
      router.refresh();
      return;
    }
    setBusy(false);
    setPin("");
    switch (answer.error) {
      case "wrong":
        setError(`That is not the PIN. ${answer.attemptsLeft} ${answer.attemptsLeft === 1 ? "try" : "tries"} left.`);
        break;
      case "locked":
        setError(<>Too many wrong tries. Try again after <Time at={answer.retryAt} />.</>);
        break;
      case "not_set":
        setError(<>No PIN is set. <Link href="/tutor/forgot-pin">Set a new PIN</Link> with your account password.</>);
        break;
      case "signed_out":
        setError(<>The account is signed out. <Link href="/sign-in">Sign in</Link> again.</>);
        break;
      default:
        setError("We cannot check the PIN right now. Try again in a moment.");
    }
  };

  return (
    <>
      <button type="button" className="desk-rail-item desk-lock" onClick={open} aria-label="Leave the desk"><Icon name="lock" /><span>Leave</span></button>
      <dialog ref={dialog} className="desk-leave" aria-labelledby="desk-leave-title" onClose={() => setBusy(false)}>
        <form onSubmit={submit} noValidate>
          <h2 id="desk-leave-title">Leave the desk</h2>
          <p>A grown-up enters the 4-digit PIN.</p>
          <label htmlFor="desk-pin" className="desk-label">PIN</label>
          <input
            id="desk-pin" className="desk-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-invalid={!!error} aria-describedby={error ? "desk-pin-error" : undefined}
          />
          {error && <p className="desk-error" id="desk-pin-error" role="alert">{error}</p>}
          <div className="desk-dialog-btns">
            <button type="submit" className="btn" disabled={busy}>{busy ? "Checking…" : "Leave the desk"}</button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>Stay</button>
          </div>
          <Link className="desk-forgot" href="/tutor/forgot-pin">Forgot the PIN?</Link>
        </form>
      </dialog>
    </>
  );
}

/**
 * Forgot PIN: the account password and a new PIN, sent together. The server checks the password (with a limit on
 * tries), saves the new PIN and closes the desk.
 */
export function ForgotPinForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!password || !/^\d{4}$/.test(pin)) {
      setError("Enter your account password and a new PIN of exactly 4 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    let answer: ForgotPinResult;
    try {
      const res = await fetch("/api/desk/forgot-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, pin }) });
      answer = (await res.json()) as ForgotPinResult;
    } catch {
      answer = { ok: false, error: "unavailable" };
    }
    if (answer.ok) {
      track("pin_reset");
      router.replace("/account?pin=1");
      router.refresh();
      return;
    }
    setBusy(false);
    setPassword("");
    switch (answer.error) {
      case "wrong_password":
        setError(`That password is not right. ${answer.attemptsLeft} ${answer.attemptsLeft === 1 ? "try" : "tries"} left.`);
        break;
      case "locked":
        setError(<>Too many wrong tries. Try again after <Time at={answer.retryAt} />.</>);
        break;
      case "invalid":
        setError("Enter your account password and a new PIN of exactly 4 digits.");
        break;
      case "not_set":
        setError("No PIN is set, so there is nothing to reset.");
        break;
      case "signed_out":
        setError(<>The account is signed out. <Link href="/sign-in">Sign in</Link> again.</>);
        break;
      default:
        setError("We cannot save a new PIN right now. Wait a few minutes, then try again.");
    }
  };

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      <div className={`fld${error ? " bad" : ""}`}>
        <label htmlFor="forgot-password">Your account password</label>
        <input id="forgot-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="fld">
        <label htmlFor="forgot-pin">New PIN</label>
        <input id="forgot-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <span className="hint">4 digits.</span>
      </div>
      {error && <p className="acct-alert" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save the PIN and leave the desk"}</button>
    </form>
  );
}

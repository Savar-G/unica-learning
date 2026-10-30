import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { DESK_COOKIE, DESK_HOME, deskView, readLock, tapAreas } from "@/lib/desk";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { WORKBOOK_FILES_BUCKET, type WorkbookSummary } from "@/lib/workbook-content";
import { workbookStore } from "@/lib/workbook-store";
import { DeskBoard, LeaveDesk } from "@/components/desk";

export const metadata = pageMetadata({
  path: DESK_HOME,
  title: "Your desk",
  description: "Your workbook, with help from Maya.",
  index: false,
});

/** How long the link to a page image works. A new page view makes a new one. */
const PAGE_URL_SECONDS = 15 * 60;

const deskHref = (workbookId: string, page?: number) => `${DESK_HOME}?w=${workbookId}${page === undefined ? "" : `&p=${page}`}`;
const sentOn = (w: WorkbookSummary) =>
  w.shippedAt ? `Sent ${new Date(w.shippedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", timeZone: "America/Vancouver" })}` : "Workbook";

// The child's desk (#301): open on this device for one child (the desk cookie, src/lib/desk.ts), read with the
// parent's own session, so row-level security gives only the family's shipped workbooks and their page images. `w`
// picks a workbook, `p` a page. Without an open desk, the parent opens one from the account page.
export default async function Desk({ searchParams }: PageProps<"/tutor">) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${DESK_HOME}`);
  const lock = readLock((await cookies()).get(DESK_COOKIE)?.value);
  if (!lock || lock.parentId !== parent) redirect("/account");

  const { w, p } = await searchParams;
  const [{ data: child }, view] = await Promise.all([
    db.from("children").select("id, first_name").eq("id", lock.childId).maybeSingle(),
    deskView(workbookStore(db), {
      parentId: parent, childId: lock.childId,
      workbookId: typeof w === "string" ? w : undefined,
      page: typeof p === "string" && /^\d{1,4}$/.test(p) ? Number(p) : undefined,
    }),
  ]);
  const name = child?.first_name ?? "there";

  const top = (books: WorkbookSummary[], open: string | null) => (
    <header className="desk-top">
      <span className="logo">Unica Learning<b /></span>
      <nav className="desk-books" aria-label="Your workbooks">
        {books.map((b) => (
          <Link key={b.id} className="desk-cover" href={deskHref(b.id)} aria-current={b.id === open ? "page" : undefined}>
            <b>Workbook {b.number}</b><span>{sentOn(b)}</span>
          </Link>
        ))}
      </nav>
      <LeaveDesk />
    </header>
  );

  if (!child || view.status === "no-workbook") {
    return (
      <div className="look-root desk-root" data-look="warm">
        {top([], null)}
        <main id="main" className="desk-main">
          <section className="desk-pane desk-pane-page"><div className="desk-stage">
            <p className="desk-missing">There is no workbook here yet. When {child ? `${name}'s` : "your"} workbook arrives, its pages show here.</p>
          </div></section>
          <section className="desk-pane desk-pane-maya" aria-label="Maya">
            <p className="desk-kicker">Maya · Unica Teaching Assistant</p>
            <h1 className="desk-hello">Hi, {name}.</h1>
            <div className="desk-soon"><h2>Maya is coming soon.</h2><p>Soon you can ask Maya for help with a question in your workbook.</p></div>
          </section>
        </main>
      </div>
    );
  }

  const { workbook, page, pages } = view;
  let image: { url: string; width: number; height: number } | null = null;
  if (page.image) {
    const { data, error } = await db.storage.from(WORKBOOK_FILES_BUCKET).createSignedUrl(page.image.path, PAGE_URL_SECONDS);
    if (error) console.error("[desk] page image link failed", error.message);
    if (data) image = { url: data.signedUrl, width: page.image.width, height: page.image.height };
  }
  const at = pages.indexOf(page.number);
  const prev = pages[at - 1];
  const next = pages[at + 1];
  const pageNav = (
    <nav className="desk-pagebar" aria-label="Pages">
      {prev === undefined ? <span /> : <Link className="prev" href={deskHref(workbook.id, prev)}>← Page {prev}</Link>}
      <h2>Page {page.number} of {pages.length}{page.dayLabel ? ` · ${page.dayLabel}` : ""}</h2>
      {next === undefined ? <span /> : <Link className="next" href={deskHref(workbook.id, next)}>Page {next} →</Link>}
    </nav>
  );
  return (
    <div className="look-root desk-root" data-look="warm">
      {top(view.workbooks, workbook.id)}
      {view.notice === "not-this-child" && (
        <p role="status" className="desk-notice">That workbook is not on {name}&apos;s desk, so {name}&apos;s newest workbook is open.</p>
      )}
      <DeskBoard
        key={`${workbook.id}-${page.number}`}
        name={name}
        pageNumber={page.number}
        dayLabel={page.dayLabel}
        image={image}
        areas={tapAreas(page)}
        questions={page.questions.map((q) => ({ number: q.number, text: q.text }))}
        pageNav={pageNav}
      />
    </div>
  );
}

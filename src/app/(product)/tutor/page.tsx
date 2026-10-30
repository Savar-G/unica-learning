import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { DESK_COOKIE, DESK_HOME, deskView, questionCrop, readLock, tapAreas, type DeskView } from "@/lib/desk";
import { questionBoard } from "@/lib/desk-board";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { WORKBOOK_FILES_BUCKET, type WorkbookSummary } from "@/lib/workbook-content";
import { workbookStore } from "@/lib/workbook-store";
import { Desk, type DeskBook } from "@/components/desk";

export const metadata = pageMetadata({
  path: DESK_HOME,
  title: "Your desk",
  description: "Your workbook, with help from Maya.",
  index: false,
});

/** How long the link to a page image works. A new page view makes a new one. */
const PAGE_URL_SECONDS = 15 * 60;

const sentOn = (w: WorkbookSummary) =>
  w.shippedAt ? `Sent ${new Date(w.shippedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", timeZone: "America/Vancouver" })}` : null;
const book = (w: WorkbookSummary): DeskBook => ({ id: w.id, number: w.number, sent: sentOn(w) });
const whole = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : undefined);

// The child's desk (#301, D-184): open on this device for one child (the desk cookie, src/lib/desk.ts), read with the
// parent's own session, so row-level security gives only the family's shipped workbooks and their page images. `w`
// picks a workbook, `p` a page, `q` the question; `pick=1` opens "Pick from my page", `from=qr` says a page QR code
// opened it. Without an open desk, the parent opens one from the account page.
export default async function DeskPage({ searchParams }: PageProps<"/tutor">) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${DESK_HOME}`);
  const lock = readLock((await cookies()).get(DESK_COOKIE)?.value);
  if (!lock || lock.parentId !== parent) redirect("/account");

  const { w, p, q, pick, from } = await searchParams;
  const [{ data: child }, view] = await Promise.all([
    db.from("children").select("id, first_name").eq("id", lock.childId).maybeSingle(),
    // A failed read still shows the desk, with Leave, and says the workbook cannot be shown.
    deskView(workbookStore(db), {
      parentId: parent, childId: lock.childId, workbookId: typeof w === "string" ? w : undefined, page: whole(p), question: whole(q),
    }).catch((error: unknown): DeskView | null => {
      console.error("[desk] workbook load failed", error instanceof Error ? error.message : error);
      return null;
    }),
  ]);
  const name = child?.first_name ?? null;

  if (!child || !view || view.status === "no-workbook") {
    return (
      <Desk
        name={name}
        problem={view ? `There is no workbook here yet. When ${name ? `${name}'s` : "your"} workbook arrives, its pages show here.`
          : "Your workbook cannot be shown right now. Try again in a moment."}
      />
    );
  }

  const { workbook, page, pages } = view;
  let image: { url: string; width: number; height: number } | null = null;
  if (page.image) {
    const { data, error } = await db.storage.from(WORKBOOK_FILES_BUCKET).createSignedUrl(page.image.path, PAGE_URL_SECONDS);
    if (error) console.error("[desk] page image link failed", error.message);
    if (data) image = { url: data.signedUrl, width: page.image.width, height: page.image.height };
  }
  return (
    <Desk
      // A new workbook or page starts the desk again, with the question asked for.
      key={`${workbook.id}-${page.number}`}
      name={name}
      notice={view.notice === "not-this-child" ? `That workbook is not on ${name}'s desk, so ${name}'s newest workbook is open.` : null}
      books={view.workbooks.map(book)}
      book={book(workbook)}
      page={{ number: page.number, dayLabel: page.dayLabel, pages }}
      image={image}
      areas={tapAreas(page)}
      questions={page.questions.map((x) => ({
        number: x.number,
        text: x.text,
        crop: image ? questionCrop(page, x.number) : null,
        board: questionBoard(x.columns),
      }))}
      picked={view.picked}
      openPicker={pick === "1" || from === "qr"}
      fromQr={from === "qr"}
    />
  );
}

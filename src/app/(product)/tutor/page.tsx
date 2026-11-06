import { loadFamilyProvince } from "@/lib/family-time-server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { DESK_COOKIE, DESK_HOME, deskView, questionCrop, readLock, tapAreas, type DeskView } from "@/lib/desk";
import { formatInZone, familyZone, type FamilyZone } from "@/lib/family-time";
import { questionBoard } from "@/lib/desk-board";
import { heldSentences } from "@/lib/maya";
import { deskChat } from "@/lib/maya-chat-server";
import { MAYA_NOTICE_DESK_LINE } from "@/lib/maya-notice";
import { mayaNoticeDue } from "@/lib/maya-notice-server";
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

const sentOn = (w: WorkbookSummary, timeZone: FamilyZone) =>
  w.shippedAt ? `Sent ${formatInZone(w.shippedAt, timeZone, { month: "long", day: "numeric" })}` : null;
const book = (w: WorkbookSummary, timeZone: FamilyZone): DeskBook => ({ id: w.id, number: w.number, sent: sentOn(w, timeZone) });
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
  const [{ data: child }, { data: family }, view] = await Promise.all([
    db.from("children").select("id, first_name, grade, province").eq("id", lock.childId).maybeSingle(),
    db.from("parents").select("postal, time_zone").maybeSingle(),
    // A failed read still shows the desk, with Leave, and says the workbook cannot be shown.
    deskView(workbookStore(db), {
      parentId: parent, childId: lock.childId, workbookId: typeof w === "string" ? w : undefined, page: whole(p), question: whole(q),
    }).catch((error: unknown): DeskView | null => {
      console.error("[desk] workbook load failed", error instanceof Error ? error.message : error);
      return null;
    }),
  ]);
  const name = child?.first_name ?? null;
  const province = await loadFamilyProvince(db, parent);
  const timeZone = familyZone({ timeZone: family?.time_zone, postal: family?.postal, province });

  // Without a parent's agreement (#529), the desk shows chat as off and says who can turn it on.
  const noticeDue = child ? await mayaNoticeDue(parent, child.grade) : false;
  const chat = child && !noticeDue ? await deskChat(db, parent, child, timeZone) : { usage: null, note: null };

  if (!child || !view || view.status === "no-workbook") {
    return (
      <Desk
        name={name}
        childId={lock.childId}
        chatNote={chat.note}
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
      childId={lock.childId}
      chatUsage={chat.usage}
      chatNote={chat.note}
      noticeLine={noticeDue ? MAYA_NOTICE_DESK_LINE : null}
      notice={view.notice === "not-this-child" ? `That workbook is not on ${name}'s desk, so ${name}'s newest workbook is open.` : null}
      books={view.workbooks.map((w) => book(w, timeZone))}
      book={book(workbook, timeZone)}
      page={{ number: page.number, dayLabel: page.dayLabel, pages }}
      image={image}
      areas={tapAreas(page)}
      questions={page.questions.map((x) => ({
        number: x.number,
        text: x.text,
        crop: image ? questionCrop(page, x.number) : null,
        board: questionBoard(x.columns),
        held: x.held ? heldSentences(true) : null,
      }))}
      picked={view.picked}
      openPicker={pick === "1" || from === "qr"}
      fromQr={from === "qr"}
    />
  );
}

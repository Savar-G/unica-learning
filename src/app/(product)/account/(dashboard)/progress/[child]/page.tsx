import { notFound, redirect } from "next/navigation";
import { SkillMap } from "@/components/parent-skill-map";
import { SupportPage } from "@/components/support-page";
import { gradeLabel } from "@/lib/assessment/grades";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { readProgress } from "@/lib/parent-view";
import { signedInParentView } from "@/lib/parent-view-server";
import { unreliableAreasText } from "@/lib/report-view";
import { STATE_ORDER, STATE_WORD } from "@/lib/skill-state-words";
import "@/components/parent-progress.css";

export const metadata = pageMetadata({ path: "/account/progress", title: "Progress", description: "Your child's progress.", index: false });

// The Progress tab (#561, spec #544, D-244): the skill map by reported area, and a panel on the selected skill. Only for
// families the dashboard is open to, and only with the switch for #194 on (PROGRESS_TAB_ENABLED); every other family gets
// the 404. The progress line, pages, marks, repeated mistakes and Maya calls come with #565. What we've learned shows only
// facts code counted, and before marks there are none, so the section does not appear.

/** The signed-in parent's child's Progress tab; a redirect or the 404 when there is none to show. */
async function load(childId: string) {
  const reader = await signedInParentView();
  if (!reader) redirect("/sign-in");
  if (!(await parentDashboard())) notFound();
  return (await readProgress(reader, childId, Date.now())) ?? notFound();
}

export default async function Progress({ params }: PageProps<"/account/progress/[child]">) {
  const { child, level, workbookNumber, areas } = await load((await params).child);
  const name = child.firstName;
  return (
    <SupportPage label="Progress" title={`${name}'s progress`} wide>
      {level?.unreliable && <p className="pp-note">{unreliableAreasText(name)}</p>}
      {areas.length === 0 ? (
        <p className="pp-empty">{name}&apos;s skill map appears once a test report is ready.</p>
      ) : (
        <section className="pp-card" aria-labelledby="pp-map">
          <h2 id="pp-map">Skill map</h2>
          <p className="pp-intro">
            {level
              ? <>BC {gradeLabel(level.working)} math skills, the level {name} works at.{level.earlySign ? " This level is an Early sign, so it may change." : ""}</>
              : <>The math skills in Workbook {workbookNumber}.</>}
            {" "}Select a skill to see why it has its state.
          </p>
          <ul className="pp-legend" aria-label="What the states mean">
            {STATE_ORDER.map((s) => <li key={s} className={`pp-chip is-${s}`}>{STATE_WORD[s]}</li>)}
          </ul>
          <SkillMap areas={areas} workingLevel={level?.working ?? null} />
        </section>
      )}
    </SupportPage>
  );
}

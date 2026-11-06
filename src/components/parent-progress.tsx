import type { ReactNode } from "react";
import { SkillMap } from "@/components/parent-skill-map";
import { SupportPage } from "@/components/support-page";
import { gradeLabel } from "@/lib/assessment/grades";
import { unreliableAreasText } from "@/lib/report-view";
import { STATE_ORDER, STATE_WORD } from "@/lib/skill-state-words";
import type { ProgressView } from "@/lib/parent-view";
import "./parent-progress.css";

export function ParentProgress({ child, level, workbookNumber, areas, panel }: ProgressView & { panel?: ReactNode }) {
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
      {panel}
    </SupportPage>
  );
}

// Question banks by grade band. A test draws only from its band's bank.
// Layout: one folder per band (grades-1-2/, then grades-3-5/ for #75 and grades-6-7/ for #76), one file per level.
import { bandFor, type GradeBandId } from "../constants";
import type { Grade, Template } from "../types";
import { GRADE_1_2_BANK } from "./grades-1-2";
import { GRADE_3_5_BANK } from "./grades-3-5";
import { GRADE_6_7_BANK } from "./grades-6-7";

export { GRADE_1_2_BANK };

export const BANKS: Record<GradeBandId, readonly Template[]> = {
  "1-2": GRADE_1_2_BANK,
  "3-5": GRADE_3_5_BANK,
  "6-7": GRADE_6_7_BANK,
};

/** The bank a test for this school grade draws from. */
export const bankFor = (grade: Grade): readonly Template[] => BANKS[bandFor(grade).id];

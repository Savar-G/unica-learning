"use client";

import { createContext, useContext, useState } from "react";

// The lesson's paper choice (#1151, the r1137 board-led layout). The desk holds it and shows the one "Use paper" toggle
// on the current question, so a call, a chat or a new layout never resets it, and the board's checked move follows it.
// Outside a desk (a board alone) the checked move keeps its own choice and its own toggle.
type Paper = { paper: boolean; setPaper: (paper: boolean) => void };
export const PaperContext = createContext<Paper | null>(null);

/** The paper choice, and whether the desk holds it (then the desk shows the toggle). */
export function useLessonPaper(): Paper & { shared: boolean } {
  const shared = useContext(PaperContext);
  const [paper, setPaper] = useState(false);
  return shared ? { ...shared, shared: true } : { paper, setPaper, shared: false };
}

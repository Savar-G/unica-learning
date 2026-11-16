import type { Box, PrintedRegion } from "@/lib/workbook-print-contract";
import { explanationOutput, type Explanation } from "@/lib/parent-problem-explanation-contract";

export type ResultKind = "right" | "review" | "team" | "pending" | "unscored";
export interface ResultsQuestion {
  itemId: string;
  number: number;
  version: number;
  kind: ResultKind;
  readAnswer: string | null;
  questionText: string | null;
  correctAnswer: string | null;
  explainable: boolean;
  evidencePhoto: string | null;
  evidenceImage?: ResultsPhoto | null;
  regions: Box[];
  questionBox: Box | null;
}
export interface ResultsPhoto {
  src: string;
  width: number;
  height: number;
  aligned: boolean;
}
export interface ScanResultsPageData {
  child: string;
  day: string | null;
  page: number | null;
  photo: ResultsPhoto | null;
  questions: ResultsQuestion[];
  budgetHeld: boolean;
  unfinished: boolean;
}

export function normalizedBox(box: Box, image: { width: number; height: number }): Box | null {
  if (![box.x, box.y, box.width, box.height, image.width, image.height].every(Number.isFinite)
    || image.width <= 0 || image.height <= 0 || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
    || box.x + box.width > image.width + 0.01 || box.y + box.height > image.height + 0.01) return null;
  return { x: box.x / image.width, y: box.y / image.height,
    width: Math.min(box.width / image.width, 1 - box.x / image.width), height: Math.min(box.height / image.height, 1 - box.y / image.height) };
}

export function answerBoxes(regions: PrintedRegion[] | null, image: { width: number; height: number }): Box[] {
  return (regions ?? []).filter(region => region.kind !== "work").flatMap(region => {
    const box = region.box && normalizedBox(region.box, image);
    return box ? [box] : [];
  });
}

export function questionCrop(question: Pick<ResultsQuestion, "regions" | "questionBox">): Box | null {
  const boxes = [...question.regions, ...(question.questionBox ? [question.questionBox] : [])];
  if (!boxes.length) return null;
  const left = Math.max(0, Math.min(...boxes.map(box => box.x)) - 0.035);
  const top = Math.max(0, Math.min(...boxes.map(box => box.y)) - 0.035);
  const right = Math.min(1, Math.max(...boxes.map(box => box.x + box.width)) + 0.035);
  const bottom = Math.min(1, Math.max(...boxes.map(box => box.y + box.height)) + 0.035);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function boxInCrop(box: Box, crop: Box): Box {
  return { x: (box.x - crop.x) / crop.width, y: (box.y - crop.y) / crop.height,
    width: box.width / crop.width, height: box.height / crop.height };
}

export function reviewLine(questions: ResultsQuestion[]): string {
  const numbers = questions.filter(question => question.kind === "review").map(question => question.number);
  if (!numbers.length) return "No answers to go over right now.";
  const list = numbers.length < 2 ? `${numbers[0]}` : `${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
  return `${numbers.length} to go over: ${numbers.length === 1 ? "question" : "questions"} ${list}`;
}

export type ExplanationStatus = "loading" | "ready" | "busy" | "retry" | "cap" | "stale" | "unavailable" | "closed";
export interface QuestionExplanation { status: ExplanationStatus; explanation?: Explanation }

export function resultsExplanationResponse(data: unknown, status: number, expectedAnswer: string | null): QuestionExplanation {
  if (!data || typeof data !== "object" || !("status" in data)) return { status: "retry" };
  if (data.status === "plan_closed") return { status: "closed" };
  if (status === 404 || status === 409 || data.status === "refused") return { status: "stale" };
  if (status < 200 || status >= 300) return { status: "retry" };
  if (data.status === "ready" && "explanation" in data && "correctAnswer" in data && data.correctAnswer === expectedAnswer) {
    const explanation = explanationOutput(data.explanation);
    return explanation ? { status: "ready", explanation } : { status: "retry" };
  }
  if (data.status === "busy" || data.status === "retry" || data.status === "cap" || data.status === "unavailable") return { status: data.status };
  return { status: "retry" };
}

export interface TogetherState {
  screen: "results" | "together" | "done";
  index: number;
  mode: "step" | "all";
  whole: boolean;
  revealed: Record<string, number>;
}
export const initialTogetherState: TogetherState = { screen: "results", index: 0, mode: "step", whole: false, revealed: {} };
export type TogetherAction = { type: "open"; index: number } | { type: "next"; total: number } | { type: "previous" }
  | { type: "reveal"; itemId: string; total: number } | { type: "mode"; mode: "step" | "all" } | { type: "whole" } | { type: "results" };
export function togetherState(state: TogetherState, action: TogetherAction): TogetherState {
  switch (action.type) {
    case "open": return { ...state, screen: "together", index: action.index, whole: false };
    case "next": return state.index + 1 < action.total ? { ...state, index: state.index + 1, whole: false } : { ...state, screen: "done" };
    case "previous": return { ...state, index: Math.max(0, state.index - 1), whole: false };
    case "reveal": return { ...state, revealed: { ...state.revealed, [action.itemId]: Math.min(action.total, (state.revealed[action.itemId] ?? 0) + 1) } };
    case "mode": return { ...state, mode: action.mode };
    case "whole": return { ...state, whole: !state.whole };
    case "results": return { ...state, screen: "results", whole: false };
  }
}

import { ADDITIONAL_CHILD_PRICE, cad } from "@/lib/site";

/** Savar approved these 22 texts on 2026-11-09: "Approve with ur 2 changes". */
export const familyPlanWords = {
  siblingStop: `This child is a sibling. Their price (CAD ${cad(ADDITIONAL_CHILD_PRICE)}) can start once the sibling update ships.`,
  adminAction: "Workbook delivered: start plan",
  adminConfirm: (child: string) => `Has ${child}'s first workbook arrived at their home?`,
  existingWindow: "The family's existing free window applies.",
  immediateCharge: "If it has ended, Stripe charges the monthly price now.",
  monthly: (price: number) => `CAD ${cad(price)} a month.`,
  firstCharge: (date: string) => `First charge: ${date}.`,
  emailUnconfirmed: "We could not confirm the plan start email.",
  reportButton: "Start plan",
  reportHeading: (child: string) => `Start ${child}'s plan`,
  arrivalHeading: "The plan starts when it arrives",
  whenReady: "Start the plan when you are ready.",
  arrival: "Your plan starts when the first workbook arrives at your home.",
  freeMonth: "Your family gets one free month. It starts when your first workbook arrives.",
  insideWindow: "A child who starts during that window is free until it ends.",
  afterWindow: "A child who starts after that window is charged when their plan starts.",
  ceiling: (price: number) => `We charge no more than CAD ${cad(price)} each month until you cancel.`,
  siblingPrice: `Each child after the first is CAD ${cad(ADDITIONAL_CHILD_PRICE)} a month.`,
  cancel: "Cancel in your account before a child's first charge and you pay nothing for that child.",
  emailSubject: (child: string) => `Welcome to Unica Learning: ${child}'s plan`,
  planStarted: (child: string) => `${child}'s plan has started.`,
  emailPreview: "Your plan has started.",
} as const;

export interface FamilyPlanOffer {
  monthly: number;
  window: "new" | "open" | "ended" | "unknown";
}

/** Use only the approved sentences for the family's current window. */
export function familyWindowWords(offer: FamilyPlanOffer | null): string {
  switch (offer?.window) {
    case "new": return `${familyPlanWords.freeMonth} ${familyPlanWords.insideWindow} ${familyPlanWords.afterWindow}`;
    case "open": return `${familyPlanWords.existingWindow} ${familyPlanWords.insideWindow}`;
    case "ended": return familyPlanWords.afterWindow;
    default: return `${familyPlanWords.existingWindow} ${familyPlanWords.immediateCharge}`;
  }
}

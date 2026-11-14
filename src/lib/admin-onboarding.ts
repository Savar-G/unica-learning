import { addDays, familyZone, localDay, type FamilyLocation } from "@/lib/family-time";

export interface OnboardingStart {
  cardId: string;
  parentId: string;
  childId: string;
  parentName: string;
  childName: string;
  email: string;
  finishedAt: string;
  location: FamilyLocation;
}

/** The personal check-in is due two local calendar days after a completed initial start, never after a restart. */
export function onboardingCheckIns(starts: readonly OnboardingStart[], now: number): OnboardingStart[] {
  const seen = new Set<string>();
  return starts.filter((start) => {
    const at = Date.parse(start.finishedAt);
    if (!Number.isFinite(at) || at > now) return false;
    const zone = familyZone(start.location);
    if (addDays(localDay(at, zone), 2) !== localDay(now, zone) || seen.has(start.parentId)) return false;
    seen.add(start.parentId);
    return true;
  });
}

export function onboardingCheckInHref(start: Pick<OnboardingStart, "email" | "parentName">): string {
  const subject = "How did the first day go?";
  const body = `Hi ${start.parentName},\n\nHow did the first day go? Did scanning work?\n\nReply to this email if you would like a hand.\n\nSavar & Cedric\nUnica Learning`;
  return `mailto:${encodeURIComponent(start.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface OnboardingCheckInLoad { rows: OnboardingStart[]; unavailable: boolean }

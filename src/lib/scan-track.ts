import { getConsent, subscribeConsent } from "@/lib/consent";
import { track } from "@/lib/track";
import type { SCAN_EVENTS, ScanEvent } from "@/lib/scan-events";
let generation = 0;
subscribeConsent(() => { generation++; });
/** Tickets discard pending outcomes when consent or the current account/context changes. Nothing is replayed. */
export function scanEventTicket(current: () => boolean = () => true) {
  const started = generation, granted = getConsent() === "granted";
  const allowed = () => granted && generation === started && getConsent() === "granted" && current();
  return <K extends ScanEvent>(event: K, status: (typeof SCAN_EVENTS)[K][number]) => {
    if (allowed()) track(event, { status }, { current: allowed });
  };
}

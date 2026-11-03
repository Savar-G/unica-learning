import { isUuid } from "@/lib/workbook-content";
export const REFERENCE_TOPIC = "maya.reference";
export const REFERENCE_RPC = "maya.reference.say";
export const REFERENCE_LIMIT_MS = 30_000;
export interface ReferenceRoom { id: string; parentId: string; childId: string; workbookId: string }
export const referenceRoomName = (id: string) => `maya-reference-${id}`;
export function referenceJob(value: unknown): ReferenceRoom | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ReferenceRoom>;
  return isUuid(v.id) && isUuid(v.parentId) && isUuid(v.childId) && isUuid(v.workbookId) ? v as ReferenceRoom : null;
}
export function referenceJoiner(room: string, job: ReferenceRoom, identity: string, attributes: Readonly<Record<string, string>>) {
  return room === referenceRoomName(job.id) && identity === `child-${job.childId}` &&
    attributes["maya.reference"] === job.id && attributes["maya.parent"] === job.parentId && attributes["maya.child"] === job.childId && attributes["maya.workbook"] === job.workbookId;
}

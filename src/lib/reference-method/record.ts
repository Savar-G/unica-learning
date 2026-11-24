import { findUnstorableTextPath, type ValidationError } from "@/lib/reference-record";
import { checkAllowedKeys, isNonEmptyString, isPlainObject } from "@/lib/reference-record/validate-parts";
import { canonicalSha256 } from "./canonical";
import { makeMethodKey } from "./identity";
import { TOPIC_METHOD_STATUSES, type MethodApproval, type TopicMethodRecord } from "./types";

const SHA256_RE = /^[0-9a-f]{64}$/;
const APPROVERS_NEEDED = 2;

// The digest that an approval is for: the whole record without its status and its approvals.
export function contentSha256(record: TopicMethodRecord): string {
  const content: Partial<TopicMethodRecord> = { ...record };
  delete content.status;
  delete content.approvals;
  return canonicalSha256(content);
}

function visibleName(name: string): string {
  return name.replace(/[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
}

// One text for one person: no letter case, extra spaces, invisible characters or wide letters. Upper case
// is the case fold, because it also joins the two spellings of a sharp s and of a Greek sigma.
export function approverId(name: string): string {
  return visibleName(name.normalize("NFKC")).toUpperCase().normalize("NFKC");
}

// The name as it is stored, for the command line and for a file. Null: not a name.
export function cleanApproverName(name: string): string | null {
  if (/\p{Cc}/u.test(name) || findUnstorableTextPath(name) !== null || approverId(name) === "") return null;
  return visibleName(name);
}

// An instant in the one form that the command writes (2026-01-02T03:04:05.000Z).
function isInstant(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString() === value;
}

// The record with only the approvals that count (for this exact content, one for each person) and the
// status that they give. The status in a file is never trusted.
export function settleStatus(record: TopicMethodRecord): TopicMethodRecord {
  const sha256 = contentSha256(record);
  const byPerson = new Map<string, MethodApproval>();
  for (const approval of record.approvals) {
    const id = approverId(approval.by);
    if (approval.content_sha256 === sha256 && !byPerson.has(id)) byPerson.set(id, approval);
  }
  const approvals = [...byPerson.values()];
  return { ...record, approvals, status: approvals.length >= APPROVERS_NEEDED ? "approved" : "drafted" };
}

// True when the summary is not the text that the model wrote.
export function isEditedByPerson(record: TopicMethodRecord): boolean {
  if (record.summary_draft === null) return record.summary.length > 0;
  return record.summary_draft.sha256 !== canonicalSha256(record.summary);
}

// Checks the parts that a person can edit. The evidence is checked against the facts that code computes
// again, and the sentences with checkSummary.
export function parseMethodRecord(
  value: unknown,
): { ok: true; record: TopicMethodRecord } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const fail = (path: string, message: string): void => void errors.push({ path, message });
  if (!isPlainObject(value)) return { ok: false, errors: [{ path: "$", message: "must be a method record" }] };
  checkAllowedKeys(
    value,
    ["kind", "source", "level", "topic", "evidence", "summary", "summary_draft", "status", "approvals"],
    "",
    errors,
  );
  if (value.kind !== "topic_method") fail("kind", 'must be "topic_method"');
  const key = makeMethodKey(value.source, value.level, value.topic);
  if (!key.ok) fail("source", key.error);
  else if (key.key.level !== value.level || key.key.topic !== value.topic) {
    fail("level", "level must be in upper case and topic must be a number");
  }
  if (!isPlainObject(value.evidence) || typeof value.evidence.include_machine_read !== "boolean") {
    fail("evidence", "must be the facts that code computed");
  }
  if (!Array.isArray(value.summary)) fail("summary", "must be a list of sentences");
  const drafted = value.summary_draft;
  if (drafted !== null) {
    if (!isPlainObject(drafted) || !isNonEmptyString(drafted.model) || !isSha256(drafted.sha256)) {
      fail("summary_draft", "must be null, or the model and the digest of its summary");
    } else {
      checkAllowedKeys(drafted, ["model", "sha256"], "summary_draft", errors);
    }
  }
  if (!(TOPIC_METHOD_STATUSES as readonly unknown[]).includes(value.status)) {
    fail("status", `must be one of ${TOPIC_METHOD_STATUSES.join(", ")}`);
  }
  if (!Array.isArray(value.approvals)) fail("approvals", "must be a list");
  else {
    value.approvals.forEach((approval: unknown, i) => {
      const path = `approvals[${i}]`;
      if (!isPlainObject(approval)) return fail(path, "must be an approval");
      checkAllowedKeys(approval, ["by", "at", "content_sha256"], path, errors);
      if (typeof approval.by !== "string" || cleanApproverName(approval.by) !== approval.by) fail(path, "by must be a name");
      if (!isInstant(approval.at)) fail(path, "at must be an instant in UTC, for example 2026-01-02T03:04:05.000Z");
      if (!isSha256(approval.content_sha256)) fail(path, "content_sha256 must be a SHA-256 digest");
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, record: value as unknown as TopicMethodRecord };
}

function isSha256(value: unknown): boolean {
  return typeof value === "string" && SHA256_RE.test(value);
}

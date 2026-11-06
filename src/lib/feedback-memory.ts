import { FEEDBACK_PER_HOUR, type FeedbackAdmission, type FeedbackInput, type FeedbackStore } from "@/lib/feedback";

/** Synchronous admission before the promise resolves models the atomic database operation. */
export class MemoryFeedbackStore implements FeedbackStore {
  readonly rows: { parent: string; input: FeedbackInput; at: number }[] = [];
  readonly parents = new Set<string>();
  readonly deletingParents = new Set<string>();
  readonly children = new Map<string, string>();
  readonly deletingChildren = new Set<string>();
  constructor(private readonly now: () => number) {}
  async submit(parent: string, input: FeedbackInput): Promise<FeedbackAdmission> {
    if (!this.parents.has(parent) || this.deletingParents.has(parent)) return "family_unavailable";
    if (input.childId && (this.children.get(input.childId) !== parent || this.deletingChildren.has(input.childId))) return "child_unavailable";
    const prior = this.rows.find(r => r.parent === parent && r.input.requestId === input.requestId);
    if (prior) return JSON.stringify(prior.input) === JSON.stringify(input) ? "duplicate" : "conflict";
    const at = this.now();
    if (this.rows.filter(r => r.parent === parent && r.at > at - 3600000).length >= FEEDBACK_PER_HOUR) return "rate_limited";
    this.rows.push({ parent, input: { ...input }, at });
    return "saved";
  }
  deleteChild(child: string) {
    this.children.delete(child);
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].input.childId === child) this.rows.splice(i, 1);
  }
  deleteFamily(parent: string) {
    this.parents.delete(parent);
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].parent === parent) this.rows.splice(i, 1);
  }
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade } from "@/lib/assessment";
import type { Database } from "@/lib/database";
import type { ParentViewReader } from "@/lib/parent-view";
import { scanPagesAccess } from "@/lib/scan-pages-access";
import { withAnswers } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// The parent view module's Supabase reader (src/lib/parent-view.ts).
//   - The parent's session reads children, reports, card_setups, workbook_delivery_receipts and workbooks: row-level
//     security returns only the family's rows, and only shipped workbooks.
//   - The secret key, filtered on the signed-in parent's id, reads the tests: whether every answer of an open test is in
//     needs the stored test and the answers, which a parent may not read. This is the read the start screen uses.
//     It also reads test_accounts for the Maya switch; child_plan_states, which a parent may not read (#548): a child
//     with no row reads as `unknown`, and a load of the Account tab fills the row (src/lib/billing.ts); and the dispatch
//     emails' delivery details (carrier and tracking, #558), which only admins may read in workbook_emails; it selects
//     only the child, the workbook number and the delivery. Nothing it reads reaches the output except through
//     parent-view.ts, which checks the delivery.
// A database error throws, and so does a missing secret key: an empty read would show a paying family "Start the test".

/** The reader of this parent, from their session and the secret key. */
export function parentViewReader(session: SupabaseClient<Database>, parent: string, admin: SupabaseClient<Database> | null, env: Readonly<Record<string, string | undefined>> = process.env): ParentViewReader {
  return {
    async children() {
      const { data, error } = await session.from("children").select("id, first_name, grade, province").order("created_at").order("id");
      if (error) throw new Error(`children read: ${error.message}`);
      // A check constraint limits grade to 0-9.
      return data.map((c) => ({ id: c.id, firstName: c.first_name, grade: c.grade as Grade, province: c.province }));
    },
    async tests() {
      if (!admin) throw new Error("tests read: no secret key");
      return withAnswers(attemptStore(admin), parent);
    },
    async reports() {
      const { data, error } = await session.from("reports").select("id, child_id, assessment_id, assessment:assessments!inner(province)");
      if (error) throw new Error(`reports read: ${error.message}`);
      return data.map((r) => ({ id: r.id, childId: r.child_id, assessmentId: r.assessment_id, curriculum: r.assessment.province }));
    },
    async cardsSaved() {
      const { data, error } = await session.from("card_setups").select("child_id").not("card_saved_at", "is", null);
      if (error) throw new Error(`cards read: ${error.message}`);
      return data.map((c) => ({ childId: c.child_id }));
    },
    async deliveries() {
      const { data, error } = await session.from("workbook_delivery_receipts").select("child_id, workbook_id, delivered_at");
      if (error) throw new Error(`deliveries read: ${error.message}`);
      return data.map((d) => ({ childId: d.child_id, workbookId: d.workbook_id, deliveredAt: d.delivered_at }));
    },
    async deliveryCorrections() {
      const { data, error } = await session.from("workbook_delivery_corrections").select("workbook_id, delivered_at, audit_id");
      if (error) throw new Error(`corrections read: ${error.message}`);
      return data.map((c) => ({ workbookId: c.workbook_id, deliveredAt: c.delivered_at, auditId: c.audit_id }));
    },
    async shippedWorkbooks() {
      const { data, error } = await session.from("workbooks").select("id, child_id, number, shipped_at, pdf_path").eq("status", "shipped");
      if (error) throw new Error(`workbooks read: ${error.message}`);
      return data.map((w) => ({ id: w.id, childId: w.child_id, number: w.number, shippedAt: w.shipped_at, hasPdf: w.pdf_path !== null }));
    },
    async dispatches() {
      if (!admin) throw new Error("dispatches read: no secret key");
      const { data, error } = await admin.from("workbook_emails").select("child_id, workbook_number, delivery").eq("parent_id", parent).eq("kind", "dispatch");
      if (error) throw new Error(`dispatches read: ${error.message}`);
      return data.map((d) => ({ childId: d.child_id, number: d.workbook_number, delivery: d.delivery }));
    },
    async family() {
      const { data, error } = await session.from("parents").select("time_zone, postal").maybeSingle();
      if (error) throw new Error(`family read: ${error.message}`);
      return { timeZone: data?.time_zone ?? null, postal: data?.postal ?? null };
    },
    async plans() {
      if (!admin) throw new Error("plans read: no secret key");
      const { data, error } = await admin.from("child_plan_states").select("child_id, kind").eq("parent_id", parent);
      if (error) throw new Error(`plans read: ${error.message}`);
      return data.map((p) => ({ childId: p.child_id, kind: p.kind }));
    },
    async switches() {
      const [scanPages, testFamily] = await Promise.all([
        scanPagesAccess(parent, admin, env),
        admin?.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle(),
      ]);
      return {
        progress: env.PROGRESS_TAB_ENABLED === "on",
        // Test families only until a child can call Maya (#337), as Parent home shows the minutes today.
        maya: !testFamily?.error && testFamily?.data?.parent_id === parent,
        scanPages,
      };
    },
  };
}

/** The reader of the signed-in parent; null when no one is signed in. */
export async function signedInParentView(): Promise<ParentViewReader | null> {
  const session = await sessionClient();
  const parent = await parentId(session);
  return parent ? parentViewReader(session, parent, adminClient()) : null;
}

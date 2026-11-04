import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import type { WorkbookSelectionReader } from "@/lib/maya-workbook-question";
import { workbookStore } from "@/lib/workbook-store";

export function adminWorkbookReader(admin: AdminSession): WorkbookSelectionReader {
  return {
    books: workbookStore(admin.db),
    child: async id => {
      const { data, error } = await admin.db.rpc("admin_children").select("parent_id, first_name, grade").eq("id", id).maybeSingle();
      if (error) throw Error(error.message);
      return data && { parentId: data.parent_id, firstName: data.first_name, grade: data.grade };
    },
    isTestFamily: async parent => {
      const { data, error } = await admin.db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle();
      if (error) throw Error(error.message);
      return data !== null;
    },
  };
}

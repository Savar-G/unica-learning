import { AdminFrame } from "@/components/admin";
import { BoardPreview } from "@/components/admin-board";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { fontPreviews } from "@/lib/board-preview";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/board`, title: "Admin: Maya's board", description: "Admin area.", index: false });

// Maya's board preview (#319): 27 + 39 stroke by stroke, and the two fonts for Savar to choose from. Admins only.
// ?demo=1 in local development shows it without a sign-in, as on the skill map: the page holds no family data.
export default async function BoardPage({ searchParams }: PageProps<"/admin/board">) {
  const demo = (await searchParams).demo === "1" && process.env.NODE_ENV === "development";
  const email = demo ? "local preview" : (await requireAdmin()).email;
  return (
    <AdminFrame email={email} section="board" title="Maya's board">
      <BoardPreview fonts={fontPreviews()} />
    </AdminFrame>
  );
}

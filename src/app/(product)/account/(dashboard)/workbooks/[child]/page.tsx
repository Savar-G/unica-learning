import { notFound, redirect } from "next/navigation";
import { ParentWorkbooks } from "@/components/parent-workbooks";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { readWorkbooks } from "@/lib/parent-view";
import { signedInParentView } from "@/lib/parent-view-server";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbooks", description: "Your child's workbooks.", index: false });

// The Workbooks tab (#558, spec #544, D-246): the current book and its tracking, a date range for the next book, and the
// PDF of each shipped book. Only for families the dashboard is open to; every other family gets the 404, as before.
// Pause (#559), page history and answers (#565) come later; Skip, See the full plan and the More / New / Less / Review
// list are not in the product.

/** The signed-in parent's child's Workbooks tab; a redirect or the 404 when there is none to show. */
async function load(childId: string) {
  const reader = await signedInParentView();
  if (!reader) redirect("/sign-in");
  if (!(await parentDashboard())) notFound();
  return (await readWorkbooks(reader, childId, Date.now())) ?? notFound();
}

export default async function Workbooks({ params }: PageProps<"/account/workbooks/[child]">) {
  return <ParentWorkbooks {...await load((await params).child)} />;
}

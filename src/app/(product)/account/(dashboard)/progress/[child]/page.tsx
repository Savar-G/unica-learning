import { notFound, redirect } from "next/navigation";
import { ParentProgress } from "@/components/parent-progress";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { readProgress } from "@/lib/parent-view";
import { signedInParentView } from "@/lib/parent-view-server";

export const metadata = pageMetadata({ path: "/account/progress", title: "Progress", description: "Your child's progress.", index: false });

// The Progress tab (#561, spec #544, D-244): the skill map by reported area, and a panel on the selected skill. Only for
// families the dashboard is open to, and only with the switch for #194 on (PROGRESS_TAB_ENABLED); every other family gets
// the 404. The progress line, pages, marks, repeated mistakes and Maya calls come with #565. What we've learned shows only
// facts code counted, and before marks there are none, so the section does not appear.

/** The signed-in parent's child's Progress tab; a redirect or the 404 when there is none to show. */
async function load(childId: string) {
  const reader = await signedInParentView();
  if (!reader) redirect("/sign-in");
  if (!(await parentDashboard())) notFound();
  return (await readProgress(reader, childId, Date.now())) ?? notFound();
}

export default async function Progress({ params }: PageProps<"/account/progress/[child]">) {
  return <ParentProgress {...await load((await params).child)} />;
}

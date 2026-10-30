import { notFound } from "next/navigation";
import { getChildProfile, requireAdmin } from "@/lib/admin-store";
import { AdminChildProfile } from "@/components/admin-child-profile";

// The current profile of one child (#303): built from the child's latest test profile and every learning event, and
// stored in public.child_profiles, which only admins read.
export default async function AdminChildProfilePage({ params }: PageProps<"/admin/children/[id]/profile">) {
  const admin = await requireAdmin();
  const detail = await getChildProfile(admin, (await params).id);
  if (!detail) notFound();
  return <AdminChildProfile email={admin.email} detail={detail} />;
}

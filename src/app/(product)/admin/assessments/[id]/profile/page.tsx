import { notFound } from "next/navigation";
import { getProfile, requireAdmin } from "@/lib/admin-store";
import { AdminProfile } from "@/components/admin-profile";

// The learner profile of one test (#196): built by the report job after finish and stored in public.learner_profiles,
// which only admins read.
export default async function AdminProfilePage({ params }: PageProps<"/admin/assessments/[id]/profile">) {
  const admin = await requireAdmin();
  const detail = await getProfile(admin, (await params).id);
  if (!detail) notFound();
  return <AdminProfile email={admin.email} detail={detail} />;
}

import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileForm } from "@/components/layout/ProfileForm";
import { AdminUsersCard } from "@/components/settings/AdminUsersCard";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile and application access settings." />
      <ProfileForm />
      <AdminUsersCard />
    </>
  );
}

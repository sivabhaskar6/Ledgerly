import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileForm } from "@/components/layout/ProfileForm";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile and application settings." />
      <ProfileForm />
    </>
  );
}

import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileForm } from "@/components/layout/ProfileForm";
import { ThemeSettingsCard } from "@/components/settings/ThemeSettingsCard";

export default function Page() {
  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 max-w-2xl">
      <div className="shrink-0">
        <PageHeader
          title="Settings"
          description="Your personal profile, visual appearance, and application settings."
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        <ThemeSettingsCard />
        <ProfileForm />
      </div>
    </div>
  );
}

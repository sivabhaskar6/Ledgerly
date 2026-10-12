import { PageHeader } from "./PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export function ComingSoon({ title, stage, body }: { title: string; stage: string; body: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title={`Not built yet (${stage})`} body={body} />
    </>
  );
}

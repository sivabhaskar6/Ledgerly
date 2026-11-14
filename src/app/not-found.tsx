import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">404 - Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-500">
        Sorry, the page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6">
        <Link href="/dashboard">
          <Button>Return to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-6 block text-center text-2xl font-semibold tracking-tight text-brand-700">Ledgerly</Link>
        <div className="rounded-card border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}

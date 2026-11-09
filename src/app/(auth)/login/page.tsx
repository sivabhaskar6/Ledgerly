"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { loginSchema } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { checkUserApproval } from "@/lib/data/users";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AuthHeading, FormError } from "@/components/layout/AuthShell";

type Values = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    const reason = params.get("reason") || params.get("error");
    if (reason === "pending_approval") {
      setError("Your account is under admin approval. Please wait for the admin to approve your account before logging in.");
    }
  }, [params]);

  async function onSubmit(v: Values) {
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword(v);
      if (error) {
        setError(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
        return;
      }
      if (data?.user) {
        const { isApproved, isAdmin, status } = await checkUserApproval(supabase, data.user.id);
        if (!isApproved && !isAdmin) {
          await supabase.auth.signOut();
          if (status === "rejected") {
            setError("Your access request was declined by the administrator. Contact the admin for access.");
          } else {
            setError("Your account is under admin approval. Please wait for the admin to approve your account before logging in.");
          }
          return;
        }
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  }
  return (
    <>
      <AuthHeading title="Log in" sub="Welcome back." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />
        <TextField label="Email" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="current-password" {...register("password")} error={errors.password?.message} />
        <Button type="submit" className="w-full" loading={isSubmitting}>Log in</Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">Forgot password?</Link>
        <Link href="/signup" className="text-brand-700 hover:underline">Create account</Link>
      </div>
    </>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }

"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { emailSchema } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AuthHeading, FormError } from "@/components/layout/AuthShell";

type Values = z.infer<typeof emailSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(emailSchema) });

  async function onSubmit(v: Values) {
    setError(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(v.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) setError(error.message); else setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  }
  if (sent) return (
    <>
      <AuthHeading title="Check your email" sub="If an account exists for that address, a reset link is on its way." />
      <Link href="/login" className="text-sm text-brand-700 hover:underline">Back to log in</Link>
    </>
  );
  return (
    <>
      <AuthHeading title="Reset your password" sub="Enter your email and we will send a reset link." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />
        <TextField label="Email" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
        <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
      </form>
      <p className="mt-4 text-sm"><Link href="/login" className="text-brand-700 hover:underline">Back to log in</Link></p>
    </>
  );
}

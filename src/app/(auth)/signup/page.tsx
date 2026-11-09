"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { signupSchema } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { checkUserApproval } from "@/lib/data/users";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AuthHeading, FormError } from "@/components/layout/AuthShell";

type Values = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(v: Values) {
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: v.email, password: v.password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { full_name: v.name } },
      });
      if (error) {
        if (/rate limit/i.test(error.message)) {
          setError("Email rate limit exceeded. Please wait a few minutes, or turn off 'Confirm email' in your Supabase Auth dashboard for instant signup.");
        } else {
          setError(error.message);
        }
        return;
      }
      if (data?.user) {
        try {
          await supabase
            .from("profiles")
            .update({
              display_name: v.name.trim(),
              email: v.email.trim().toLowerCase(),
            })
            .eq("id", data.user.id);
        } catch {
          // ignore
        }
      }
      if (data.session) {
        const { isApproved, isAdmin } = await checkUserApproval(supabase, data.session.user.id);
        if (!isApproved && !isAdmin) {
          await supabase.auth.signOut();
          router.replace("/pending-approval");
          return;
        }
        router.replace("/dashboard");
        router.refresh();
      } else {
        setCheckEmail(true);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  }

  if (checkEmail) return (
    <>
      <AuthHeading
        title="Check your email"
        sub="We sent a confirmation link. Open it to verify your email address. Once verified, your account will be submitted for admin approval before you can log in."
      />
      <Link href="/login" className="text-sm text-brand-700 hover:underline">Back to log in</Link>
    </>
  );
  return (
    <>
      <AuthHeading title="Create your account" sub="Your records are saved to your account and available on any device." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />
        <TextField label="Your name" autoComplete="name" {...register("name")} error={errors.name?.message} />
        <TextField label="Email" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="new-password" {...register("password")} error={errors.password?.message} hint="At least 8 characters" />
        <TextField label="Confirm password" type="password" autoComplete="new-password" {...register("confirm")} error={errors.confirm?.message} />
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
      <p className="mt-4 text-sm text-slate-600">Already registered? <Link href="/login" className="text-brand-700 hover:underline">Log in</Link></p>
    </>
  );
}

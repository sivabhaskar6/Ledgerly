"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { resetSchema } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AuthHeading, FormError } from "@/components/layout/AuthShell";

type Values = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(v: Values) {
    setError(null);
    try {
      const { error } = await createClient().auth.updateUser({ password: v.password });
      if (error) { setError(error.message); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  }
  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />
        <TextField label="New password" type="password" autoComplete="new-password" {...register("password")} error={errors.password?.message} />
        <TextField label="Confirm password" type="password" autoComplete="new-password" {...register("confirm")} error={errors.confirm?.message} />
        <Button type="submit" className="w-full" loading={isSubmitting}>Save new password</Button>
      </form>
    </>
  );
}

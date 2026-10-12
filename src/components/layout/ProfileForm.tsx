"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { nameSchema } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "./AuthShell";

type Values = z.infer<typeof nameSchema>;

export function ProfileForm() {
  const router = useRouter();
  const { notify } = useToast();
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(nameSchema), defaultValues: { name: "" } });

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      const n = data.user?.user_metadata?.full_name;
      reset({ name: typeof n === "string" ? n : "" });
    });
  }, [reset]);

  async function onSubmit(v: Values) {
    setError(null);
    try {
      const { error } = await createClient().auth.updateUser({ data: { full_name: v.name } });
      if (error) throw error;
      notify("success", "Name updated.");
      router.refresh();
    } catch (e) { setError(errorMessage(e, "Could not save your name.")); }
  }
  if (email === null) return <Skeleton className="h-32 max-w-md" />;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md space-y-4 rounded-card border border-slate-200 bg-white p-4 md:p-5">
      <FormError message={error} />
      <TextField label="Your name" autoComplete="name" {...register("name")} error={errors.name?.message} hint="Shown at the top of every page instead of your email." />
      <TextField label="Email" value={email} readOnly disabled />
      <Button type="submit" loading={isSubmitting}>Save name</Button>
    </form>
  );
}

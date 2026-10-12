import clsx from "clsx";
import { forwardRef, useId } from "react";

const base = "h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50";

type FieldShell = { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => React.ReactNode };
export function FieldShell({ label, error, hint, children }: FieldShell) {
  const id = useId();
  const msgId = error || hint ? `${id}-msg` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children(id, msgId)}
      {(error || hint) && (
        <p id={msgId} role={error ? "alert" : undefined} className={clsx("mt-1 text-xs", error ? "text-red-600" : "text-slate-500")}>{error ?? hint}</p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };
export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField({ label, error, hint, className, ...rest }, ref) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, d) => <input id={id} ref={ref} aria-invalid={!!error} aria-describedby={d} {...rest}
        className={clsx(base, error ? "border-red-400" : "border-slate-300", className)} />}
    </FieldShell>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string };
export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField({ label, error, className, children, ...rest }, ref) {
  return (
    <FieldShell label={label} error={error}>
      {(id, d) => <select id={id} ref={ref} aria-invalid={!!error} aria-describedby={d} {...rest}
        className={clsx(base, error ? "border-red-400" : "border-slate-300", className)}>{children}</select>}
    </FieldShell>
  );
});

import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean;
};
export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 dark:border-transparent dark:font-semibold shadow-xs",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-200 dark:hover:bg-[#222222] dark:hover:text-white",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-500",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

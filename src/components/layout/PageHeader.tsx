export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0"}>
      <div>
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && (
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-1.5 sm:gap-2">{actions}</div>}
    </div>
  );
}

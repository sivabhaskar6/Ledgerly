"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Uses the native <dialog> element: focus trap, Esc to close and aria-modal come for free. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}
      className={`m-auto w-[calc(100%-1.5rem)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40 ${wide ? "max-w-xl" : "max-w-md"}`}>
      {open && (
        <div className="max-h-[90vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

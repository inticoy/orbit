"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { motionTokens } from "@/lib/motion";

type SheetProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };

/**
 * Bottom sheet used for detail views and composer forms. Rendered into <body>:
 * glass cards use backdrop-filter, which would otherwise trap `position: fixed`.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            aria-label="닫기"
            className="absolute inset-0 bg-app-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            type="button"
          />
          <motion.div
            className="relative max-h-[88dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-[28px] bg-app-card px-5 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-float"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={motionTokens.glassSpring}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-app-ink/15" aria-hidden="true" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="m-0 text-[17px] font-bold tracking-[-0.02em]">{title}</h2>
              <button aria-label="닫기" className="grid size-8 place-items-center rounded-full bg-app-ink/[.05] text-app-muted" onClick={onClose} type="button"><X size={18} aria-hidden="true" /></button>
            </div>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export const fieldClass = "w-full rounded-[14px] bg-app-bg px-4 py-3 text-base text-app-ink outline-none ring-1 ring-app-line placeholder:text-app-faint focus:bg-app-card focus:ring-2 focus:ring-app-accent/40";
export const fieldLabelClass = "grid gap-1.5 text-[13px] font-semibold text-app-muted";
export const primaryButtonClass = "flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-app-ink text-[15px] font-semibold text-app-bg transition active:scale-[.985] disabled:opacity-50";
/** Compact action in the page header (top right). */
export const pillButtonClass = "inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-app-ink pr-3.5 pl-3 text-[13px] font-semibold text-app-bg no-underline transition active:scale-95";

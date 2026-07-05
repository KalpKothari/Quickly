import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Clock, X } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSupportPromptStore } from "@/lib/support-prompt-store";

export function SupportProjectModal() {
  const isOpen = useSupportPromptStore((s) => s.isOpen);
  const close = useSupportPromptStore((s) => s.close);
  const dismissForSession = useSupportPromptStore((s) => s.dismissForSession);
  const modalRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissForSession();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const focusTimer = setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [isOpen, dismissForSession]);

  // Smoothly scrolls to the #support section instead of a hard page jump.
  // If we're already on the landing page, scroll immediately.
  // If we're on a tool/other page, navigate home first, then scroll once
  // the section has had a moment to mount.
  const scrollToSupport = () => {
    const el = document.getElementById("support");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSupportClick = () => {
    close();
    if (path === "/") {
      scrollToSupport();
    } else {
      navigate({ to: "/" }).then(() => {
        // Give the landing page a moment to render before scrolling.
        setTimeout(scrollToSupport, 150);
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismissForSession}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative w-full max-w-md rounded-t-3xl border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_0_var(--color-foreground)] sm:rounded-3xl sm:p-7"
          >
            <button
              onClick={dismissForSession}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full border-2 border-foreground bg-background p-1.5 text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-foreground hover:shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-fuchsia-500/15 text-fuchsia-500">
              <Heart className="h-6 w-6" />
            </div>

            <h2 id="support-modal-title" className="text-center font-display text-xl font-bold sm:text-2xl">
              Enjoying Quickly?
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-center text-sm text-muted-foreground">
              If this tool just saved you some time, consider supporting the project — it helps keep everything free and ad-free.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={handleSupportClick}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
              >
                <Heart className="h-4 w-4" /> Support Project
              </button>
              <button
                onClick={close}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-foreground bg-background px-5 py-3 text-sm font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <Clock className="h-4 w-4" /> Do Later
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
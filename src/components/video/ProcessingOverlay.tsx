import { X } from "lucide-react";
import type { JobStatus } from "@/hooks/useFFmpegJob";

interface ProcessingOverlayProps {
  status: JobStatus;
  progress: number;
  errorMessage: string | null;
  onCancel: () => void;
}

export default function ProcessingOverlay({ status, progress, errorMessage, onCancel }: ProcessingOverlayProps) {
  if (status === "idle" || status === "done") return null;

  return (
    <div className="space-y-3 rounded-xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
      {status === "loading-engine" && (
        <p className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
          Loading video engine (first time only, then cached)…
        </p>
      )}
      {status === "processing" && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
              Processing… {progress}%
            </span>
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-card px-2.5 py-1 text-xs font-bold text-destructive shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}
      {status === "error" && (
        <p className="rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {errorMessage || "Something went wrong."}
        </p>
      )}
      {status === "cancelled" && (
        <p className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2.5 py-0.5 text-xs font-bold text-foreground/70">
          Cancelled.
        </p>
      )}
    </div>
  );
}
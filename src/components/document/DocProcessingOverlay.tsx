import { X, AlertCircle, XCircle } from "lucide-react";
import type { DocJobStatus } from "@/hooks/useDocumentJob";

interface DocProcessingOverlayProps {
  status: DocJobStatus;
  progress: number;
  stepLabel: string;
  errorMessage: string | null;
  onCancel: () => void;
}

export default function DocProcessingOverlay({ status, progress, stepLabel, errorMessage, onCancel }: DocProcessingOverlayProps) {
  if (status === "idle" || status === "done") return null;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
      {status === "processing" && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-muted-foreground">{stepLabel || "Processing…"} {progress}%</span>
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-bold text-destructive transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full border-2 border-foreground bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}
      {status === "error" && (
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage || "Something went wrong."}
        </p>
      )}
      {status === "cancelled" && (
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <XCircle className="h-4 w-4 shrink-0" />
          Cancelled.
        </p>
      )}
    </div>
  );
}
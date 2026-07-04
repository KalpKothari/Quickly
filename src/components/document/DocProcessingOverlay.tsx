import { X } from "lucide-react";
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
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
      {status === "processing" && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{stepLabel || "Processing…"} {progress}%</span>
            <button onClick={onCancel} className="inline-flex items-center gap-1 text-destructive hover:underline">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}
      {status === "error" && <p className="text-sm text-destructive">{errorMessage || "Something went wrong."}</p>}
      {status === "cancelled" && <p className="text-sm text-muted-foreground">Cancelled.</p>}
    </div>
  );
}
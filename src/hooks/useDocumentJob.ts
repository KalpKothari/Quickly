import { useCallback, useRef, useState } from "react";
import { toFriendlyError } from "@/lib/document-tools";

export type DocJobStatus = "idle" | "processing" | "done" | "error" | "cancelled";

export function useDocumentJob() {
  const [status, setStatus] = useState<DocJobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const run = useCallback(
    async (context: string, task: (setProgress: (p: number, label?: string) => void, checkCancelled: () => void) => Promise<void>) => {
      cancelledRef.current = false;
      setErrorMessage(null);
      setProgress(0);
      setStepLabel("");
      setStatus("processing");

      const checkCancelled = () => {
        if (cancelledRef.current) throw new Error("__CANCELLED__");
      };
      const updateProgress = (p: number, label?: string) => {
        if (!cancelledRef.current) {
          setProgress(Math.min(100, Math.round(p)));
          if (label) setStepLabel(label);
        }
      };

      try {
        await task(updateProgress, checkCancelled);
        if (cancelledRef.current) {
          setStatus("cancelled");
          return;
        }
        setStatus("done");
      } catch (e) {
        if (cancelledRef.current || (e instanceof Error && e.message === "__CANCELLED__")) {
          setStatus("cancelled");
          return;
        }
        setStatus("error");
        setErrorMessage(toFriendlyError(e, context));
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus("cancelled");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setStepLabel("");
    setErrorMessage(null);
  }, []);

  return { status, progress, stepLabel, errorMessage, run, cancel, reset };
}
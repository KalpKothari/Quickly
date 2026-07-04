import { useCallback, useRef, useState } from "react";
import { getFFmpeg, getMaxFileSizeBytes, formatBytes } from "@/lib/ffmpeg-core";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export type JobStatus = "idle" | "loading-engine" | "processing" | "done" | "error" | "cancelled";

export function useFFmpegJob() {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const cancelledRef = useRef(false);

  const validateFileSize = useCallback((file: File): string | null => {
    const max = getMaxFileSizeBytes();
    if (file.size > max) {
      return `This file is ${formatBytes(file.size)}, which is over the ${formatBytes(max)} limit for your device. Try a smaller or compressed file.`;
    }
    return null;
  }, []);

  const run = useCallback(
    async (task: (ffmpeg: FFmpeg, checkCancelled: () => void) => Promise<void>) => {
      cancelledRef.current = false;
      setErrorMessage(null);
      setProgress(0);
      try {
        setStatus("loading-engine");
        const ffmpeg = await getFFmpeg();
        ffmpegRef.current = ffmpeg;

        const progressHandler = ({ progress: p }: { progress: number }) => {
          if (!cancelledRef.current) setProgress(Math.min(100, Math.round(p * 100)));
        };
        ffmpeg.on("progress", progressHandler);

        setStatus("processing");
        const checkCancelled = () => {
          if (cancelledRef.current) throw new Error("__CANCELLED__");
        };
        await task(ffmpeg, checkCancelled);

        ffmpeg.off("progress", progressHandler);

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
        setErrorMessage(
          e instanceof Error ? e.message : "Something went wrong while processing this file.",
        );
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // ffmpeg.wasm doesn't support true mid-operation abort in 0.12.x reliably;
    // terminate() kills the worker entirely, which is the only hard-stop available.
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
      } catch {
        // ignore
      }
      ffmpegRef.current = null;
    }
    setStatus("cancelled");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
  }, []);

  return { status, progress, errorMessage, run, cancel, reset, validateFileSize };
}
import { useCallback, useRef, useState } from "react";
import { getFFmpeg, getMaxFileSizeBytes, formatBytes } from "@/lib/ffmpeg-core";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export type JobStatus = "idle" | "loading-engine" | "processing" | "done" | "error" | "cancelled";

// If neither a progress event nor an ffmpeg log line arrives for this long while a job is
// "processing", treat it as hung rather than leaving the UI frozen at 100% forever. This is
// reset by *any* sign of life (progress or log), so a genuinely slow-but-working job is never
// killed early — only a truly stalled one.
const STALL_TIMEOUT_MS = 45_000;

export function useFFmpegJob() {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const cancelledRef = useRef(false);
  const lastLogRef = useRef<string | null>(null);

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
      lastLogRef.current = null;
      setErrorMessage(null);
      setProgress(0);

      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let stalled = false;

      const clearStallTimer = () => {
        if (stallTimer) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
      };

      const armStallTimer = (ffmpeg: FFmpeg) => {
        clearStallTimer();
        stallTimer = setTimeout(() => {
          // No progress and no log output for STALL_TIMEOUT_MS straight — the worker is
          // genuinely wedged (a known ffmpeg.wasm failure mode, not just "slow"). Force-stop
          // instead of leaving the UI frozen with no feedback.
          stalled = true;
          cancelledRef.current = true;
          try {
            ffmpeg.terminate();
          } catch {
            // ignore
          }
        }, STALL_TIMEOUT_MS);
      };

      let progressHandler: ((e: { progress: number }) => void) | null = null;
      let logHandler: ((e: { message: string }) => void) | null = null;
      let ffmpeg: FFmpeg | null = null;

      try {
        setStatus("loading-engine");
        ffmpeg = await getFFmpeg((message) => {
          lastLogRef.current = message;
          if (ffmpeg) armStallTimer(ffmpeg);
        });
        ffmpegRef.current = ffmpeg;

        progressHandler = ({ progress: p }) => {
          if (!cancelledRef.current) setProgress(Math.min(100, Math.max(0, Math.round(p * 100))));
          if (ffmpeg) armStallTimer(ffmpeg);
        };
        logHandler = ({ message }) => {
          lastLogRef.current = message;
          if (ffmpeg) armStallTimer(ffmpeg);
        };
        ffmpeg.on("progress", progressHandler);
        ffmpeg.on("log", logHandler);

        setStatus("processing");
        armStallTimer(ffmpeg);

        const checkCancelled = () => {
          if (cancelledRef.current) throw new Error(stalled ? "__STALLED__" : "__CANCELLED__");
        };
        await task(ffmpeg, checkCancelled);

        if (cancelledRef.current) {
          setStatus(stalled ? "error" : "cancelled");
          if (stalled) {
            setErrorMessage(
              "Processing got stuck and was stopped automatically. Try a shorter clip, a lower setting, or a different format.",
            );
          }
          return;
        }
        setStatus("done");
      } catch (e) {
        if (stalled || (e instanceof Error && e.message === "__STALLED__")) {
          setStatus("error");
          setErrorMessage(
            "Processing got stuck and was stopped automatically. Try a shorter clip, a lower setting, or a different format.",
          );
          return;
        }
        if (cancelledRef.current || (e instanceof Error && e.message === "__CANCELLED__")) {
          setStatus("cancelled");
          return;
        }
        setStatus("error");
        const base = e instanceof Error ? e.message : "Something went wrong while processing this file.";
        // Surface ffmpeg's own last log line when available — it's usually far more specific
        // than the generic exec() rejection message (e.g. codec/filter errors).
        setErrorMessage(lastLogRef.current ? `${base} (${lastLogRef.current})` : base);
      } finally {
        // Always detach listeners, even on failure — previously this only ran on the success
        // path, so an errored job left its progress/log handlers attached to the shared
        // singleton ffmpeg instance for the rest of the session.
        clearStallTimer();
        if (ffmpeg && progressHandler) ffmpeg.off("progress", progressHandler);
        if (ffmpeg && logHandler) ffmpeg.off("log", logHandler);
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
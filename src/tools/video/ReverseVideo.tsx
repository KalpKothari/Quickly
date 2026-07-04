import { useEffect, useState } from "react";
import { Rewind, Video, RotateCcw, ArrowRight, Info, AlertTriangle } from "lucide-react";
import { fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import { fileDataToBlob } from "@/lib/blob";

export default function ReverseVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleResetWorkspace = () => {
    setFile(null);
    setResultBlob(null);
    reset();
  };

  const handleReverse = async (targetFile: File) => {
    if (!targetFile) return;
    setResultBlob(null);
    const ext = getExtension(targetFile.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(targetFile));
      checkCancelled();
      // Reverse decodes the entire clip into memory frame-by-frame — long clips
      // (several minutes+) may be slow or hit memory limits in the browser tab.
      await ffmpeg.exec(["-i", `input.${ext}`, "-vf", "reverse", "-af", "areverse", "output.mp4"]);
      checkCancelled();
      const data = await ffmpeg.readFile("output.mp4");
      setResultBlob(fileDataToBlob(data, "video/mp4"));
      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  // Trigger transformation instantly once a file target is acquired
  useEffect(() => {
    if (file && !resultBlob && status === "idle") {
      handleReverse(file);
    }
  }, [file]);

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Video className="h-3.5 w-3.5" />
            Video Inverter &amp; Rewinder
          </span>
        </div>
      </div>

      {!file ? (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <VideoDropzone onFile={handleFile} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Metadata & Quick Reset Toolbar Layout - Capsule Pill Layout */}
          <div className="rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-[3px_3px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                1
              </span>
              <div className="text-sm font-semibold text-foreground truncate">
                {file.name}
                <span className="text-muted-foreground font-normal"> (Active Target Video)</span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Change Source
            </button>
          </div>

          {/* Contextual Processing / Notification Banner */}
          {status === "idle" ? (
            <div className="flex gap-2 rounded-xl border-2 border-foreground bg-amber-500/15 p-3.5 text-xs font-semibold text-amber-880 dark:text-amber-300 shadow-[2px_2px_0_0_var(--color-foreground)]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Best for short clips (under ~1 minute) — longer videos break processing down frame-by-frame and use significant system memory.</span>
            </div>
          ) : (
            <div className="flex gap-2 rounded-xl border-2 border-foreground bg-primary/15 p-3.5 text-xs font-semibold text-primary shadow-[2px_2px_0_0_var(--color-foreground)]">
              <Info className="h-4 w-4 shrink-0" />
              <span>Your video is being processed securely inside your browser. No files are uploaded to any server.</span>
            </div>
          )}

          {/* Manual Run Fail-safe Mechanism Trigger */}
          {status === "idle" && !resultBlob && (
            <button
              onClick={() => handleReverse(file)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Rewind className="h-5 w-5" /> Force Pipeline Rewind Processing <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Processing State Interstitial Overlay */}
      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      
      {/* Visual Result Rendering Panel */}
      {resultBlob && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <VideoPreview 
            blob={resultBlob} 
            filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-reversed.mp4`} 
            label="Preview (reversed)" 
          />
        </div>
      )}
    </div>
  );
}
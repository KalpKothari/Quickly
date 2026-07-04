import { useEffect, useState } from "react";
import { PlayCircle, Video, RotateCcw, ArrowRight } from "lucide-react";
import { fetchFile, getExtension, buildAtempoChain } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import { fileDataToBlob } from "@/lib/blob";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export default function PlaybackSpeed() {
  const [file, setFile] = useState<File | null>(null);
  const [speed, setSpeed] = useState(1);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleResetWorkspace = () => {
    setFile(null);
    setSpeed(1);
    setResultBlob(null);
    reset();
  };

  const handleApply = async (targetSpeed = speed) => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);
    const videoFilter = `setpts=${(1 / targetSpeed).toFixed(4)}*PTS`;
    const audioFilter = buildAtempoChain(targetSpeed);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();
      await ffmpeg.exec([
        "-i", `input.${ext}`,
        "-filter_complex", `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
        "-map", "[v]", "-map", "[a]",
        "output.mp4",
      ]);
      checkCancelled();
      const data = await ffmpeg.readFile("output.mp4");
      setResultBlob(fileDataToBlob(data, "video/mp4"));
      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  const handleSpeedSelect = (s: number) => {
    setSpeed(s);
    // Instantly apply the transformation for a seamless, single-click experience
    if (file && status !== "loading-engine" && status !== "processing") {
      handleApply(s);
    }
  };

  // Automatically process on drop if speed is pre-configured away from normal speed (1x)
  useEffect(() => {
    if (file && speed !== 1 && !resultBlob && status === "idle") {
      handleApply(speed);
    }
  }, [file]);

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Video className="h-3.5 w-3.5" />
            Playback Speed Modifier
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
                <span className="text-muted-foreground font-normal"> (Active Source Asset)</span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Reset Video
            </button>
          </div>

          {/* Speed Preset Controller Box */}
          <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Select Speed Preset
              </span>
              <div className="text-xs font-bold text-foreground/70 bg-background border-2 border-foreground px-2 py-0.5 rounded-md">
                Target Speed: <span className="text-primary font-black">{speed}x</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSpeedSelect(s)}
                  disabled={status === "loading-engine" || status === "processing"}
                  className={`rounded-xl border-2 border-foreground px-3 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 ${
                    speed === s
                      ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                      : "bg-background text-foreground"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {(speed === 0.25 || speed === 4) && (
              <div className="rounded-xl border-2 border-foreground bg-amber-500/15 p-3 text-xs font-semibold text-amber-800 dark:text-amber-300">
                Note: extreme speeds ({speed}x) are chained from multiple filter passes and may alter pitch slightly.
              </div>
            )}
          </div>

          {/* Direct Processing Fallback / Trigger Option */}
          <button
            type="button"
            onClick={() => handleApply(speed)}
            disabled={status === "loading-engine" || status === "processing"}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:shadow-[4px_4px_0_0_var(--color-foreground)]"
          >
            <PlayCircle className="h-5 w-5" /> Run Speed Processing Pipeline ({speed}x) <ArrowRight className="ml-1 h-4 w-4" />
          </button>
        </div>
      )}

      {/* Processing State Interstitial Overlay */}
      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      
      {/* Visual Result Rendering Panel */}
      {resultBlob && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <VideoPreview 
            blob={resultBlob} 
            filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-${speed}x.mp4`} 
            label="Preview (speed adjusted)" 
          />
        </div>
      )}
    </div>
  );
}
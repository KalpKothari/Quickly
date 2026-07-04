import { useEffect, useState } from "react";
import { Infinity as InfinityIcon, Video, RotateCcw, ArrowRight } from "lucide-react";
import { fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import { fileDataToBlob } from "@/lib/blob";

export default function LoopVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [loops, setLoops] = useState(2);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleResetWorkspace = () => {
    setFile(null);
    setLoops(2);
    setResultBlob(null);
    reset();
  };

  const handleLoop = async () => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();
      // -stream_loop N means "play N additional times", so total plays = N+1.
      await ffmpeg.exec([
        "-stream_loop", String(loops - 1),
        "-i", `input.${ext}`,
        "-c", "copy",
        "output.mp4",
      ]);
      checkCancelled();
      const data = await ffmpeg.readFile("output.mp4");
      setResultBlob(fileDataToBlob(data, "video/mp4"));
      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <InfinityIcon className="h-3.5 w-3.5" />
            Video Looper Pipeline
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
                <span className="text-muted-foreground font-normal"> (Active Source Video)</span>
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

          {/* Loop Configuration Controller Box */}
          <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Configure Play Count repetitions
              </span>
              <div className="text-xs font-bold text-foreground/70 bg-background border-2 border-foreground px-2 py-0.5 rounded-md">
                Total Loops: <span className="text-primary font-black">{loops}x</span>
              </div>
            </div>

            {/* Quick Click Preset Row */}
            <div className="flex gap-2">
              {[2, 3, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setLoops(val)}
                  className={`rounded-lg border-2 border-foreground px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                    loops === val 
                      ? "bg-primary text-primary-foreground shadow-[1px_1px_0_0_var(--color-foreground)]" 
                      : "bg-background text-foreground"
                  }`}
                >
                  {val}x Preset
                </button>
              ))}
            </div>

            <label className="block pt-1">
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={loops}
                onChange={(e) => setLoops(Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
                aria-label="Loop slider count selector"
              />
              <div className="mt-1 flex justify-between text-[10px] font-bold uppercase text-foreground/40 px-0.5">
                <span>2x Plays</span>
                <span>10x Plays</span>
              </div>
            </label>
          </div>

          {/* Core Processing Action Button */}
          <button
            onClick={handleLoop}
            disabled={status === "loading-engine" || status === "processing"}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:shadow-[4px_4px_0_0_var(--color-foreground)]"
          >
            <InfinityIcon className="h-5 w-5" /> Compile &amp; Loop Video Asset ({loops}x) <ArrowRight className="h-4 w-4" />
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
            filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-looped.mp4`} 
            label="Preview (looped)" 
          />
        </div>
      )}
    </div>
  );
}
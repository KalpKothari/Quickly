import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Scissors, RotateCcw } from "lucide-react";
import { fetchFile, getExtension, getVideoDuration } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import DualHandleTimeline from "@/components/video/DualHandleTimeline";
import { fileDataToBlob } from "@/lib/blob";

const MODES = [
  { key: "fast", precise: false, label: "Fast trim", hint: "Near-instant — cut snaps to the nearest keyframe." },
  { key: "precise", precise: true, label: "Precise trim", hint: "Slower — re-encodes for an exact cut point." },
];

export default function TrimVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [precise, setPrecise] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const busy = status === "loading-engine" || status === "processing";

  const handleFile = async (f: File) => {
    setResultBlob(null);
    reset();
    try {
      const dur = await getVideoDuration(f);
      setFile(f);
      setDuration(dur);
      setStart(0);
      setEnd(dur);
    } catch {
      toast.error("Couldn't read this video's duration.");
    }
  };

  // Same trim pipeline as before — now driven by an explicit `precise` flag so a single tap on
  // either mode both chooses the mode and runs the trim, instead of a checkbox plus a separate button.
  const trimWith = async (usePrecise: boolean) => {
    if (!file) return;
    setPrecise(usePrecise);
    setResultBlob(null);
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();

      // Fast mode: stream copy (near-instant, but cuts snap to the nearest keyframe).
      // Precise mode: re-encodes, so the cut lands exactly on your chosen times but takes longer.
      const args = usePrecise
        ? ["-ss", String(start), "-to", String(end), "-i", `input.${ext}`, "-c:v", "libx264", "-c:a", "aac", "output.mp4"]
        : ["-ss", String(start), "-to", String(end), "-i", `input.${ext}`, "-c", "copy", "output.mp4"];

      await ffmpeg.exec(args);
      checkCancelled();
      const data = await ffmpeg.readFile("output.mp4");
      setResultBlob(fileDataToBlob(data, "video/mp4"));
      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  const resetRange = () => {
    setStart(0);
    setEnd(duration);
  };

  const changeVideo = () => {
    setFile(null);
    setResultBlob(null);
    reset();
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <VideoDropzone onFile={handleFile} />
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
                <span className="text-muted-foreground font-normal"> ({duration.toFixed(2)}s Duration)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={changeVideo}
              disabled={busy}
              className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Choose another video
            </button>
          </div>

          <div className="space-y-2">
            <DualHandleTimeline file={file} duration={duration} start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
            <button
              onClick={resetRange}
              className="rounded-full border-2 border-foreground bg-card px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              Use full length
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {busy ? "Trimming…" : "Drag the handles above, then tap a mode to trim instantly."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => trimWith(m.precise)}
                  disabled={busy}
                  aria-pressed={precise === m.precise}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border-2 border-foreground px-4 py-3 text-left transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${
                    precise === m.precise
                      ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                      : "bg-card shadow-[2px_2px_0_0_var(--color-foreground)]"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                    <Scissors className="h-3.5 w-3.5 shrink-0" /> {m.label}
                  </span>
                  <span className={`text-xs font-medium ${precise === m.precise ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-trimmed.mp4`} label="Preview (trimmed)" />
    </div>
  );
}
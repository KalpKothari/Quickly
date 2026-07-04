import { useState } from "react";
import { toast } from "sonner";
import { Merge, Plus, RotateCcw } from "lucide-react";
import {
  fetchFile,
  getExtension,
  getVideoMetadata,
  buildMergeFilterComplex,
  type ClipMeta,
  type Transition,
} from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import ReorderableFileList from "@/components/video/ReorderableFileList";
import { fileDataToBlob } from "@/lib/blob";

const TRANSITION_OPTIONS: { key: Transition["type"]; label: string }[] = [
  { key: "cut", label: "Cut (no effect)" },
  { key: "fade", label: "Crossfade" },
  { key: "fadeblack", label: "Fade to Black" },
  { key: "wipeleft", label: "Wipe Left" },
  { key: "wiperight", label: "Wipe Right" },
  { key: "slideup", label: "Slide Up" },
  { key: "slidedown", label: "Slide Down" },
  { key: "dissolve", label: "Dissolve" },
  { key: "zoomin", label: "Zoom In" },
  { key: "circleopen", label: "Circle Open (pop)" },
  { key: "circleclose", label: "Circle Close" },
  { key: "radial", label: "Radial Wipe" },
  { key: "pixelize", label: "Pixelize" },
];

export default function MergeVideos() {
  const [files, setFiles] = useState<File[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const busy = status === "loading-engine" || status === "processing";

  const syncTransitions = (newFiles: File[]) => {
    const needed = Math.max(0, newFiles.length - 1);
    setTransitions((prev) => {
      const next = [...prev];
      while (next.length < needed) next.push({ type: "cut", duration: 1 });
      while (next.length > needed) next.pop();
      return next;
    });
  };

  const addFiles = (newList: FileList) => {
    const combined = [...files, ...Array.from(newList)];
    setFiles(combined);
    syncTransitions(combined);
    setResultBlob(null);
  };

  const handleReorder = (next: File[]) => {
    setFiles(next);
    setResultBlob(null);
  };

  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    syncTransitions(next);
    setResultBlob(null);
  };

  const clearAll = () => {
    setFiles([]);
    setTransitions([]);
    setResultBlob(null);
    reset();
  };

  const updateTransition = (idx: number, patch: Partial<Transition>) => {
    setTransitions((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setResultBlob(null);
  };

  // Convenience only — copies one junction's transition settings to every junction, so a
  // multi-clip merge doesn't require repeating the same picks over and over.
  const applyToAll = (patch: Partial<Transition>) => {
    setTransitions((prev) => prev.map((t) => ({ ...t, ...patch })));
    setResultBlob(null);
  };

  const allCuts = transitions.every((t) => t.type === "cut");

  const handleMerge = async () => {
    if (files.length < 2) {
      toast.error("Add at least two videos to merge.");
      return;
    }
    setResultBlob(null);
    const exts = files.map((f) => getExtension(f.name));

    await run(async (ffmpeg, checkCancelled) => {
      for (let i = 0; i < files.length; i++) {
        await ffmpeg.writeFile(`input${i}.${exts[i]}`, await fetchFile(files[i]));
        checkCancelled();
      }

      if (allCuts) {
        // Fast path: stream-copy concat. Only reliable when clips already share codec/resolution.
        const listContent = files.map((_, i) => `file 'input${i}.${exts[i]}'`).join("\n");
        await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(listContent));
        checkCancelled();
        try {
          await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "output.mp4"]);
        } catch {
          throw new Error(
            "Fast merge failed — your videos likely differ in format or resolution. Try adding a transition effect to at least one junction, which forces a compatibility re-encode.",
          );
        }
      } else {
        const metas: ClipMeta[] = [];
        for (const f of files) {
          const m = await getVideoMetadata(f);
          metas.push(m);
        }
        checkCancelled();

        const { filterComplex, videoOut, audioOut } = buildMergeFilterComplex(metas, transitions);
        const inputArgs = files.flatMap((_, i) => ["-i", `input${i}.${exts[i]}`]);

        await ffmpeg.exec([
          ...inputArgs,
          "-filter_complex", filterComplex,
          "-map", `[${videoOut}]`,
          "-map", `[${audioOut}]`,
          "-c:v", "libx264",
          "-c:a", "aac",
          "output.mp4",
        ]);
      }

      checkCancelled();
      const data = await ffmpeg.readFile("output.mp4");
      setResultBlob(fileDataToBlob(data, "video/mp4"));
      for (let i = 0; i < files.length; i++) await ffmpeg.deleteFile(`input${i}.${exts[i]}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Header Wrapper - Replaced with Capsule Pill tracking layout when files exist */}
      {files.length === 0 ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Plus className="h-3.5 w-3.5" />
            Add videos (in order)
          </span>
        </div>
      ) : (
        /* Metadata & Quick Reset Toolbar Layout - Capsule Pill Layout */
        <div className="rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-[3px_3px_0_0_var(--color-foreground)]">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
              1
            </span>
            <div className="text-sm font-semibold text-foreground truncate">
              Video Merge Queue
              <span className="text-muted-foreground font-normal"> ({files.length} Clips Loaded)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={clearAll}
            disabled={busy}
            className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Clear all
          </button>
        </div>
      )}

      {/* Drag-and-drop target for one or many clips at once, instead of a bare file input. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => document.getElementById("merge-file-input")?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragOver
            ? "border-primary bg-primary/10 shadow-[5px_5px_0_0_var(--color-foreground)]"
            : "border-foreground/40 bg-card hover:border-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
        }`}
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 shadow-[2px_2px_0_0_var(--color-foreground)]">
          <Plus className="h-5 w-5 text-primary" />
        </span>
        <p className="text-sm font-semibold">
          {files.length === 0
            ? "Drop videos here, or click to browse — add them in the order you want"
            : "Drop more videos here, or click to add another"}
        </p>
        <input
          id="merge-file-input"
          type="file"
          accept="video/*"
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {files.length > 0 && files.length < 2 && (
        <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
          Add at least one more video — merging needs two or more clips.
        </p>
      )}

      {files.length > 0 && <ReorderableFileList files={files} onReorder={handleReorder} onRemove={removeFile} />}

      {transitions.length > 0 && (
        <div className="space-y-3">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Transitions between clips (optional)
          </span>

          {transitions.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-foreground bg-secondary/40 p-3 shadow-[2px_2px_0_0_var(--color-foreground)]">
              <span className="text-xs font-bold">Apply one transition everywhere:</span>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyToAll({ type: e.target.value as Transition["type"] });
                  e.target.value = "";
                }}
                className="rounded-xl border-2 border-foreground bg-card px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {TRANSITION_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {transitions.map((t, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-xl border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <p className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                Between clip {idx + 1} and clip {idx + 2}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={t.type}
                  onChange={(e) => updateTransition(idx, { type: e.target.value as Transition["type"] })}
                  className="rounded-xl border-2 border-foreground bg-card px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
                >
                  {TRANSITION_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {t.type !== "cut" && (
                  <label className="flex items-center gap-2 rounded-full border-2 border-foreground bg-card px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)]">
                    Duration:
                    <input
                      type="range"
                      min={0.3}
                      max={3}
                      step={0.1}
                      value={t.duration}
                      onChange={(e) => updateTransition(idx, { duration: Number(e.target.value) })}
                      className="w-24 accent-primary"
                    />
                    {t.duration.toFixed(1)}s
                  </label>
                )}
              </div>
            </div>
          ))}
          {!allCuts && (
            <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              Since at least one transition is active, all clips will be normalized to the same resolution and frame rate — this takes longer than a plain merge but works even if your clips differ in size or format.
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleMerge}
        disabled={busy || files.length < 2}
        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
      >
        <Merge className="h-4 w-4" /> {status === "processing" ? "Merging…" : "Merge"}
      </button>

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename="merged-video.mp4" label="Preview (merged)" />
    </div>
  );
}
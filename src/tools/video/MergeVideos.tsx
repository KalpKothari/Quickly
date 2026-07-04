import { useState } from "react";
import { toast } from "sonner";
import { Merge, Plus } from "lucide-react";
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
];

export default function MergeVideos() {
  const [files, setFiles] = useState<File[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

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

  const updateTransition = (idx: number, patch: Partial<Transition>) => {
    setTransitions((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
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
      <label className="block">
        <span className="text-xs uppercase text-muted-foreground">Add videos (in order)</span>
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
        />
      </label>

      {files.length > 0 && <ReorderableFileList files={files} onReorder={handleReorder} onRemove={removeFile} />}

      {transitions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase text-muted-foreground">Transitions between clips (optional)</p>
          {transitions.map((t, idx) => (
            <div key={idx} className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">
                Between clip {idx + 1} and clip {idx + 2}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={t.type}
                  onChange={(e) => updateTransition(idx, { type: e.target.value as Transition["type"] })}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                >
                  {TRANSITION_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {t.type !== "cut" && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Duration:
                    <input
                      type="range"
                      min={0.3}
                      max={3}
                      step={0.1}
                      value={t.duration}
                      onChange={(e) => updateTransition(idx, { duration: Number(e.target.value) })}
                      className="w-24"
                    />
                    {t.duration.toFixed(1)}s
                  </label>
                )}
              </div>
            </div>
          ))}
          {!allCuts && (
            <p className="text-xs text-muted-foreground">
              Since at least one transition is active, all clips will be normalized to the same resolution and frame rate — this takes longer than a plain merge but works even if your clips differ in size or format.
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleMerge}
        disabled={status === "loading-engine" || status === "processing" || files.length < 2}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Merge className="h-4 w-4" /> {status === "processing" ? "Merging…" : "Merge"}
      </button>

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename="merged-video.mp4" label="Preview (merged)" />
    </div>
  );
}
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Merge, X, UploadCloud, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import { decodeAudioFile, mergeBuffersWithFades, audioBufferToWavBlob, downloadBlob } from "@/lib/audio-tools";
import AudioPreview from "@/components/audio/AudioPreview";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

export default function MergeAudio() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [fadeSec, setFadeSec] = useState(1.2);
  const [gapSec, setGapSec] = useState(0.3);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
    setPreviewBlob(null);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviewBlob(null);
  };

  const moveFile = (idx: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setPreviewBlob(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      toast.error("Add at least two audio files to merge.");
      return;
    }
    setBusy(true);
    try {
      const buffers = await Promise.all(files.map(decodeAudioFile));
      const rates = new Set(buffers.map((b) => b.sampleRate));
      if (rates.size > 1) {
        toast.warning("Files have different sample rates — merged audio may sound slightly off.");
      }
      const merged = mergeBuffersWithFades(buffers, fadeSec, gapSec);
      setPreviewBlob(audioBufferToWavBlob(merged));
      toast.success("Preview ready — have a listen before downloading.");
    } catch {
      toast.error("Couldn't merge these files.");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!previewBlob) return;
    downloadBlob(previewBlob, "merged-audio.wav");
    toast.success("Downloaded");
    
    // Trigger support prompt popup immediately following file download completion
    showSupportPrompt();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      {/* STEP 1 — add files */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Add audio files
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragActive
              ? "-translate-y-0.5 border-primary bg-primary/10 shadow-[5px_5px_0_0_var(--color-primary)]"
              : "border-foreground/40 bg-card hover:-translate-y-0.5 hover:border-foreground hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          }`}
        >
          <div
            className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-primary"
            style={{ transform: "rotate(-6deg)" }}
          >
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="text-sm font-bold">
            Drop audio files here or <span className="text-primary underline decoration-2 underline-offset-2">browse</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Add as many as you like — you can reorder them below</div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      </div>

      {/* STEP 2 — order & tune */}
      {files.length > 0 && (
        <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
            Put them in play order
          </p>

          <ul className="space-y-2">
            {files.map((f, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-sm shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                    {idx + 1}
                  </span>
                  <span className="truncate font-medium">{f.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => moveFile(idx, -1)}
                    disabled={idx === 0}
                    className="rounded-full border-2 border-foreground bg-card p-1 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Move ${f.name} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveFile(idx, 1)}
                    disabled={idx === files.length - 1}
                    className="rounded-full border-2 border-foreground bg-card p-1 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Move ${f.name} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeFile(idx)}
                    className="rounded-full border-2 border-foreground bg-card p-1 text-muted-foreground transition-transform hover:-translate-y-0.5 hover:bg-orange-500/20 hover:text-foreground"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {/* visual play-order preview */}
          {files.length >= 2 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-foreground/30 bg-secondary/30 p-3">
              {files.map((f, idx) => (
                <span key={idx} className="flex items-center gap-2">
                  <span className="max-w-[7rem] truncate rounded-full border-2 border-foreground bg-card px-2.5 py-1 text-[11px] font-bold">
                    {f.name}
                  </span>
                  {idx < files.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                </span>
              ))}
            </div>
          )}

          {files.length < 2 && (
            <p className="text-xs font-medium text-muted-foreground">Add one more file to start merging.</p>
          )}
        </div>
      )}

      {/* STEP 3 — transitions */}
      {files.length >= 2 && (
        <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">3</span>
            Fine-tune the transitions
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Fade duration: {fadeSec.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={fadeSec}
                onChange={(e) => {
                  setFadeSec(Number(e.target.value));
                  setPreviewBlob(null);
                }}
                className="mt-2 w-full accent-primary"
              />
              <span className="text-[11px] text-muted-foreground">How gradually one track fades into the next</span>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Gap between tracks: {gapSec.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={gapSec}
                onChange={(e) => {
                  setGapSec(Number(e.target.value));
                  setPreviewBlob(null);
                }}
                className="mt-2 w-full accent-primary"
              />
              <span className="text-[11px] text-muted-foreground">Silence inserted between tracks</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleMerge}
            disabled={busy || files.length < 2}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Merge className="h-4 w-4" /> {busy ? "Merging…" : "Merge"}
          </button>
        </div>
      )}

      {/* STEP 4 — preview & download */}
      {previewBlob && (
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">4</span>
          Preview and download
        </p>
      )}
      <AudioPreview blob={previewBlob} label="Preview (merged)" onDownload={handleDownload} />
    </div>
  );
}
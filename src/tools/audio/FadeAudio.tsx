import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Waves, UploadCloud } from "lucide-react";
import { decodeAudioFile, applyFade, audioBufferToWavBlob, downloadBlob } from "@/lib/audio-tools";
import AudioPreview from "@/components/audio/AudioPreview";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

type Direction = "in" | "out" | "both";

export default function FadeAudio() {
  const { showSupportPrompt } = useSupportPrompt();
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("in");
  const [duration, setDuration] = useState(2);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleApply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buffer = await decodeAudioFile(file);
      let faded = buffer;
      if (direction === "both") {
        // apply fade in first, then fade out on the result
        faded = applyFade(faded, duration, "in");
        faded = applyFade(faded, duration, "out");
      } else {
        faded = applyFade(faded, duration, direction);
      }
      setPreviewBlob(audioBufferToWavBlob(faded));
      toast.success("Preview ready — have a listen before downloading.");
    } catch {
      toast.error("Couldn't process this file.");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!previewBlob || !file) return;
    downloadBlob(previewBlob, `${file.name.replace(/\.[^.]+$/, "")}-fade-${direction}.wav`);
    toast.success("Downloaded");
    
    // Trigger support prompt popup immediately following file download completion
    showSupportPrompt();
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    setPreviewBlob(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const directionLabel = (d: Direction) =>
    d === "in" ? "Fade In" : d === "out" ? "Fade Out" : "Both";

  return (
    <div className="space-y-6">
      {/* STEP 1 — upload */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Choose an audio file
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
            {file ? file.name : (
              <>Drop an audio file here or <span className="text-primary underline decoration-2 underline-offset-2">browse</span></>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">MP3, WAV, M4A and most common formats</div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
            className="hidden"
          />
        </div>
      </div>

      {originalUrl && (
        <div className="space-y-2 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Original
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={originalUrl} controls className="w-full rounded-lg" />
        </div>
      )}

      {/* STEP 2 — choose direction & shape */}
      {file && (
        <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
            Pick the fade shape
          </p>

          <div className="inline-flex rounded-xl border-2 border-foreground bg-background p-1">
            {(["in", "out", "both"] as Direction[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDirection(d);
                  setPreviewBlob(null);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                  direction === d
                    ? "border-2 border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                    : "border-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {directionLabel(d)}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Fade duration: {duration.toFixed(1)}s{direction === "both" ? " (each side)" : ""}
            </span>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>

          <button
            type="button"
            onClick={handleApply}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Waves className="h-4 w-4" /> {busy ? "Processing…" : `Apply ${directionLabel(direction)}`}
          </button>
        </div>
      )}

      {/* STEP 3 — preview & download */}
      {previewBlob && (
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">3</span>
          Preview and download
        </p>
      )}
      <AudioPreview blob={previewBlob} label={`Preview (fade ${direction})`} onDownload={handleDownload} />
    </div>
  );
}
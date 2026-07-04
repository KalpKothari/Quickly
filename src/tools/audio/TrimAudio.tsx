import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Scissors, UploadCloud, RotateCcw } from "lucide-react";
import { decodeAudioFile, trimBuffer, audioBufferToWavBlob, downloadBlob, formatTime } from "@/lib/audio-tools";
import AudioPreview from "@/components/audio/AudioPreview";

export default function TrimAudio() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
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

  const onFile = async (f: File) => {
    setFile(f);
    setPreviewBlob(null);
    setBusy(true);
    try {
      const buf = await decodeAudioFile(f);
      setBuffer(buf);
      setStart(0);
      setEnd(buf.duration);
    } catch {
      toast.error("Couldn't read this audio file.");
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const handleTrim = () => {
    if (!buffer) return;
    if (end <= start) {
      toast.error("End time must be after start time.");
      return;
    }
    const trimmed = trimBuffer(buffer, start, end);
    setPreviewBlob(audioBufferToWavBlob(trimmed));
    toast.success("Preview ready — have a listen before downloading.");
  };

  const handleDownload = () => {
    if (!previewBlob) return;
    downloadBlob(previewBlob, `${file?.name.replace(/\.[^.]+$/, "") || "trimmed"}-trimmed.wav`);
    toast.success("Downloaded");
  };

  const resetSelection = () => {
    if (!buffer) return;
    setStart(0);
    setEnd(buffer.duration);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const selectionValid = !!buffer && end > start;
  const selectionSeconds = buffer ? Math.max(0, end - start) : 0;

  return (
    <div className="space-y-6">
      <style>{`
        .qk-range { pointer-events: none; }
        .qk-range::-webkit-slider-thumb {
          pointer-events: auto;
          -webkit-appearance: none;
          appearance: none;
          height: 22px;
          width: 22px;
          border-radius: 9999px;
          border: 2.5px solid var(--color-foreground);
          background: var(--color-card, #fff);
          box-shadow: 2px 2px 0 0 var(--color-foreground);
          cursor: grab;
        }
        .qk-range::-moz-range-thumb {
          pointer-events: auto;
          height: 22px;
          width: 22px;
          border-radius: 9999px;
          border: 2.5px solid var(--color-foreground);
          background: var(--color-card, #fff);
          box-shadow: 2px 2px 0 0 var(--color-foreground);
          cursor: grab;
        }
        .qk-range::-webkit-slider-runnable-track { background: transparent; }
        .qk-range::-moz-range-track { background: transparent; }
      `}</style>

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
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-primary" style={{ transform: "rotate(-6deg)" }}>
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
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="hidden"
          />
        </div>
      </div>

      {busy && (
        <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Reading audio…
        </p>
      )}

      {originalUrl && (
        <div className="space-y-2 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Original
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={originalUrl} controls className="w-full rounded-lg" />
        </div>
      )}

      {/* STEP 2 — pick the section to keep */}
      {buffer && (
        <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
              Drag the handles to pick what to keep
            </p>
            <button
              onClick={resetSelection}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-transform hover:-translate-y-0.5 hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Use full clip
            </button>
          </div>

          {/* dual-handle trim bar */}
          <div className="px-1">
            <div className="relative h-6">
              <div className="absolute top-1/2 h-2.5 w-full -translate-y-1/2 rounded-full border-2 border-foreground bg-secondary" />
              <div
                className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary to-fuchsia-500"
                style={{
                  left: `${(start / buffer.duration) * 100}%`,
                  width: `${(Math.max(0, end - start) / buffer.duration) * 100}%`,
                }}
              />
              <input
                type="range"
                min={0}
                max={buffer.duration}
                step={0.1}
                value={start}
                onChange={(e) => setStart(Math.min(Number(e.target.value), end))}
                className="qk-range absolute inset-0 w-full appearance-none bg-transparent"
                aria-label="Start time"
              />
              <input
                type="range"
                min={0}
                max={buffer.duration}
                step={0.1}
                value={end}
                onChange={(e) => setEnd(Math.max(Number(e.target.value), start))}
                className="qk-range absolute inset-0 w-full appearance-none bg-transparent"
                aria-label="End time"
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] font-medium text-muted-foreground">
              <span>0:00</span>
              <span>{formatTime(buffer.duration)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-bold">
              Start: {formatTime(start)}
            </span>
            <span className="rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-bold">
              End: {formatTime(end)}
            </span>
            <span className="rounded-full border-2 border-foreground bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
              Keeping {formatTime(selectionSeconds)}
            </span>
          </div>

          <button
            onClick={handleTrim}
            disabled={!selectionValid}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Scissors className="h-4 w-4" /> Trim
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
      <AudioPreview blob={previewBlob} label="Preview (trimmed)" onDownload={handleDownload} />
    </div>
  );
}
import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Volume2, UploadCloud } from "lucide-react";
import { decodeAudioFile, applyVolume, audioBufferToWavBlob, downloadBlob } from "@/lib/audio-tools";
import AudioPreview from "@/components/audio/AudioPreview";

export default function VolumeChanger() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [percent, setPercent] = useState(100);
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
      const adjusted = applyVolume(buffer, percent / 100);
      setPreviewBlob(audioBufferToWavBlob(adjusted));
      toast.success("Preview ready — have a listen before downloading.");
    } catch {
      toast.error("Couldn't process this file.");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!previewBlob || !file) return;
    downloadBlob(previewBlob, `${file.name.replace(/\.[^.]+$/, "")}-volume.wav`);
    toast.success("Downloaded");
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

  const riskZone = percent > 150;

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

      {/* STEP 2 — set volume */}
      {file && (
        <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
              Set the new volume
            </p>
            <span
              className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold ${
                riskZone ? "bg-orange-500/20 text-orange-600" : "bg-primary/15 text-primary"
              }`}
            >
              {percent}% {riskZone ? "— risk of clipping" : percent === 100 ? "— original" : ""}
            </span>
          </div>

          {/* color-coded safe / risk meter */}
          <div className="px-1">
            <div className="relative h-3 w-full overflow-hidden rounded-full border-2 border-foreground">
              <div className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: "50%" }} />
              <div className="absolute inset-y-0 bg-orange-500/25" style={{ left: "50%", right: 0 }} />
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-fuchsia-500"
                style={{ width: `${Math.min(100, (percent / 300) * 100)}%` }}
              />
              {/* 100% marker */}
              <div className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${(100 / 300) * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>0%</span>
              <span>100% original</span>
              <span>300%</span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={300}
            step={5}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Volume percent"
          />

          {riskZone && (
            <p className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-orange-500/50 bg-orange-500/10 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              ⚠️ Above 150% may introduce clipping/distortion on loud sections.
            </p>
          )}

          <button
            onClick={handleApply}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Volume2 className="h-4 w-4" /> {busy ? "Processing…" : "Apply"}
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
      <AudioPreview blob={previewBlob} label="Preview (volume adjusted)" onDownload={handleDownload} />
    </div>
  );
}
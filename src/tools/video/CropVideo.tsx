import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crop, RotateCcw } from "lucide-react";
import { fetchFile, getExtension, getVideoMetadata, toEven } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import CropBox, { type CropRect } from "@/components/video/CropBox";
import { fileDataToBlob } from "@/lib/blob";

const DEFAULT_RECT: CropRect = { x: 10, y: 10, w: 80, h: 80 };

export default function CropVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<CropRect>(DEFAULT_RECT);
  const [aspectKey, setAspectKey] = useState("free");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const busy = status === "loading-engine" || status === "processing";

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const ASPECTS = [
    { key: "free", label: "Free", value: null as number | null },
    { key: "original", label: "Original", value: meta ? meta.width / meta.height : null },
    { key: "1:1", label: "1:1", value: 1 },
    { key: "16:9", label: "16:9", value: 16 / 9 },
    { key: "9:16", label: "9:16", value: 9 / 16 },
    { key: "4:3", label: "4:3", value: 4 / 3 },
  ];

  const handleFile = async (f: File) => {
    setResultBlob(null);
    reset();
    try {
      const m = await getVideoMetadata(f);
      setFile(f);
      setMeta(m);
      setRect(DEFAULT_RECT);
      setAspectKey("free");
    } catch {
      toast.error("Couldn't read this video's metadata.");
    }
  };

  const handleCrop = async () => {
    if (!file || !meta) return;
    setResultBlob(null);
    const ext = getExtension(file.name);

    // Convert percentage-space crop rect into real pixel coordinates.
    const cropW = toEven((rect.w / 100) * meta.width);
    const cropH = toEven((rect.h / 100) * meta.height);
    const cropX = Math.floor((rect.x / 100) * meta.width);
    const cropY = Math.floor((rect.y / 100) * meta.height);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();
      await ffmpeg.exec([
        "-i", `input.${ext}`,
        "-vf", `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
        "-c:a", "copy",
        "output.mp4",
      ]);
      checkCancelled();
      const data = await ffmpeg.readFile("output.mp4");
      setResultBlob(fileDataToBlob(data, "video/mp4"));
      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  const centerBox = () => {
    setRect((prev) => ({ ...prev, x: (100 - prev.w) / 2, y: (100 - prev.h) / 2 }));
  };

  const resetCrop = () => {
    setRect(DEFAULT_RECT);
    setAspectKey("free");
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
                <span className="text-muted-foreground font-normal"> ({meta ? `${meta.width}x${meta.height}` : "Dimensions Unknown"})</span>
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

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">1. Pick a shape (optional)</p>
            <div className="flex flex-wrap gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => {
                    setAspectKey(a.key);
                    if (a.value) {
                      const containerAspect = 16 / 9;
                      const targetPctAspect = a.value / containerAspect;
                      setRect((prev) => {
                        const h = prev.w / targetPctAspect;
                        return { x: prev.x, y: prev.y, w: prev.w, h: Math.min(100 - prev.y, h) };
                      });
                    }
                  }}
                  disabled={busy}
                  aria-pressed={aspectKey === a.key}
                  className={`rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${
                    aspectKey === a.key
                      ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                      : "bg-card shadow-[2px_2px_0_0_var(--color-foreground)]"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">2. Drag the box to reposition, or drag a corner to resize</p>
            {videoUrl && (
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border-2 border-foreground bg-black shadow-[3px_3px_0_0_var(--color-foreground)]">
                <video src={videoUrl} className="h-full w-full object-contain" muted playsInline />
                <CropBox aspect={aspectKey === "free" ? null : ASPECTS.find((a) => a.key === aspectKey)!.value} value={rect} onChange={setRect} />
              </div>
            )}
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={centerBox}
                disabled={busy}
                className="rounded-full border border-foreground/30 bg-transparent px-2 py-0.5 text-xs font-semibold text-foreground/70 transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
              >
                Center box
              </button>
              <button
                type="button"
                onClick={resetCrop}
                disabled={busy}
                className="rounded-full border border-foreground/30 bg-transparent px-2 py-0.5 text-xs font-semibold text-foreground/70 transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCrop}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
          >
            <Crop className="h-4 w-4" /> {busy ? "Cropping…" : "Crop"}
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-cropped.mp4`} label="Preview (cropped)" />
    </div>
  );
}
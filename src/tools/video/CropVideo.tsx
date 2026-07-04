import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crop } from "lucide-react";
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

  return (
    <div className="space-y-6">
      {!file ? (
        <VideoDropzone onFile={handleFile} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selected: {file.name}</p>

          <div className="flex flex-wrap gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.key}
                onClick={() => {
                  setAspectKey(a.key);
                  if (a.value) {
                    // Re-fit the current rect to the new aspect, anchored at its current top-left.
                    const containerAspect = 16 / 9; // matches the video container below
                    const targetPctAspect = a.value / containerAspect;
                    setRect((prev) => {
                      const h = prev.w / targetPctAspect;
                      return { x: prev.x, y: prev.y, w: prev.w, h: Math.min(100 - prev.y, h) };
                    });
                  }
                }}
                className={`rounded-xl border px-4 py-2 text-sm transition ${
                  aspectKey === a.key
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {videoUrl && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={videoUrl} className="h-full w-full object-contain" muted playsInline />
              <CropBox aspect={aspectKey === "free" ? null : ASPECTS.find((a) => a.key === aspectKey)!.value} value={rect} onChange={setRect} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Drag the box to reposition, or drag a corner to resize.
          </p>

          <button
            onClick={handleCrop}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Crop className="h-4 w-4" /> Crop
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-cropped.mp4`} label="Preview (cropped)" />
    </div>
  );
}
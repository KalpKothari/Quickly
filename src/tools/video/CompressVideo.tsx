import { useState } from "react";
import { toast } from "sonner";
import { FileArchive, RotateCcw } from "lucide-react";
import { getFFmpeg, fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";

const PRESETS = [
  { key: "light", label: "Light (best quality)", crf: 23 },
  { key: "balanced", label: "Balanced", crf: 28 },
  { key: "high", label: "High compression (smallest file)", crf: 34 },
];

export default function CompressVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState(PRESETS[1].key);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const busy = status === "loading-engine" || status === "processing";

  // Same compression pipeline as before — now driven by an explicit preset key so it can be
  // triggered straight from file drop or from a single tap on a preset, no separate step needed.
  const compressWith = async (presetKey: string, sourceFile: File) => {
    setPreset(presetKey);
    setResultBlob(null);
    const crf = PRESETS.find((p) => p.key === presetKey)!.crf;
    const ext = getExtension(sourceFile.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(sourceFile));
      checkCancelled();
      await ffmpeg.exec([
        "-i", `input.${ext}`,
        "-vcodec", "libx264",
        "-crf", String(crf),
        "-preset", "veryfast",
        "-acodec", "aac",
        "output.mp4",
      ]);
      checkCancelled();

      const data = await ffmpeg.readFile("output.mp4");

      let blob: Blob;

      if (typeof data === "string") {
        blob = new Blob([data], {
          type: "video/mp4",
        });
      } else {
        // Create a completely new Uint8Array
        const copy = new Uint8Array(data.length);
        copy.set(data);

        blob = new Blob([copy], {
          type: "video/mp4",
        });
      }

      setResultBlob(blob);

      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp4");
    });
  };

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
    // Compress immediately with the current default preset — dropping a video is the only
    // step needed to get a result; picking a different preset below just redoes it.
    compressWith(preset, f);
  };

  const handlePresetTap = (key: string) => {
    if (!file || busy) return;
    compressWith(key, file);
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
                <span className="text-muted-foreground font-normal"> (Active Target Video)</span>
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
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {busy ? "Compressing…" : "Tap a setting to compress instantly — no extra click needed."}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePresetTap(p.key)}
                  disabled={busy}
                  aria-pressed={preset === p.key}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground px-4 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${
                    preset === p.key
                      ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                      : "bg-card shadow-[2px_2px_0_0_var(--color-foreground)]"
                  }`}
                >
                  <FileArchive className="h-3.5 w-3.5 shrink-0" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "compressed"}-compressed.mp4`} label="Preview (compressed)" />
    </div>
  );
}
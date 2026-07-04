import { useState } from "react";
import { toast } from "sonner";
import { RotateCw, RotateCcw } from "lucide-react";
import { fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";

const ROTATIONS = [
  { key: "cw90", label: "Rotate 90° CW", filter: "transpose=1" },
  { key: "ccw90", label: "Rotate 90° CCW", filter: "transpose=2" },
  { key: "180", label: "Rotate 180°", filter: "transpose=1,transpose=1" },
  { key: "hflip", label: "Flip Horizontal", filter: "hflip" },
  { key: "vflip", label: "Flip Vertical", filter: "vflip" },
];

export default function RotateVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [rotation, setRotation] = useState(ROTATIONS[0].key);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const busy = status === "loading-engine" || status === "processing";

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  // Same rotation pipeline as before — now driven by an explicit key so a single tap on an
  // option both selects it and runs it, instead of picking then pressing a separate button.
  const rotateWith = async (key: string, sourceFile: File) => {
    setRotation(key);
    setResultBlob(null);
    const filter = ROTATIONS.find((r) => r.key === key)!.filter;
    const ext = getExtension(sourceFile.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(sourceFile));
      checkCancelled();
      await ffmpeg.exec(["-i", `input.${ext}`, "-vf", filter, "-c:a", "copy", "output.mp4"]);
      checkCancelled();
      
      const data = await ffmpeg.readFile("output.mp4");

      let blob: Blob;

      if (typeof data === "string") {
        blob = new Blob([data], {
          type: "video/mp4",
        });
      } else {
        // Copy into a fresh Uint8Array backed by a normal ArrayBuffer
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

  const handleOptionTap = (key: string) => {
    if (!file || busy) return;
    rotateWith(key, file);
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
              {busy ? "Rotating…" : "Tap an option to apply it instantly — no extra click needed."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROTATIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => handleOptionTap(r.key)}
                  disabled={busy}
                  aria-pressed={rotation === r.key}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground px-4 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${
                    rotation === r.key
                      ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                      : "bg-card shadow-[2px_2px_0_0_var(--color-foreground)]"
                  }`}
                >
                  <RotateCw className="h-3.5 w-3.5 shrink-0" />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "rotated"}-rotated.mp4`} label="Preview (rotated)" />
    </div>
  );
}
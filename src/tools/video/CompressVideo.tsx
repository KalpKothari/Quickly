import { useState } from "react";
import { toast } from "sonner";
import { FileArchive } from "lucide-react";
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

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleCompress = async () => {
    if (!file) return;
    setResultBlob(null);
    const crf = PRESETS.find((p) => p.key === preset)!.crf;
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
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

  return (
    <div className="space-y-6">
      {!file ? (
        <VideoDropzone onFile={handleFile} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selected: {file.name}</p>

          <div className="grid gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-xl border px-4 py-3 text-sm transition ${
                  preset === p.key
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleCompress}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <FileArchive className="h-4 w-4" /> Compress
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "compressed"}-compressed.mp4`} label="Preview (compressed)" />
    </div>
  );
}
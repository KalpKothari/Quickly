import { useState } from "react";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
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

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleRotate = async () => {
    if (!file) return;
    setResultBlob(null);
    const filter = ROTATIONS.find((r) => r.key === rotation)!.filter;
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
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

  return (
    <div className="space-y-6">
      {!file ? (
        <VideoDropzone onFile={handleFile} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selected: {file.name}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {ROTATIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRotation(r.key)}
                className={`rounded-xl border px-4 py-3 text-sm transition ${
                  rotation === r.key
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleRotate}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RotateCw className="h-4 w-4" /> Rotate
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "rotated"}-rotated.mp4`} label="Preview (rotated)" />
    </div>
  );
}
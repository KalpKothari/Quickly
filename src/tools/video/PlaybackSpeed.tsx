import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { fetchFile, getExtension, buildAtempoChain } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import { fileDataToBlob } from "@/lib/blob";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export default function PlaybackSpeed() {
  const [file, setFile] = useState<File | null>(null);
  const [speed, setSpeed] = useState(1);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleApply = async () => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);
    const videoFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`;
    const audioFilter = buildAtempoChain(speed);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();
      await ffmpeg.exec([
        "-i", `input.${ext}`,
        "-filter_complex", `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
        "-map", "[v]", "-map", "[a]",
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

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                  speed === s
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            onClick={handleApply}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" /> Apply Speed
          </button>
          {(speed === 0.25 || speed === 4) && (
            <p className="text-xs text-muted-foreground">
              Note: extreme speeds ({speed}x) are chained from multiple filter passes and may alter pitch slightly.
            </p>
          )}
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-${speed}x.mp4`} label="Preview (speed adjusted)" />
    </div>
  );
}
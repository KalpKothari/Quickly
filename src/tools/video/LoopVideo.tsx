import { useState } from "react";
import { Infinity as InfinityIcon } from "lucide-react";
import { fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import { fileDataToBlob } from "@/lib/blob";

export default function LoopVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [loops, setLoops] = useState(2);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleLoop = async () => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();
      // -stream_loop N means "play N additional times", so total plays = N+1.
      await ffmpeg.exec([
        "-stream_loop", String(loops - 1),
        "-i", `input.${ext}`,
        "-c", "copy",
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

          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Number of loops: {loops}x</span>
            <input
              type="range"
              min={2}
              max={10}
              step={1}
              value={loops}
              onChange={(e) => setLoops(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>

          <button
            onClick={handleLoop}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <InfinityIcon className="h-4 w-4" /> Loop {loops}x
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-looped.mp4`} label="Preview (looped)" />
    </div>
  );
}
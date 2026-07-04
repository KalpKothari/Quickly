import { useState } from "react";
import { Rewind } from "lucide-react";
import { fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import { fileDataToBlob } from "@/lib/blob";

export default function ReverseVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleReverse = async () => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();
      // Reverse decodes the entire clip into memory frame-by-frame — long clips
      // (several minutes+) may be slow or hit memory limits in the browser tab.
      await ffmpeg.exec(["-i", `input.${ext}`, "-vf", "reverse", "-af", "areverse", "output.mp4"]);
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
          <p className="text-xs text-muted-foreground">
            Best for short clips (under ~1 minute) — longer videos may take a while or use significant memory.
          </p>
          <button
            onClick={handleReverse}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Rewind className="h-4 w-4" /> Reverse
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-reversed.mp4`} label="Preview (reversed)" />
    </div>
  );
}
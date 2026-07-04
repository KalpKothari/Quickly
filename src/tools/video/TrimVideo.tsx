import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import { fetchFile, getExtension, getVideoDuration } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import VideoPreview from "@/components/video/VideoPreview";
import DualHandleTimeline from "@/components/video/DualHandleTimeline";
import { fileDataToBlob } from "@/lib/blob";

export default function TrimVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [precise, setPrecise] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const handleFile = async (f: File) => {
    setResultBlob(null);
    reset();
    try {
      const dur = await getVideoDuration(f);
      setFile(f);
      setDuration(dur);
      setStart(0);
      setEnd(dur);
    } catch {
      toast.error("Couldn't read this video's duration.");
    }
  };

  const handleTrim = async () => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();

      // Fast mode: stream copy (near-instant, but cuts snap to the nearest keyframe).
      // Precise mode: re-encodes, so the cut lands exactly on your chosen times but takes longer.
      const args = precise
        ? ["-ss", String(start), "-to", String(end), "-i", `input.${ext}`, "-c:v", "libx264", "-c:a", "aac", "output.mp4"]
        : ["-ss", String(start), "-to", String(end), "-i", `input.${ext}`, "-c", "copy", "output.mp4"];

      await ffmpeg.exec(args);
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

          <DualHandleTimeline file={file} duration={duration} start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} className="h-4 w-4 rounded" />
            <span>Precise cut (slower, re-encodes for an exact trim point)</span>
          </label>

          <button
            onClick={handleTrim}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Scissors className="h-4 w-4" /> Trim
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />
      <VideoPreview blob={resultBlob} filename={`${file?.name.replace(/\.[^.]+$/, "") || "video"}-trimmed.mp4`} label="Preview (trimmed)" />
    </div>
  );
}
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScissorsSquare, Plus, X, Download } from "lucide-react";
import { fetchFile, getExtension, getVideoDuration, formatTimecode } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import { fileDataToBlob } from "@/lib/blob";

interface Segment {
  blob: Blob;
  label: string;
}

export default function SplitVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markers, setMarkers] = useState<number[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
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

  const handleFile = async (f: File) => {
    setSegments([]);
    setMarkers([]);
    reset();
    try {
      const dur = await getVideoDuration(f);
      setFile(f);
      setDuration(dur);
    } catch {
      toast.error("Couldn't read this video's duration.");
    }
  };

  const addMarker = () => {
    if (currentTime <= 0.2 || currentTime >= duration - 0.2) {
      toast.error("Pick a point that isn't right at the very start or end.");
      return;
    }
    if (markers.some((m) => Math.abs(m - currentTime) < 0.3)) {
      toast.error("You already have a split point near here.");
      return;
    }
    setMarkers((prev) => [...prev, currentTime].sort((a, b) => a - b));
  };

  const removeMarker = (idx: number) => {
    setMarkers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSplit = async () => {
    if (!file) return;
    if (markers.length === 0) {
      toast.error("Add at least one split point.");
      return;
    }
    setSegments([]);
    const ext = getExtension(file.name);
    const points = [0, ...markers, duration];

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
      checkCancelled();

      const results: Segment[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const segStart = points[i];
        const segEnd = points[i + 1];
        const outName = `segment_${i}.mp4`;
        await ffmpeg.exec(["-ss", String(segStart), "-to", String(segEnd), "-i", `input.${ext}`, "-c", "copy", outName]);
        checkCancelled();
        const data = await ffmpeg.readFile(outName);
        results.push({ blob: fileDataToBlob(data, "video/mp4"), label: `Part ${i + 1} (${formatTimecode(segStart)}–${formatTimecode(segEnd)})` });
        await ffmpeg.deleteFile(outName);
      }
      setSegments(results);
      await ffmpeg.deleteFile(`input.${ext}`);
    });
  };

  const downloadSegment = (seg: Segment, idx: number) => {
    const url = URL.createObjectURL(seg.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(/\.[^.]+$/, "") || "video"}-part${idx + 1}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <VideoDropzone onFile={handleFile} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selected: {file.name}</p>

          {videoUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          )}

          <div className="relative h-3 w-full rounded-full bg-secondary">
            {markers.map((m, idx) => (
              <div
                key={idx}
                className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-primary"
                style={{ left: `${(m / duration) * 100}%` }}
              />
            ))}
          </div>

          <button
            onClick={addMarker}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2 text-sm hover:bg-secondary"
          >
            <Plus className="h-4 w-4" /> Add split point at {formatTimecode(currentTime)}
          </button>

          {markers.length > 0 && (
            <ul className="space-y-2">
              {markers.map((m, idx) => (
                <li key={idx} className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-2 text-sm">
                  <span>Split at {formatTimecode(m)}</span>
                  <button onClick={() => removeMarker(idx)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={handleSplit}
            disabled={status === "loading-engine" || status === "processing" || markers.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <ScissorsSquare className="h-4 w-4" /> Split into {markers.length + 1} parts
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />

      {segments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase text-muted-foreground">Segments</p>
          {segments.map((seg, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3">
              <span className="text-sm">{seg.label}</span>
              <button
                onClick={() => downloadSegment(seg, idx)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
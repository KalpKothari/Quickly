import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScissorsSquare, Plus, X, Download, Video, MapPin, RotateCcw } from "lucide-react";
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
  const [files, setFiles] = useState<File[]>([]); // standardized to track resets cleaner
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markers, setMarkers] = useState<number[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  const busy = status === "loading-engine" || status === "processing";

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

  const handleResetWorkspace = () => {
    setFile(null);
    setVideoUrl(null);
    setDuration(0);
    setCurrentTime(0);
    setMarkers([]);
    setSegments([]);
    reset();
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

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetPercentage = clickX / rect.width;
    const targetTime = targetPercentage * duration;
    
    const videoEl = document.querySelector("video");
    if (videoEl) {
      videoEl.currentTime = targetTime;
    }
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
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Video className="h-3.5 w-3.5" />
            Video Splitter
          </span>
        </div>
      </div>

      {!file ? (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <VideoDropzone onFile={handleFile} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metadata & Workspace Actions Controller Layout - Capsule Pill Layout */}
          <div className="rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-[3px_3px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                1
              </span>
              <div className="text-sm font-semibold text-foreground truncate">
                {file.name}
                <span className="text-muted-foreground font-normal"> ({formatTimecode(duration)} Total Duration)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetWorkspace}
              disabled={busy}
              className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Change Source
            </button>
          </div>

          {/* Video Player Display Container */}
          {videoUrl && (
            <div className="overflow-hidden rounded-2xl border-2 border-foreground bg-black shadow-[5px_5px_0_0_var(--color-foreground)]">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={videoUrl}
                controls
                className="w-full aspect-video object-contain"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              />
            </div>
          )}

          {/* Interactive Marker Timeline Bar */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase text-foreground/50 px-1">
              Click timeline to seek video player target
            </div>
            <div 
              onClick={handleTimelineClick}
              className="relative h-5 w-full rounded-full border-2 border-foreground bg-card overflow-visible cursor-pointer group"
            >
              {/* Current Time Tracker Indicator line */}
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/30 pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
              {markers.map((m, idx) => (
                <div
                  key={idx}
                  onClick={(e) => e.stopPropagation()} 
                  className="absolute top-1/2 h-7 w-2 -translate-x-1/2 -translate-y-1/2 rounded border border-foreground bg-primary shadow-[1px_1px_0_0_var(--color-foreground)] z-10 cursor-default"
                  style={{ left: `${(m / duration) * 100}%` }}
                  title={`Split point at ${formatTimecode(m)}`}
                />
              ))}
            </div>
          </div>

          {/* Control Actions Panel */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={addMarker}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-card px-5 py-3.5 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" /> Drop Split Marker Here ({formatTimecode(currentTime)})
            </button>

            <button
              type="button"
              onClick={handleSplit}
              disabled={busy || markers.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <ScissorsSquare className="h-4 w-4" /> Process &amp; Split into {markers.length + 1} Parts
            </button>
          </div>

          {/* Dynamic Split Queue List */}
          {markers.length > 0 && (
            <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 mb-3 px-1">
                Active Split Markers
              </div>
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {markers.map((m, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded-xl border-2 border-foreground bg-gradient-to-r from-violet-500/5 to-indigo-500/5 px-4 py-2.5 text-sm font-semibold">
                    <span className="font-mono text-foreground inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      Split Time: {formatTimecode(m)}
                    </span>
                    <button 
                      type="button"
                      onClick={() => removeMarker(idx)} 
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-foreground bg-destructive text-destructive-foreground shadow-[1px_1px_0_0_var(--color-foreground)] hover:-translate-y-0.5 transition-transform"
                      aria-label="Remove split marker"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />

      {/* Generated Output Segments Container */}
      {segments.length > 0 && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 px-1">
            Generated Output Segments
          </div>
          <div className="space-y-2">
            {segments.map((seg, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-3 font-semibold">
                <span className="text-sm text-foreground">{seg.label}</span>
                <button
                  type="button"
                  onClick={() => downloadSegment(seg, idx)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-foreground bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                >
                  <Download className="h-3.5 w-3.5" /> Download Part
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
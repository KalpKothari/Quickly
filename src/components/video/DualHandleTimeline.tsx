import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimecode } from "@/lib/ffmpeg-core";

interface DualHandleTimelineProps {
  file: File;
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

export default function DualHandleTimeline({ file, duration, start, end, onChange }: DualHandleTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const percentToTime = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration],
  );

  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (!dragging) return;
      const t = percentToTime(clientX);
      if (dragging === "start") {
        const newStart = Math.min(t, end - 0.1);
        onChange(Math.max(0, newStart), end);
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, newStart);
      } else {
        const newEnd = Math.max(t, start + 0.1);
        onChange(start, Math.min(duration, newEnd));
        if (videoRef.current) videoRef.current.currentTime = Math.min(duration, newEnd);
      }
    },
    [dragging, start, end, duration, onChange, percentToTime],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handlePointerMove(e.touches[0].clientX);
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, handlePointerMove]);

  const startPct = (start / duration) * 100;
  const endPct = (end / duration) * 100;

  return (
    <div className="space-y-3">
      {videoUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video ref={videoRef} src={videoUrl} controls className="w-full rounded-lg" />
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Start: {formatTimecode(start)}</span>
        <span>Duration: {formatTimecode(end - start)}</span>
        <span>End: {formatTimecode(end)}</span>
      </div>

      <div ref={trackRef} className="relative h-3 w-full rounded-full bg-secondary select-none touch-none">
        <div
          className="absolute h-full rounded-full bg-primary/40"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        {(["start", "end"] as const).map((handle) => {
          const pct = handle === "start" ? startPct : endPct;
          return (
            <div
              key={handle}
              onMouseDown={() => setDragging(handle)}
              onTouchStart={() => setDragging(handle)}
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-primary bg-background shadow active:cursor-grabbing"
              style={{ left: `${pct}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
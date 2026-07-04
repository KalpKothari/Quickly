import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";
import { getMaxFileSizeBytes, formatBytes } from "@/lib/ffmpeg-core";
import { toast } from "sonner";

interface VideoDropzoneProps {
  onFile: (file: File) => void;
  accept?: string;
  label?: string;
}

export default function VideoDropzone({ onFile, accept = "video/*", label = "Drop a video here, or click to browse" }: VideoDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const max = getMaxFileSizeBytes();
      if (file.size > max) {
        toast.error(`File is ${formatBytes(file.size)} — limit is ${formatBytes(max)} on this device.`);
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      onClick={() => document.getElementById("video-file-input")?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
        dragOver
          ? "border-primary bg-primary/10 shadow-[5px_5px_0_0_var(--color-foreground)]"
          : "border-foreground/40 bg-card hover:border-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
      }`}
    >
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 shadow-[2px_2px_0_0_var(--color-foreground)]">
        <UploadCloud className="h-6 w-6 text-primary" />
      </span>
      <p className="text-sm font-semibold">{label}</p>
      <input
        id="video-file-input"
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
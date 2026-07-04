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
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/20 hover:bg-secondary/30"
      }`}
    >
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
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
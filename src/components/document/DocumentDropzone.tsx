import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { getMaxDocSizeBytes, formatBytes } from "@/lib/document-tools";

interface DocumentDropzoneProps {
  onFile: (file: File) => void;
  accept: string;
  label: string;
}

export default function DocumentDropzone({ onFile, accept, label }: DocumentDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const max = getMaxDocSizeBytes();
      if (file.size > max) {
        toast.error(`File is ${formatBytes(file.size)} — limit is ${formatBytes(max)} on this device.`);
        return;
      }
      if (file.size === 0) {
        toast.error("This file appears to be empty.");
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
      onClick={() => document.getElementById(`doc-input-${accept}`)?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
        dragOver
          ? "-translate-y-0.5 border-primary bg-primary/10 shadow-[5px_5px_0_0_var(--color-primary)]"
          : "border-foreground/40 bg-card hover:-translate-y-0.5 hover:border-foreground hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
      }`}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-primary"
        style={{ transform: "rotate(-6deg)" }}
      >
        <UploadCloud className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold">{label}</p>
      <input
        id={`doc-input-${accept}`}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
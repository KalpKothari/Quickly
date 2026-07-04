import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface AudioPreviewProps {
  blob: Blob | null;
  label?: string;
  onDownload: () => void;
  downloadLabel?: string;
}

export default function AudioPreview({ blob, label = "Preview", onDownload, downloadLabel = "Download" }: AudioPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [blob]);

  if (!blob || !url) return null;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <p className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
        {label}
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio src={url} controls className="w-full rounded-lg" />
      <button
        onClick={onDownload}
        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
      >
        <Download className="h-4 w-4" /> {downloadLabel}
      </button>
    </div>
  );
}
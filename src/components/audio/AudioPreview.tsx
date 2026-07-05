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
    /* 1. TOOLBAR WRAPPER CONFIGURATION: Capsule Pill Structure Wrapper */
    <div className="rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-[3px_3px_0_0_var(--color-foreground)]">
      
      {/* 2. INLINE CAPSULE IDENTIFIER BADGE & 3. TEXT FORMATTING CONTAINER */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
          1
        </span>
        
        {/* Render active audio elements cleanly without block layout */}
        <div className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
          {label}
          
          {/* Custom audio player integration rendered inline using standard text sizing rules */}
          <div className="w-40 sm:w-64 shrink-0 px-1">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={url} controls className="h-6 w-full accent-primary" />
          </div>
          
          <span className="text-muted-foreground font-normal hidden md:inline"> (Audio Output Asset ready)</span>
        </div>
      </div>

      {/* 4. COMPACT ACTIONS BUTTON ALIGNMENT */}
      <button
        type="button"
        onClick={onDownload}
        className="rounded-full border-2 border-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 bg-primary text-primary-foreground inline-flex items-center gap-1.5"
      >
        <Download className="h-3.5 w-3.5 shrink-0" /> {downloadLabel}
      </button>
    </div>
  );
}
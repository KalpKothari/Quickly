import { useCallback, useRef, useState, type DragEvent } from "react";
import { UploadCloud, X, FileIcon } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  accept?: string;
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  hint?: string;
  maxSizeMb?: number;
}

export function FileDrop({ accept, multiple, files, onFiles, hint, maxSizeMb }: Props) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      let arr = Array.from(list);
      if (maxSizeMb) arr = arr.filter((f) => f.size <= maxSizeMb * 1024 * 1024);
      onFiles(multiple ? [...files, ...arr] : arr.slice(0, 1));
    },
    [files, multiple, onFiles, maxSizeMb],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => ref.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all",
          drag
            ? "-translate-y-0.5 border-primary bg-primary/10 shadow-[5px_5px_0_0_var(--color-primary)]"
            : "border-foreground/40 bg-card hover:-translate-y-0.5 hover:border-foreground hover:shadow-[5px_5px_0_0_var(--color-foreground)]",
        )}
      >
        <div
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-primary"
          style={{ transform: "rotate(-6deg)" }}
        >
          <UploadCloud className="h-6 w-6" />
        </div>
        <div className="text-sm font-bold text-foreground">
          Drop {multiple ? "files" : "a file"} here or <span className="text-primary underline decoration-2 underline-offset-2">browse</span>
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-card px-3 py-2 shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-primary/10 text-primary">
                <FileIcon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate text-sm font-medium">{f.name}</span>
              <span className="rounded-full border-2 border-foreground bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {formatBytes(f.size)}
              </span>
              <button
                onClick={() => onFiles(files.filter((_, j) => j !== i))}
                className="rounded-full border-2 border-foreground bg-card p-1 text-foreground transition-transform hover:-translate-y-0.5 hover:bg-orange-500/20"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
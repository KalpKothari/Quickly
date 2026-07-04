import { ArrowUp, ArrowDown, X, Video as VideoIcon } from "lucide-react";

interface ReorderableFileListProps {
  files: File[];
  onReorder: (files: File[]) => void;
  onRemove: (index: number) => void;
}

export default function ReorderableFileList({ files, onReorder, onRemove }: ReorderableFileListProps) {
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  return (
    <ul className="space-y-2">
      {files.map((f, idx) => (
        <li
          key={`${f.name}-${idx}`}
          className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-card px-4 py-2.5 text-sm shadow-[3px_3px_0_0_var(--color-foreground)]"
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
            <VideoIcon className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="flex-1 truncate font-medium">{idx + 1}. {f.name}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="rounded-full border-2 border-foreground bg-card p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => move(idx, 1)}
              disabled={idx === files.length - 1}
              className="rounded-full border-2 border-foreground bg-card p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onRemove(idx)}
              className="rounded-full border-2 border-foreground bg-card p-1.5 text-destructive shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:bg-destructive/10"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
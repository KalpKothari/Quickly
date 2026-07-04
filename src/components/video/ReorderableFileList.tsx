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
          className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm"
        >
          <VideoIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{idx + 1}. {f.name}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="rounded-lg p-1.5 hover:bg-secondary disabled:opacity-30"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => move(idx, 1)}
              disabled={idx === files.length - 1}
              className="rounded-lg p-1.5 hover:bg-secondary disabled:opacity-30"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onRemove(idx)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
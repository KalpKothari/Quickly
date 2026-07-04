import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { ProgressBar } from "@/components/tool/ToolShell";
import { downloadBlob, formatBytes } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
import { useRecent } from "@/lib/stores";
export default function CompressImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(0.7);
  const [maxW, setMaxW] = useState(1920);
  const [result, setResult] = useState<{ blob: Blob; name: string; originalSize: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const addRecent = useRecent((s) => s.addProcessed);
  const run = async () => {
    if (!files[0]) return;
    setProgress(10);
    try {
      const img = await loadImage(files[0]);
      setProgress(40);
      const ratio = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setProgress(75);
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      setProgress(100);
      const name = files[0].name.replace(/\.[^.]+$/, "") + "-compressed.jpg";
      setResult({ blob, name, originalSize: files[0].size });
      addRecent({ toolSlug: "compress-image", toolName: "Compress Image", category: "image", fileName: name, meta: formatBytes(blob.size), at: Date.now() });
      toast.success("Image compressed");
    } catch { toast.error("Failed to compress"); }
    finally { setTimeout(() => setProgress(0), 800); }
  };
  const reset = () => { setFiles([]); setResult(null); };
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={(f) => { setFiles(f); setResult(null); }} hint="PNG, JPG, WEBP up to 20 MB" maxSizeMb={20} />
      {files[0] && !result && (
        <div className="space-y-4">
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Quality: {Math.round(quality * 100)}%</span>
            <input type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(+e.target.value)} className="mt-1 w-full" />
          </label>
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Max width: {maxW}px</span>
            <input type="range" min={320} max={4096} step={16} value={maxW} onChange={(e) => setMaxW(+e.target.value)} className="mt-1 w-full" />
          </label>
          {progress > 0 && <ProgressBar value={progress} />}
          <div className="flex gap-2">
            <button onClick={run} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Compress</button>
            <button onClick={reset} className="rounded-xl border border-border px-5 py-2.5 text-sm hover:bg-secondary">Reset</button>
          </div>
        </div>
      )}
      {result && (
        <div className="space-y-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-6">
          <div className="text-xs uppercase text-emerald-600 dark:text-emerald-400">Success</div>
          <div className="flex flex-wrap items-center gap-6">
            <div><div className="text-xs text-muted-foreground">Original</div><div className="font-display text-xl font-bold">{formatBytes(result.originalSize)}</div></div>
            <div><div className="text-xs text-muted-foreground">Compressed</div><div className="font-display text-xl font-bold">{formatBytes(result.blob.size)}</div></div>
            <div><div className="text-xs text-muted-foreground">Saved</div><div className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {Math.max(0, Math.round(100 - (result.blob.size / result.originalSize) * 100))}%
            </div></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadBlob(result.blob, result.name)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Download className="h-4 w-4" /> Download
            </button>
            <button onClick={reset} className="rounded-xl border border-border px-5 py-2.5 text-sm hover:bg-secondary">Process another</button>
          </div>
        </div>
      )}
    </div>
  );
}

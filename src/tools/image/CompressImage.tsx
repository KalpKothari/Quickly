import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, ImageIcon, RotateCcw, Sparkles } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { ProgressBar } from "@/components/tool/ToolShell";
import { downloadBlob, formatBytes } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
import { useRecent } from "@/lib/stores";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

export default function CompressImage() {
  const { showSupportPrompt } = useSupportPrompt();
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
    } catch { 
      toast.error("Failed to compress"); 
    } finally { 
      setTimeout(() => setProgress(0), 800); 
    }
  };

  // Automated optimization reactive stream runs whenever configurations shift
  useEffect(() => {
    if (files[0]) {
      run();
    }
  }, [files, quality, maxW]);

  const applyPreset = (q: number, w: number) => {
    setQuality(q);
    setMaxW(w);
  };

  const reset = () => { 
    setFiles([]); 
    setResult(null); 
  };

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <ImageIcon className="h-3.5 w-3.5" />
            Image Compressor
          </span>
        </div>
      </div>

      {!files[0] ? (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <FileDrop accept="image/*" files={files} onFiles={(f) => { setFiles(f); setResult(null); }} hint="PNG, JPG, WEBP up to 20 MB" maxSizeMb={20} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Metadata and Reset Row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
            <div className="space-y-1 max-w-full sm:max-w-[70%]">
              <span className="text-[10px] font-bold uppercase text-foreground/50 block">Target Asset Source</span>
              <div className="text-sm font-bold text-foreground truncate font-mono">
                {files[0].name} ({formatBytes(files[0].size)})
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-2 text-sm font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <RotateCcw className="h-4 w-4" /> Change Source
            </button>
          </div>

          {/* Quick Intent Presets */}
          <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-3">
            <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Compression Profile Presets
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => applyPreset(0.9, 2560)}
                className="rounded-xl border-2 border-foreground bg-background p-2 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                Max Quality (90%)
              </button>
              <button
                type="button"
                onClick={() => applyPreset(0.7, 1920)}
                className="rounded-xl border-2 border-foreground bg-background p-2 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                Balanced (70%)
              </button>
              <button
                type="button"
                onClick={() => applyPreset(0.4, 1280)}
                className="rounded-xl border-2 border-foreground bg-background p-2 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                High Comp (40%)
              </button>
            </div>
          </div>

          {/* Configuration Grid Panel */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/70">Target Quality</span>
                <span className="text-xs font-mono font-black text-primary">{Math.round(quality * 100)}%</span>
              </div>
              <input type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(+e.target.value)} className="w-full accent-primary cursor-pointer" />
            </div>

            <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/70">Maximum Width Bounds</span>
                <span className="text-xs font-mono font-black text-primary">{maxW}px</span>
              </div>
              <input type="range" min={320} max={4096} step={16} value={maxW} onChange={(e) => setMaxW(+e.target.value)} className="w-full accent-primary cursor-pointer" />
            </div>
          </div>

          {progress > 0 && (
            <div className="rounded-xl border-2 border-foreground p-2 bg-card shadow-[2px_2px_0_0_var(--color-foreground)]">
              <ProgressBar value={progress} />
            </div>
          )}

          {/* Real-time Result Metrics Display Panel */}
          {result && (
            <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border-2 border-foreground bg-gradient-to-br from-violet-500/5 to-indigo-500/5 p-3 text-center shadow-[2px_2px_0_0_var(--color-foreground)]">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-foreground/60">Original Size</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">{formatBytes(result.originalSize)}</div>
                </div>
                
                <div className="rounded-xl border-2 border-foreground bg-gradient-to-br from-violet-500/5 to-indigo-500/5 p-3 text-center shadow-[2px_2px_0_0_var(--color-foreground)]">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-foreground/60">Optimized</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">{formatBytes(result.blob.size)}</div>
                </div>

                <div className="rounded-xl border-2 border-foreground bg-emerald-500/10 p-3 text-center shadow-[2px_2px_0_0_var(--color-foreground)]">
                  <div className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Total Saved</div>
                  <div className="text-lg font-black tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
                    {Math.max(0, Math.round(100 - (result.blob.size / result.originalSize) * 100))}%
                  </div>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => {
                  downloadBlob(result.blob, result.name);
                  toast.success("Image saved");
                  
                  // Trigger support prompt popup immediately following file download completion
                  showSupportPrompt();
                }} 
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                <Download className="h-5 w-5" /> Download Compressed Image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
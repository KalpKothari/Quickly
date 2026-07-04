import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob, formatBytes } from "@/lib/format";
export default function CompressPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; original: number } | null>(null);
  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      // pdf-lib doesn't do heavy compression; re-save with objectStreams removes some overhead
      const bytes = await src.save({ useObjectStreams: true });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult({ blob, original: files[0].size });
      toast.success("Optimized");
    } catch { toast.error("Compression failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); setResult(null); }} />
      {files[0] && !result && (
        <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? "Optimizing..." : "Optimize PDF"}
        </button>
      )}
      {result && (
        <div className="space-y-3 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-6">
          <div className="flex flex-wrap gap-6">
            <div><div className="text-xs text-muted-foreground">Original</div><div className="font-display text-xl font-bold">{formatBytes(result.original)}</div></div>
            <div><div className="text-xs text-muted-foreground">Optimized</div><div className="font-display text-xl font-bold">{formatBytes(result.blob.size)}</div></div>
            <div><div className="text-xs text-muted-foreground">Saved</div><div className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {Math.max(0, Math.round(100 - (result.blob.size / result.original) * 100))}%
            </div></div>
          </div>
          <button onClick={() => downloadBlob(result.blob, files[0].name.replace(/\.pdf$/i, "") + "-optimized.pdf")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Download
          </button>
          <p className="text-xs text-muted-foreground">Note: PDFs consisting mainly of scanned images need server-side image re-encoding for large savings; text-heavy PDFs see the biggest reduction here.</p>
        </div>
      )}
    </div>
  );
}

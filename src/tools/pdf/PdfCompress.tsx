import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { Download, FileArchive } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// Self-contained worker setup (no shared pdfjs util in this codebase yet).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type QualityPreset = "high" | "balanced" | "small";

const PRESETS: Record<QualityPreset, { label: string; scale: number; jpegQuality: number; hint: string }> = {
  high: { label: "High quality", scale: 2, jpegQuality: 0.92, hint: "Largest file, best for print/text-heavy pages" },
  balanced: { label: "Balanced", scale: 1.5, jpegQuality: 0.75, hint: "Good middle ground, recommended" },
  small: { label: "Smallest size", scale: 1, jpegQuality: 0.5, hint: "Max compression, best for scans/photos" },
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function PdfCompress() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [preset, setPreset] = useState<QualityPreset>("balanced");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; originalSize: number } | null>(null);

  const file = files[0];

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(null);
    try {
      const { scale, jpegQuality } = PRESETS[preset];
      const arrayBuf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
      const numPages = pdf.numPages;

      let outDoc: jsPDF | null = null;

      for (let i = 1; i <= numPages; i++) {
        setProgress({ current: i, total: numPages });
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);

        if (!outDoc) {
          outDoc = new jsPDF({ unit: "px", format: [viewport.width, viewport.height], compress: true });
        } else {
          outDoc.addPage([viewport.width, viewport.height]);
        }
        outDoc.addImage(dataUrl, "JPEG", 0, 0, viewport.width, viewport.height);
      }

      if (!outDoc) throw new Error("No pages found");
      const blob = outDoc.output("blob");
      setResult({ blob, originalSize: file.size });

      const savedPct = Math.max(0, Math.round(((file.size - blob.size) / file.size) * 100));
      downloadBlob(blob, file.name.replace(/\.pdf$/i, "") + "-compressed.pdf");
      toast.success(savedPct > 0 ? `PDF compressed, ${savedPct}% smaller` : "PDF processed");

      showSupportPrompt();
    } catch {
      toast.error("Couldn't compress this PDF. Try a different file.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" multiple={false} files={files} onFiles={setFiles} hint="Add a PDF to compress" />

      {file && (
        <div className="rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <p className="truncate text-sm font-semibold" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>
      )}

      {file && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Compression level</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(PRESETS) as QualityPreset[]).map((key) => {
              const p = PRESETS[key];
              const active = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  className={`rounded-xl border-2 border-foreground p-3 text-left shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 ${
                    active ? "bg-primary text-primary-foreground" : "bg-background"
                  }`}
                >
                  <p className="text-sm font-bold">{p.label}</p>
                  <p className={`mt-1 text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{p.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {file && (
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <FileArchive className="h-4 w-4" />
          {busy ? (progress ? `Compressing page ${progress.current}/${progress.total}...` : "Compressing...") : "Compress PDF"}
        </button>
      )}

      {busy && progress && (
        <div className="h-2 w-full overflow-hidden rounded-full border-2 border-foreground bg-background">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}

      {result && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <div className="text-sm">
            <p className="font-semibold">
              {formatBytes(result.originalSize)} → {formatBytes(result.blob.size)}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.blob.size < result.originalSize
                ? `${Math.round(((result.originalSize - result.blob.size) / result.originalSize) * 100)}% smaller`
                : "No further reduction possible for this file"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadBlob(result.blob, file!.name.replace(/\.pdf$/i, "") + "-compressed.pdf")}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Download again
          </button>
        </div>
      )}
    </div>
  );
}
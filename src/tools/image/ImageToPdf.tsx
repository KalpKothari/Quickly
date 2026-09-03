import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, RotateCcw, RotateCw, X } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// --- Tunables for PDF size optimization ---------------------------------
// Because pages are sized 1 image-pixel = 1 PDF point, any pixel above this
// cap on the longer edge is pure bloat (it can never render at higher than
// ~72 "DPI" given that page-sizing convention) - so we cap it before encoding.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

type ProcessedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  mime: "image/jpeg" | "image/png";
};

// Decodes the file with EXIF orientation applied (so it matches how it looks
// when you open it normally), bakes in any extra user-requested rotation,
// downsizes oversized originals, and re-encodes as JPEG (or PNG, to keep
// transparency) so the embedded image is as small as it can be without
// visibly hurting quality.
async function normalizeRotateAndCompress(
  file: File,
  extraRotationDeg: number
): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const swap = extraRotationDeg === 90 || extraRotationDeg === 270;
  const rotatedWidth = swap ? bitmap.height : bitmap.width;
  const rotatedHeight = swap ? bitmap.width : bitmap.height;

  // Only ever scale down, never up - and skip entirely if already small enough.
  const scale = Math.min(1, MAX_DIMENSION / Math.max(rotatedWidth, rotatedHeight));
  const outWidth = Math.max(1, Math.round(rotatedWidth * scale));
  const outHeight = Math.max(1, Math.round(rotatedHeight * scale));
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas not supported");
  }

  ctx.translate(outWidth / 2, outHeight / 2);
  ctx.rotate((extraRotationDeg * Math.PI) / 180);
  ctx.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  bitmap.close();

  // Keep PNGs as PNG (transparency-safe); everything else becomes JPEG for size.
  const mime: ProcessedImage["mime"] = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      mime === "image/jpeg" ? JPEG_QUALITY : undefined
    )
  );

  // Drop the canvas backing store immediately, don't wait for GC.
  canvas.width = 0;
  canvas.height = 0;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: outWidth, height: outHeight, mime };
}

export default function ImageToPdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [rotations, setRotations] = useState<Map<File, number>>(new Map());
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const previewsRef = useRef(previews);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  // Rotations always tracked (even with preview off) so a rotation set
  // before toggling preview off isn't lost.
  useEffect(() => {
    setRotations((prev) => {
      const next = new Map<File, number>();
      for (const f of files) next.set(f, prev.get(f) ?? 0);
      return next;
    });
  }, [files]);

  // Preview object URLs are only created while preview is enabled, and
  // released immediately when it's turned off or files change.
  useEffect(() => {
    if (!previewEnabled) {
      setPreviews((prev) => {
        if (prev.size === 0) return prev;
        prev.forEach((url) => URL.revokeObjectURL(url));
        return new Map();
      });
      return;
    }
    setPreviews((prev) => {
      const next = new Map<File, string>();
      for (const f of files) {
        next.set(f, prev.get(f) ?? URL.createObjectURL(f));
      }
      for (const [f, url] of prev) {
        if (!next.has(f)) URL.revokeObjectURL(url);
      }
      return next;
    });
  }, [files, previewEnabled]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const rotate = (file: File, delta: number) => {
    setRotations((prev) => {
      const next = new Map(prev);
      const current = next.get(file) ?? 0;
      next.set(file, (current + delta + 360) % 360);
      return next;
    });
  };

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file));
  };

  const run = async () => {
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const doc = await PDFDocument.create();
      // Strictly sequential and in array order: this is what guarantees the
      // PDF page order matches the exact order files arrived in, and it also
      // keeps memory flat (never more than one decoded image in memory).
      for (const f of files) {
        const rotationDeg = rotations.get(f) ?? 0;
        const { bytes, width, height, mime } = await normalizeRotateAndCompress(f, rotationDeg);
        const embed = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage([width, height]);
        page.drawImage(embed, { x: 0, y: 0, width, height });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      const pdf = await doc.save();
      downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), "images.pdf");
      toast.success("PDF created");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch {
      toast.error("Only PNG or JPG images supported");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <FileDrop accept="image/png,image/jpeg" multiple files={files} onFiles={setFiles} hint="Add PNG/JPG images (order = drop order)" />

      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={previewEnabled}
              onChange={(e) => setPreviewEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-2 border-foreground accent-foreground"
            />
            Preview your PDF
          </label>

          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {busy ? `Creating... (${progress.done}/${progress.total})` : `Create PDF (${files.length} pages)`}
          </button>
        </div>
      )}

      {files.length > 0 && previewEnabled && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f, i) => {
            const rotationDeg = rotations.get(f) ?? 0;
            const previewUrl = previews.get(f);
            return (
              <div
                key={`${f.name}-${i}`}
                className="relative flex flex-col gap-2 rounded-xl border-2 border-foreground bg-background p-2 shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <span
                  aria-hidden
                  className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background text-xs font-bold"
                >
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(f)}
                  aria-label="Remove image"
                  className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background hover:opacity-90"
                >
                  <X className="h-3 w-3" />
                </button>

                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-foreground bg-muted">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={f.name}
                      className="max-h-full max-w-full object-contain transition-transform"
                      style={{ transform: `rotate(${rotationDeg}deg)` }}
                    />
                  )}
                </div>

                <p className="truncate text-xs font-medium" title={f.name}>
                  {f.name}
                </p>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => rotate(f, -90)}
                    aria-label="Rotate left"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border-2 border-foreground py-1 text-xs font-semibold hover:opacity-90"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rotate(f, 90)}
                    aria-label="Rotate right"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border-2 border-foreground py-1 text-xs font-semibold hover:opacity-90"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
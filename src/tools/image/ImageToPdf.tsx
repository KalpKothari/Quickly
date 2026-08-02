import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, RotateCcw, RotateCw, X } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// Decodes the file with EXIF orientation applied (so it matches how it looks
// when you open it normally), then bakes in any extra user-requested rotation.
// Returns PNG bytes + the final width/height, ready to embed as-is.
async function normalizeAndRotate(
  file: File,
  extraRotationDeg: number
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const swap = extraRotationDeg === 90 || extraRotationDeg === 270;
  const width = swap ? bitmap.height : bitmap.width;
  const height = swap ? bitmap.width : bitmap.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.translate(width / 2, height / 2);
  ctx.rotate((extraRotationDeg * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width, height };
}

export default function ImageToPdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [rotations, setRotations] = useState<Map<File, number>>(new Map());
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
  const [busy, setBusy] = useState(false);

  // Keep object-URL previews in sync with the current file list.
  useEffect(() => {
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
    setRotations((prev) => {
      const next = new Map<File, number>();
      for (const f of files) next.set(f, prev.get(f) ?? 0);
      return next;
    });
  }, [files]);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      const doc = await PDFDocument.create();
      for (const f of files) {
        const rotationDeg = rotations.get(f) ?? 0;
        const { bytes, width, height } = await normalizeAndRotate(f, rotationDeg);
        const embed = await doc.embedPng(bytes);
        const page = doc.addPage([width, height]);
        page.drawImage(embed, { x: 0, y: 0, width, height });
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f, i) => {
            const rotationDeg = rotations.get(f) ?? 0;
            const previewUrl = previews.get(f);
            return (
              <div
                key={`${f.name}-${i}`}
                className="relative flex flex-col gap-2 rounded-xl border-2 border-foreground bg-background p-2 shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
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

      {files.length > 0 && (
        <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <Download className="h-4 w-4" /> {busy ? "Creating..." : `Create PDF (${files.length} pages)`}
        </button>
      )}
    </div>
  );
}
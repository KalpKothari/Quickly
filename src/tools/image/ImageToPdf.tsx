import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// --- Tunables for PDF size optimization ---------------------------------
// Because pages are sized 1 image-pixel = 1 PDF point, any pixel above this
// cap on the longer edge is pure bloat (it can never render at higher than
// ~72 "DPI" given that page-sizing convention) - so we cap it before encoding.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

// -----------------------------------------------------------------------
// PHOTO DATE ORDERING — only used when the user selects "Arrange by Photo Date".
// Detects when a mobile OS gallery returns files in reverse-chronological order
// and corrects it to oldest-first (i.e. actual capture sequence).
//
// Strategy:
//   1. If lastModified values are non-increasing with at least one strict decrease
//      → the OS returned files newest-first; reverse to get oldest-first.
//   2. Fallback for burst/same-second captures (identical ms timestamps):
//      Inspect camera filename patterns. If names are strictly decreasing
//      (e.g. IMG_0004 → IMG_0003 → IMG_0002) → reverse.
//   3. Otherwise → return as-is (already oldest-first or indeterminate).
//
// This function is NEVER called when orderMode === "selection".
// -----------------------------------------------------------------------
function normalizeMobileCameraOrder(incomingFiles: File[]): File[] {
  if (incomingFiles.length < 2) return incomingFiles;

  const timestamps = incomingFiles.map((f) => f.lastModified);

  // 1. lastModified in milliseconds — distinct even for photos 1–5 s apart.
  const isNonIncreasingTime = timestamps.every(
    (t, i) => i === 0 || t <= timestamps[i - 1]
  );
  const hasTimeDecrease = timestamps.some(
    (t, i) => i > 0 && t < timestamps[i - 1]
  );

  if (isNonIncreasingTime && hasTimeDecrease) {
    return [...incomingFiles].reverse();
  }

  // 2. Fallback: burst or same-second captures with clamped/identical timestamps.
  //    Match common camera filename prefixes (iOS IMG_, Pixel PXL_, Android date-pattern, etc.)
  const names = incomingFiles.map((f) => f.name.toLowerCase());
  const isCameraPattern = names.every((n) =>
    /^(img_|pxl_|photo_|dsc_|image_|\d{8}_\d{6})/.test(n)
  );

  if (isCameraPattern) {
    // Natural numeric comparison handles IMG_9 vs IMG_10 correctly.
    const isStrictlyDecreasingNames = names.every(
      (n, i) =>
        i === 0 ||
        n.localeCompare(names[i - 1], undefined, { numeric: true, sensitivity: "base" }) < 0
    );
    if (isStrictlyDecreasingNames) {
      return [...incomingFiles].reverse();
    }
  }

  return incomingFiles;
}

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
  // "selection" = keep exact selection/batch order (default, no sorting applied)
  // "photoDate" = apply normalizeMobileCameraOrder to correct gallery reverse-order
  const [orderMode, setOrderMode] = useState<"selection" | "photoDate">("selection");

  // Ref to a hidden <input> used exclusively for the "Add more photos" button.
  // Each click opens the picker; whatever the browser returns is appended
  // to the existing list in the exact FileList order — no sorting applied.
  const addMoreRef = useRef<HTMLInputElement>(null);

  const previewsRef = useRef(previews);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  // -----------------------------------------------------------------------
  // ORDERING CONTRACT
  // -----------------------------------------------------------------------
  // On mobile, <input type="file" multiple> returns a FileList whose order
  // is determined by the OS gallery, NOT by the user's tap sequence.
  // There is no standard API that exposes the actual tap order from a single
  // multi-select session.
  //
  // The only reliable strategy is batch selection:
  //   • First batch  → becomes pages 1…N   (in FileList order for that batch)
  //   • Second batch → appended as pages N+1… (in FileList order for that batch)
  //   • etc.
  //
  // Each batch is appended to the existing array WITHOUT any sorting,
  // reversing, or timestamp comparison. The user controls the final order
  // by choosing which photos to add in which batch.
  //
  // Previously selected images are NEVER reordered automatically.
  // -----------------------------------------------------------------------

  // Called by FileDrop for the very first selection (drag-drop or initial pick).
  // In "selection" mode: set files exactly as received — no sorting, no reversing.
  // In "photoDate" mode: run normalizeMobileCameraOrder to correct gallery order.
  const handleFilesChange = (incomingFiles: File[]) => {
    const ordered =
      orderMode === "photoDate"
        ? normalizeMobileCameraOrder(incomingFiles)
        : incomingFiles;
    setFiles(ordered);
  };

  // Called by the hidden "add more" input on subsequent picks.
  // Appends the new batch to the end of the existing list, no sorting.
  const handleAddMore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;

    // Spread FileList into a plain array in native FileList index order.
    const newBatch: File[] = [];
    for (let i = 0; i < picked.length; i++) {
      newBatch.push(picked[i]);
    }

    // In "photoDate" mode: normalize each incoming batch independently so
    // that gallery-reversed batches are corrected before appending.
    // In "selection" mode: append as-is — no sorting of any kind.
    const orderedBatch =
      orderMode === "photoDate"
        ? normalizeMobileCameraOrder(newBatch)
        : newBatch;

    setFiles((prev) => [...prev, ...orderedBatch]);

    // Reset the input so the same file(s) can be re-selected in a future batch
    // without the browser ignoring the change event.
    e.target.value = "";
  };

  // Rotations always tracked (even with preview off) so a rotation set
  // before toggling preview off isn't lost. Retains file object identity.
  useEffect(() => {
    setRotations((prev) => {
      const next = new Map<File, number>();
      for (const f of files) next.set(f, prev.get(f) ?? 0);
      return next;
    });
  }, [files]);

  // Preview object URLs are created in exact array order and released
  // when removed or disabled.
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

      // Sequential iteration strictly adhering to the files state array index.
      // Index 0 in state = Page 1 in PDF, Index n = Page n + 1 in PDF.
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

      showSupportPrompt();
    } catch {
      toast.error("Only PNG or JPG images supported");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Photo Order Setting — visible before and after file selection */}
      <fieldset className="rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <legend className="px-1 text-sm font-bold">How should we arrange your photos?</legend>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="orderMode"
              value="selection"
              checked={orderMode === "selection"}
              onChange={() => setOrderMode("selection")}
              className="mt-0.5 h-4 w-4 accent-foreground"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">Keep Selection Order</span>
              <span className="text-xs text-muted-foreground">
                Use the order your photos are selected and added.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="orderMode"
              value="photoDate"
              checked={orderMode === "photoDate"}
              onChange={() => setOrderMode("photoDate")}
              className="mt-0.5 h-4 w-4 accent-foreground"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">Arrange by Photo Date</span>
              <span className="text-xs text-muted-foreground">
                Arrange photos based on when they were taken.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <FileDrop
        accept="image/png,image/jpeg"
        multiple
        files={files}
        onFiles={handleFilesChange}
        hint={
          orderMode === "photoDate"
            ? "Add PNG/JPG images — photos will be arranged by capture date"
            : "Add PNG/JPG images — select photos one batch at a time to control page order"
        }
      />

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

          {/* Hidden input for appending additional batches without reordering existing files */}
          <input
            ref={addMoreRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            className="sr-only"
            onChange={handleAddMore}
            aria-hidden
            tabIndex={-1}
          />

          <button
            type="button"
            onClick={() => addMoreRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-[3px_3px_0_0_var(--color-foreground)]"
          >
            <Plus className="h-4 w-4" />
            Add more photos
          </button>

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
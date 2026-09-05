import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// --- Tunables for PDF size optimization ---------------------------------
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

function normalizeMobileCameraOrder(incomingFiles: File[]): File[] {
  if (incomingFiles.length < 2) return incomingFiles;

  const timestamps = incomingFiles.map((f) => f.lastModified);

  const isNonIncreasingTime = timestamps.every(
    (t, i) => i === 0 || t <= timestamps[i - 1]
  );
  const hasTimeDecrease = timestamps.some(
    (t, i) => i > 0 && t < timestamps[i - 1]
  );

  if (isNonIncreasingTime && hasTimeDecrease) {
    return [...incomingFiles].reverse();
  }

  const names = incomingFiles.map((f) => f.name.toLowerCase());
  const isCameraPattern = names.every((n) =>
    /^(img_|pxl_|photo_|dsc_|image_|\d{8}_\d{6})/.test(n)
  );

  if (isCameraPattern) {
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

async function normalizeRotateAndCompress(
  file: File,
  extraRotationDeg: number
): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const swap = extraRotationDeg === 90 || extraRotationDeg === 270;
  const rotatedWidth = swap ? bitmap.height : bitmap.width;
  const rotatedHeight = swap ? bitmap.width : bitmap.height;

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

  const mime: ProcessedImage["mime"] = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      mime === "image/jpeg" ? JPEG_QUALITY : undefined
    )
  );

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
  const [orderMode, setOrderMode] = useState<"selection" | "photoDate">("selection");

  const addMoreRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef(previews);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  const handleFilesChange = (incomingFiles: File[]) => {
    if (orderMode === "selection") {
      const single = incomingFiles.slice(0, 1);
      setFiles((prev) => [...prev, ...single]);
    } else {
      setFiles(normalizeMobileCameraOrder(incomingFiles));
    }
  };

  const handleAddMore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;

    const newBatch: File[] = [];
    const limit = orderMode === "selection" ? 1 : picked.length;
    for (let i = 0; i < limit; i++) {
      newBatch.push(picked[i]);
    }

    const orderedBatch =
      orderMode === "photoDate"
        ? normalizeMobileCameraOrder(newBatch)
        : newBatch;

    setFiles((prev) => [...prev, ...orderedBatch]);
    e.target.value = "";
  };

  useEffect(() => {
    setRotations((prev) => {
      const next = new Map<File, number>();
      for (const f of files) next.set(f, prev.get(f) ?? 0);
      return next;
    });
  }, [files]);

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

  // Remove by exact array index to prevent object-reference bugs and handle identical duplicate files
  const removeFileAtIndex = (indexToRemove: number) => {
    setFiles((prev) => {
      const target = prev[indexToRemove];
      if (target) {
        const previewUrl = previews.get(target);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });

    if (addMoreRef.current) {
      addMoreRef.current.value = "";
    }
  };

  const run = async () => {
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const doc = await PDFDocument.create();

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
                Add photos one at a time to preserve exact sequence.
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
                Select multiple photos at once; arranged by capture date.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <FileDrop
        accept="image/png,image/jpeg"
        multiple={orderMode === "photoDate"}
        files={files}
        onFiles={handleFilesChange}
        hint={
          orderMode === "photoDate"
            ? "Add PNG/JPG images — photos will be arranged by capture date"
            : "Add PNG/JPG image — select one photo at a time to maintain page order"
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

          <input
            ref={addMoreRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple={orderMode === "photoDate"}
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
            {orderMode === "selection" ? "Add photo" : "Add more photos"}
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
                key={`${f.name}-${f.lastModified}-${i}`}
                className="relative flex flex-col gap-2 rounded-xl border-2 border-foreground bg-background p-2 shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <span
                  aria-hidden
                  className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background text-xs font-bold pointer-events-none"
                >
                  {i + 1}
                </span>

                <button
                  type="button"
                  onClick={() => removeFileAtIndex(i)}
                  aria-label="Remove image"
                  className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background hover:bg-muted hover:opacity-90 cursor-pointer"
                >
                  <X className="h-3 w-3 pointer-events-none" />
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
import { useEffect, useRef, useState, type DragEvent } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, Plus, RotateCcw, RotateCw, X, GripHorizontal, ArrowRight } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// --- Tunables for PDF size optimization ---------------------------------
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

export interface SelectionItem {
  id: string;
  file: File;
  rotation: number;
  previewUrl: string;
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
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const addMoreRef = useRef<HTMLInputElement>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Clean up ObjectURLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  // Strict append-only processor: never sorts or reverses
  const appendIncomingFiles = (incomingFiles: File[]) => {
    if (!incomingFiles || incomingFiles.length === 0) return;

    const newItems: SelectionItem[] = incomingFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      rotation: 0,
      previewUrl: URL.createObjectURL(file),
    }));

    setItems((prev) => [...prev, ...newItems]);
  };

  // Synchronizes additions and removals from FileDrop
  const handleFileDropChange = (incomingFiles: File[]) => {
    if (incomingFiles.length < items.length) {
      // Deletion triggered directly from FileDrop list
      setItems((prev) => {
        const remaining = prev.filter((item) => incomingFiles.includes(item.file));
        const removed = prev.filter((item) => !incomingFiles.includes(item.file));
        removed.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return remaining;
      });
      return;
    }

    // New additions from drop zone or file browser
    const existingFileSet = new Set(items.map((i) => i.file));
    const newFiles = incomingFiles.filter((f) => !existingFileSet.has(f));
    appendIncomingFiles(newFiles);
  };

  // Dedicated append-only picker
  const handleAddMoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    appendIncomingFiles(Array.from(picked));
    e.target.value = "";
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });

    if (addMoreRef.current) addMoreRef.current.value = "";
  };

  const rotateItem = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, rotation: (item.rotation + delta + 360) % 360 }
          : item
      )
    );
  };

  // Drag and Drop reordering logic
  const handleDragStart = (index: number) => {
    draggedIndexRef.current = index;
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    const dragIndex = draggedIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;

    setItems((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(dragIndex, 1);
      updated.splice(dropIndex, 0, movedItem);
      return updated;
    });

    draggedIndexRef.current = null;
  };

  // PDF Generation strictly adhering to items array index
  const run = async () => {
    if (!items.length) return;
    setBusy(true);
    setProgress({ done: 0, total: items.length });
    try {
      const doc = await PDFDocument.create();

      for (const item of items) {
        const { bytes, width, height, mime } = await normalizeRotateAndCompress(
          item.file,
          item.rotation
        );
        const embed =
          mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
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
      {/* Hidden file input for '+ Add More' triggers */}
      <input
        ref={addMoreRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        className="sr-only"
        onChange={handleAddMoreChange}
        aria-hidden
        tabIndex={-1}
      />

      {/* Main File Drop / Browser Area */}
      <FileDrop
        accept="image/png,image/jpeg"
        multiple
        files={items.map((i) => i.file)}
        onFiles={handleFileDropChange}
        hint="Images are added in the exact sequence selected. Drag items anytime to reorder pages."
      />

      {/* Live Selection Tray (Mobile/Editor Style) */}
      {items.length > 0 && (
        <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black uppercase tracking-wider text-foreground">
                Selected Images
              </span>
              <span className="rounded-full border-2 border-foreground bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                {items.length} {items.length === 1 ? "page" : "pages"}
              </span>
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Drag thumbnails to reorder pages
            </p>
          </div>

          {/* Sequential Arrow Flow Indicator */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold text-muted-foreground">
            {items.map((_, i) => (
              <span key={`seq-${i}`} className="flex items-center gap-1 whitespace-nowrap">
                <span className="text-foreground">Page {i + 1}</span>
                {i < items.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/60" />}
              </span>
            ))}
          </div>

          {/* Horizontal Drag-and-Drop Strip */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 pt-1">
            {items.map((item, idx) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
                className="group relative flex h-24 w-20 shrink-0 cursor-grab flex-col items-center justify-center rounded-xl border-2 border-foreground bg-background p-1 shadow-[2px_2px_0_0_var(--color-foreground)] transition-all hover:-translate-y-0.5 active:cursor-grabbing"
              >
                {/* Page Number Badge */}
                <span className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-primary text-[11px] font-black text-primary-foreground shadow-[1px_1px_0_0_var(--color-foreground)]">
                  {idx + 1}
                </span>

                {/* Quick Remove Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem(item.id);
                  }}
                  className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-background text-foreground transition-transform hover:scale-110"
                  aria-label={`Remove page ${idx + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>

                {/* Thumbnail Preview */}
                <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="h-full w-full object-contain pointer-events-none"
                    style={{ transform: `rotate(${item.rotation}deg)` }}
                  />
                </div>

                <div className="mt-1 flex w-full items-center justify-between px-0.5 text-[10px] text-muted-foreground">
                  <span className="truncate max-w-[50px]">{item.file.name}</span>
                  <GripHorizontal className="h-3 w-3 shrink-0 opacity-40 group-hover:opacity-100" />
                </div>
              </div>
            ))}

            {/* + Add More Card */}
            <button
              type="button"
              onClick={() => addMoreRef.current?.click()}
              className="flex h-24 w-20 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-foreground/60 bg-muted/40 p-2 text-foreground transition-all hover:border-foreground hover:bg-muted active:scale-95"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-foreground bg-background">
                <Plus className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-bold">Add More</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Action Toolbar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={previewEnabled}
              onChange={(e) => setPreviewEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-2 border-foreground accent-foreground"
            />
            Show Detailed Preview
          </label>

          <button
            type="button"
            onClick={() => addMoreRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-background px-5 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add more photos
          </button>

          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {busy
              ? `Creating... (${progress.done}/${progress.total})`
              : `Create PDF (${items.length} ${items.length === 1 ? "page" : "pages"})`}
          </button>
        </div>
      )}

      {/* Expanded Grid & Fine Controls */}
      {items.length > 0 && previewEnabled && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item, idx) => (
            <div
              key={`grid-${item.id}`}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(idx)}
              className="relative flex flex-col gap-2 rounded-xl border-2 border-foreground bg-background p-2 shadow-[3px_3px_0_0_var(--color-foreground)] transition-all hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
            >
              {/* Page Indicator Badge */}
              <span className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background text-xs font-bold pointer-events-none">
                {idx + 1}
              </span>

              {/* Remove Card Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                aria-label={`Remove page ${idx + 1}`}
                className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background hover:bg-muted hover:opacity-90"
              >
                <X className="h-3 w-3 pointer-events-none" />
              </button>

              {/* Card Image Thumbnail */}
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-foreground bg-muted">
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="max-h-full max-w-full object-contain pointer-events-none transition-transform"
                  style={{ transform: `rotate(${item.rotation}deg)` }}
                />
              </div>

              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-xs font-medium" title={item.file.name}>
                  {item.file.name}
                </p>
                <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>

              {/* Rotation Actions */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => rotateItem(item.id, -90)}
                  aria-label="Rotate left"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border-2 border-foreground py-1 text-xs font-semibold hover:opacity-90"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => rotateItem(item.id, 90)}
                  aria-label="Rotate right"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border-2 border-foreground py-1 text-xs font-semibold hover:opacity-90"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import {
  Camera,
  Upload,
  Download,
  RotateCcw,
  RotateCw,
  X,
  Check,
  Pencil,
  RefreshCw,
  GripVertical,
  Monitor,
  Loader2,
  ScanLine,
  Wand2,
  ArrowLeft,
  Crop,
} from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// =========================================================================
// Document Scanner Cleaner
// Mobile-first: capture/upload document photos, auto-detect + correct
// perspective, clean them up (shadows, contrast, sharpness, B&W), reorder,
// and export as JPGs or a single PDF. Everything runs locally on <canvas>.
// =========================================================================

// --- Shared tunables ------------------------------------------------------
const MAX_DIMENSION = 2000; // hard cap for full-resolution export renders
const EDIT_PREVIEW_DIM = 900; // working size while adjusting sliders (fast)
const THUMB_DIM = 420; // page-list thumbnail size

type Point = { x: number; y: number };
type Corners = [Point, Point, Point, Point];
type ColorMode = "color" | "grayscale" | "bw";
type PresetId = "original" | "document" | "bw" | "grayscale" | "receipt" | "notes";
type PageSizeId = "auto" | "a4" | "letter";
type QualityId = "high" | "medium" | "small";

type PageEdit = {
  corners: Corners | null; // normalized 0..1, null = full frame (no crop)
  straighten: number; // fine rotation, degrees, -15..15
  rotation: 0 | 90 | 180 | 270; // quick quarter-turn
  preset: PresetId;
  mode: ColorMode;
  brightness: number; // -100..100
  contrast: number; // -100..100
  sharpness: number; // 0..100
  removeShadows: boolean;
  removeBackground: boolean;
};

type Page = {
  id: string;
  file: File;
  naturalWidth: number;
  naturalHeight: number;
  edit: PageEdit;
};

const PRESETS: Record<PresetId, Omit<PageEdit, "corners" | "straighten" | "rotation" | "preset">> = {
  original: { mode: "color", brightness: 0, contrast: 0, sharpness: 0, removeShadows: false, removeBackground: false },
  document: { mode: "color", brightness: 8, contrast: 22, sharpness: 35, removeShadows: true, removeBackground: true },
  bw: { mode: "bw", brightness: 0, contrast: 30, sharpness: 25, removeShadows: true, removeBackground: false },
  grayscale: { mode: "grayscale", brightness: 5, contrast: 15, sharpness: 20, removeShadows: false, removeBackground: false },
  receipt: { mode: "bw", brightness: 5, contrast: 40, sharpness: 45, removeShadows: true, removeBackground: true },
  notes: { mode: "grayscale", brightness: 8, contrast: 20, sharpness: 15, removeShadows: false, removeBackground: false },
};

const PRESET_LABELS: { id: PresetId; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "document", label: "Document" },
  { id: "bw", label: "B&W" },
  { id: "grayscale", label: "Grayscale" },
  { id: "receipt", label: "Receipt" },
  { id: "notes", label: "Notes" },
];

const QUALITY: Record<QualityId, { jpegQuality: number; maxDim: number; label: string }> = {
  high: { jpegQuality: 0.92, maxDim: MAX_DIMENSION, label: "High" },
  medium: { jpegQuality: 0.8, maxDim: 1600, label: "Medium" },
  small: { jpegQuality: 0.62, maxDim: 1100, label: "Small" },
};

const PAGE_SIZE_LABELS: { id: PageSizeId; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "a4", label: "A4" },
  { id: "letter", label: "Letter" },
];

function defaultEdit(): PageEdit {
  return {
    corners: null,
    straighten: 0,
    rotation: 0,
    preset: "document",
    ...PRESETS.document,
  };
}

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `page_${Date.now()}_${uidCounter}`;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Geometry: 4-point perspective transform ------------------------------

function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const pivot = M[i][i] || 1e-9;
    for (let k = i; k <= n; k++) M[i][k] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  return M.map((row) => row[n]);
}

// Maps 4 source points to 4 destination points (direct linear transform).
function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    B.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dy);
  }
  const h = solveLinearSystem(A, B);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C || 1e-9;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

// Warps the quadrilateral `corners` (normalized 0..1 in bitmap space) into a
// flat outW x outH rectangle using inverse mapping + bilinear sampling.
function warpPerspective(bitmap: ImageBitmap, corners: Corners, outW: number, outH: number): HTMLCanvasElement {
  const sw = bitmap.width;
  const sh = bitmap.height;
  const src = corners.map((p) => ({ x: p.x * sw, y: p.y * sh }));
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const H = getPerspectiveTransform(src, dst);
  const Hinv = invert3x3(H);

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = sw;
  srcCanvas.height = sh;
  const sctx = srcCanvas.getContext("2d")!;
  sctx.drawImage(bitmap, 0, 0);
  const srcData = sctx.getImageData(0, 0, sw, sh).data;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;
  const outImage = octx.createImageData(outW, outH);
  const od = outImage.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w_ = Hinv[6] * x + Hinv[7] * y + Hinv[8];
      const sx = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / w_;
      const sy = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / w_;
      const di = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        od[di] = 255;
        od[di + 1] = 255;
        od[di + 2] = 255;
        od[di + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = srcData[(y0 * sw + x0) * 4 + c];
        const p10 = srcData[(y0 * sw + x0 + 1) * 4 + c];
        const p01 = srcData[((y0 + 1) * sw + x0) * 4 + c];
        const p11 = srcData[((y0 + 1) * sw + x0 + 1) * 4 + c];
        const top = p00 * (1 - fx) + p10 * fx;
        const bottom = p01 * (1 - fx) + p11 * fx;
        od[di + c] = top * (1 - fy) + bottom * fy;
      }
      od[di + 3] = 255;
    }
  }
  octx.putImageData(outImage, 0, 0);
  return out;
}

function rotateQuarter(src: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (deg === 0) return src;
  const swap = deg === 90 || deg === 270;
  const w = swap ? src.height : src.width;
  const h = swap ? src.width : src.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

function rotateFine(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  if (!deg) return src;
  const w = src.width;
  const h = src.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2);
  return out;
}

function cornerContentDims(corners: Corners, sw: number, sh: number) {
  const p = corners.map((c) => ({ x: c.x * sw, y: c.y * sh }));
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (dist(p[0], p[1]) + dist(p[3], p[2])) / 2;
  const h = (dist(p[0], p[3]) + dist(p[1], p[2])) / 2;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

// Builds the geometry-corrected canvas: crop/perspective -> straighten -> rotate.
// This is the "expensive" step, so it's cached separately from filter tweaks.
function buildBaseCanvas(bitmap: ImageBitmap, edit: PageEdit, maxDim: number): HTMLCanvasElement {
  const sw = bitmap.width;
  const sh = bitmap.height;
  let canvas: HTMLCanvasElement;

  if (edit.corners) {
    let { w, h } = cornerContentDims(edit.corners, sw, sh);
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    canvas = warpPerspective(bitmap, edit.corners, w, h);
  } else {
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  }

  canvas = rotateFine(canvas, edit.straighten);
  canvas = rotateQuarter(canvas, edit.rotation);
  return canvas;
}

// --- Pixel-level cleanup filters ------------------------------------------

// Approximate shadow removal: divide by a heavily-blurred copy of the image
// (the "illumination map") so unevenly-lit paper reads as flat white.
function flattenIllumination(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d")!;
  bctx.filter = "blur(24px)";
  bctx.drawImage(ctx.canvas, 0, 0);
  const bg = bctx.getImageData(0, 0, w, h).data;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const bgVal = Math.max(bg[i + c], 60);
      d[i + c] = clamp((d[i + c] / bgVal) * 235, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Simple unsharp-mask style sharpen, blended by `amount` (0..1).
function applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const k = amount * 0.9;
  const kernel = [0, -k, 0, -k, 1 + 4 * k, -k, 0, -k, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[((y + dy) * w + (x + dx)) * 4 + c] * kernel[ki];
            ki++;
          }
        }
        d[i + c] = clamp(sum, 0, 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Adaptive-ish black & white threshold, using a blurred local background
// estimate so it holds up on unevenly lit photos.
function applyThreshold(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d")!;
  bctx.filter = "blur(14px)";
  bctx.drawImage(ctx.canvas, 0, 0);
  const bg = bctx.getImageData(0, 0, w, h).data;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const local = bg[i] - 12;
    const v = d[i] < local ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

// "Remove background": pushes near-white pixels to pure white so the page
// background reads clean rather than segmenting real image content.
function liftWhites(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      if (d[i + c] > 195) d[i + c] = clamp(d[i + c] * 1.18, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function applyEnhancements(base: HTMLCanvasElement, edit: PageEdit): HTMLCanvasElement {
  const w = base.width;
  const h = base.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;

  const brightnessPct = 100 + edit.brightness;
  const contrastPct = 100 + edit.contrast;
  const grayscalePct = edit.mode !== "color" ? 100 : 0;
  ctx.filter = `brightness(${brightnessPct}%) contrast(${contrastPct}%) grayscale(${grayscalePct}%)`;
  ctx.drawImage(base, 0, 0);
  ctx.filter = "none";

  if (edit.removeShadows) flattenIllumination(ctx, w, h);
  if (edit.sharpness > 0) applySharpen(ctx, w, h, edit.sharpness / 100);
  if (edit.mode === "bw") {
    applyThreshold(ctx, w, h);
  } else if (edit.removeBackground) {
    liftWhites(ctx, w, h);
  }
  return out;
}

// Heuristic auto-boundary detection: scans inward from each edge until pixels
// diverge from the sampled background color. Not full contour detection, but
// gives a sensible starting crop that the user can refine with the corner
// handles.
async function autoDetectCorners(bitmap: ImageBitmap): Promise<Corners> {
  const S = 220;
  const scale = S / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const bg =
    (lum(0) + lum((w - 1) * 4) + lum(((h - 1) * w) * 4) + lum((h * w - 1) * 4)) / 4;
  const THRESH = 28;

  const rowDiffers = (y: number) => {
    let count = 0;
    for (let x = 0; x < w; x++) if (Math.abs(lum((y * w + x) * 4) - bg) > THRESH) count++;
    return count > w * 0.06;
  };
  const colDiffers = (x: number) => {
    let count = 0;
    for (let y = 0; y < h; y++) if (Math.abs(lum((y * w + x) * 4) - bg) > THRESH) count++;
    return count > h * 0.06;
  };

  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;
  while (top < h / 2 && !rowDiffers(top)) top++;
  while (bottom > h / 2 && !rowDiffers(bottom)) bottom--;
  while (left < w / 2 && !colDiffers(left)) left++;
  while (right > w / 2 && !colDiffers(right)) right--;

  if (right - left < w * 0.3 || bottom - top < h * 0.3) {
    return [
      { x: 0.04, y: 0.04 },
      { x: 0.96, y: 0.04 },
      { x: 0.96, y: 0.96 },
      { x: 0.04, y: 0.96 },
    ];
  }
  const pad = 0.012;
  return [
    { x: Math.max(0, left / w - pad), y: Math.max(0, top / h - pad) },
    { x: Math.min(1, right / w + pad), y: Math.max(0, top / h - pad) },
    { x: Math.min(1, right / w + pad), y: Math.min(1, bottom / h + pad) },
    { x: Math.max(0, left / w - pad), y: Math.min(1, bottom / h + pad) },
  ];
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}

// --- Mobile detection -------------------------------------------------------

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// =========================================================================

export default function DocumentScannerCleaner() {
  const { showSupportPrompt } = useSupportPrompt();
  const isMobile = useIsMobile();

  const [pages, setPages] = useState<Page[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorPreviewUrl, setEditorPreviewUrl] = useState<string | null>(null);
  const [editorRawUrl, setEditorRawUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"enhanced" | "original">("enhanced");
  const [adjustingCorners, setAdjustingCorners] = useState(false);
  const [rendering, setRendering] = useState(false);

  const [pageSize, setPageSize] = useState<PageSizeId>("auto");
  const [quality, setQuality] = useState<QualityId>("medium");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragState = useRef<{ id: string } | null>(null);

  const bitmapCache = useRef<Map<string, ImageBitmap>>(new Map());
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const trackUrl = (url: string) => {
    objectUrlsRef.current.add(url);
    return url;
  };
  const revokeUrl = (url: string | null | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  };

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      bitmapCache.current.forEach((b) => b.close());
    };
  }, []);

  const getBitmap = useCallback(async (page: Page): Promise<ImageBitmap> => {
    const cached = bitmapCache.current.get(page.id);
    if (cached) return cached;
    const bmp = await createImageBitmap(page.file, { imageOrientation: "from-image" });
    bitmapCache.current.set(page.id, bmp);
    return bmp;
  }, []);

  const renderPageCanvas = useCallback(
    async (page: Page, maxDim: number, enhanced: boolean) => {
      const bitmap = await getBitmap(page);
      const base = buildBaseCanvas(bitmap, page.edit, maxDim);
      return enhanced ? applyEnhancements(base, page.edit) : base;
    },
    [getBitmap]
  );

  // --- Adding pages ---------------------------------------------------

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const valid = incoming.filter((f) => f.type.startsWith("image/"));
      if (valid.length !== incoming.length) {
        toast.error("Only image files are supported");
      }
      if (!valid.length) return;

      const newPages: Page[] = [];
      for (const file of valid) {
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
          const id = uid();
          bitmapCache.current.set(id, bitmap);
          const corners = await autoDetectCorners(bitmap);
          newPages.push({
            id,
            file,
            naturalWidth: bitmap.width,
            naturalHeight: bitmap.height,
            edit: { ...defaultEdit(), corners },
          });
        } catch {
          toast.error(`Couldn't read "${file.name}"`);
        }
      }
      if (newPages.length) {
        setPages((prev) => [...prev, ...newPages]);
        toast.success(newPages.length > 1 ? `${newPages.length} pages added` : "Page added");
      }
    },
    []
  );

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) addFiles(files);
  };

  // --- Thumbnails -------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = new Map(thumbUrls);
      for (const page of pages) {
        try {
          const canvas = await renderPageCanvas(page, THUMB_DIM, true);
          const blob = await canvasToJpegBlob(canvas, 0.75);
          if (cancelled) return;
          const old = next.get(page.id);
          const url = trackUrl(URL.createObjectURL(blob));
          next.set(page.id, url);
          if (old) revokeUrl(old);
        } catch {
          // skip a bad page rather than block the rest of the list
        }
      }
      for (const [id, url] of next) {
        if (!pages.find((p) => p.id === id)) {
          revokeUrl(url);
          next.delete(id);
        }
      }
      if (!cancelled) setThumbUrls(next);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, renderPageCanvas]);

  // --- Editor preview -----------------------------------------------------

  const editingPage = pages.find((p) => p.id === editingId) ?? null;

  useEffect(() => {
    if (!editingPage) {
      setEditorPreviewUrl((u) => {
        revokeUrl(u);
        return null;
      });
      setEditorRawUrl((u) => {
        revokeUrl(u);
        return null;
      });
      return;
    }
    let cancelled = false;
    setRendering(true);
    const timer = setTimeout(async () => {
      try {
        const canvas = await renderPageCanvas(editingPage, EDIT_PREVIEW_DIM, previewMode === "enhanced");
        const blob = await canvasToJpegBlob(canvas, 0.82);
        if (cancelled) return;
        const url = trackUrl(URL.createObjectURL(blob));
        setEditorPreviewUrl((old) => {
          revokeUrl(old);
          return url;
        });
      } catch {
        toast.error("Couldn't render preview");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPage?.id, editingPage?.edit, previewMode, renderPageCanvas]);

  useEffect(() => {
    if (!editingPage || !adjustingCorners) return;
    let cancelled = false;
    (async () => {
      const bitmap = await getBitmap(editingPage);
      const scale = Math.min(1, EDIT_PREVIEW_DIM / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
      const blob = await canvasToJpegBlob(canvas, 0.85);
      if (cancelled) return;
      const url = trackUrl(URL.createObjectURL(blob));
      setEditorRawUrl((old) => {
        revokeUrl(old);
        return url;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPage?.id, adjustingCorners, getBitmap]);

  const updateEdit = (id: string, patch: Partial<PageEdit>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, edit: { ...p.edit, ...patch } } : p)));
  };

  const applyPreset = (id: string, preset: PresetId) => {
    updateEdit(id, { preset, ...PRESETS[preset] });
  };

  const setCorner = (id: string, index: number, point: Point) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== id || !p.edit.corners) return p;
        const corners = [...p.edit.corners] as Corners;
        corners[index] = {
          x: clamp(point.x, 0, 1),
          y: clamp(point.y, 0, 1),
        };
        return { ...p, edit: { ...p.edit, corners } };
      })
    );
  };

  // --- Page list actions --------------------------------------------------

  const removePage = (id: string) => {
    const bmp = bitmapCache.current.get(id);
    if (bmp) {
      bmp.close();
      bitmapCache.current.delete(id);
    }
    setPages((prev) => prev.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
    toast.success("Page removed");
  };

  const resetAll = () => {
    if (!pages.length) return;
    pages.forEach((p) => {
      const bmp = bitmapCache.current.get(p.id);
      if (bmp) bmp.close();
    });
    bitmapCache.current.clear();
    setPages([]);
    setEditingId(null);
    toast.success("Cleared all pages");
  };

  const downloadPageJpg = async (page: Page, index: number) => {
    try {
      const q = QUALITY[quality];
      const canvas = await renderPageCanvas(page, q.maxDim, true);
      const blob = await canvasToJpegBlob(canvas, q.jpegQuality);
      downloadBlob(blob, `page-${index + 1}.jpg`);
      toast.success(`Page ${index + 1} downloaded`);
    } catch {
      toast.error("Couldn't download this page");
    }
  };

  // --- Reorder (pointer-based drag) ---------------------------------------

  const onGripPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { id };
    setDraggingId(id);
  };
  const onGripPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const draggedId = dragState.current.id;
    const y = e.clientY;
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === draggedId);
      if (idx === -1) return prev;
      let targetIdx = prev.length - 1;
      for (let i = 0; i < prev.length; i++) {
        const el = cardRefs.current.get(prev[i].id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        if (y < center) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === idx) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };
  const onGripPointerUp = () => {
    dragState.current = null;
    setDraggingId(null);
  };

  // --- Export --------------------------------------------------------------

  const exportPdf = async () => {
    if (!pages.length) return;
    setExporting(true);
    setExportProgress({ done: 0, total: pages.length });
    try {
      const doc = await PDFDocument.create();
      const q = QUALITY[quality];
      for (const page of pages) {
        const canvas = await renderPageCanvas(page, q.maxDim, true);
        const blob = await canvasToJpegBlob(canvas, q.jpegQuality);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const jpg = await doc.embedJpg(bytes);

        let pageW: number;
        let pageH: number;
        let margin: number;
        if (pageSize === "a4") {
          pageW = 595.28;
          pageH = 841.89;
          margin = 24;
        } else if (pageSize === "letter") {
          pageW = 612;
          pageH = 792;
          margin = 24;
        } else {
          // Auto: keep the page portrait regardless of the photo's own orientation.
          pageW = Math.min(canvas.width, canvas.height);
          pageH = Math.max(canvas.width, canvas.height);
          margin = 0;
        }
        const pdfPage = doc.addPage([pageW, pageH]);
        const boxW = pageW - margin * 2;
        const boxH = pageH - margin * 2;
        const scale = Math.min(boxW / canvas.width, boxH / canvas.height);
        const drawW = canvas.width * scale;
        const drawH = canvas.height * scale;
        pdfPage.drawImage(jpg, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
        setExportProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "scanned-document.pdf");
      toast.success(pages.length > 1 ? `Exported ${pages.length} pages to PDF` : "Exported to PDF");
      showSupportPrompt();
    } catch {
      toast.error("Couldn't export the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // --- Desktop fallback ------------------------------------------------

  if (isMobile === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-foreground bg-background px-6 py-16 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-muted">
          <Monitor className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold">This tool is designed for mobile devices.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Use Quickly on your phone to scan, clean, and convert documents using your camera.
        </p>
      </div>
    );
  }

  if (isMobile === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // --- Editor view -----------------------------------------------------

  if (editingPage) {
    const edit = editingPage.edit;
    const index = pages.findIndex((p) => p.id === editingPage.id);

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdjustingCorners(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-sm font-semibold">
            Page {index + 1} of {pages.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdjustingCorners(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl border-2 border-foreground bg-muted shadow-[3px_3px_0_0_var(--color-foreground)]">
          {adjustingCorners && editorRawUrl ? (
            <CornerAdjuster
              imageUrl={editorRawUrl}
              corners={edit.corners ?? [
                { x: 0.05, y: 0.05 },
                { x: 0.95, y: 0.05 },
                { x: 0.95, y: 0.95 },
                { x: 0.05, y: 0.95 },
              ]}
              onChange={(i, pt) => setCorner(editingPage.id, i, pt)}
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center">
              {editorPreviewUrl ? (
                <img src={editorPreviewUrl} alt="Page preview" className="max-h-full max-w-full object-contain" />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin" />
              )}
            </div>
          )}

          {rendering && !adjustingCorners && (
            <div className="absolute right-2 top-2 rounded-full border-2 border-foreground bg-background px-2 py-1 text-[10px] font-semibold">
              Rendering…
            </div>
          )}

          {!adjustingCorners && (
            <div className="absolute left-2 top-2 flex overflow-hidden rounded-full border-2 border-foreground bg-background text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setPreviewMode("original")}
                className={`px-2.5 py-1 ${previewMode === "original" ? "bg-primary text-primary-foreground" : ""}`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("enhanced")}
                className={`px-2.5 py-1 ${previewMode === "enhanced" ? "bg-primary text-primary-foreground" : ""}`}
              >
                Enhanced
              </button>
            </div>
          )}
        </div>

        {adjustingCorners ? (
          <button
            type="button"
            onClick={() => setAdjustingCorners(false)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Check className="h-4 w-4" />
            Apply crop
          </button>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PRESET_LABELS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(editingPage.id, id)}
                  className={`shrink-0 rounded-full border-2 border-foreground px-3.5 py-1.5 text-xs font-semibold hover:opacity-90 ${
                    edit.preset === id ? "bg-primary text-primary-foreground" : "bg-background"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setAdjustingCorners(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground py-2 text-xs font-semibold hover:opacity-90"
              >
                <Crop className="h-3.5 w-3.5" />
                Adjust corners
              </button>
              <button
                type="button"
                onClick={() => updateEdit(editingPage.id, { rotation: (((edit.rotation + 270) % 360) as PageEdit["rotation"]) })}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground py-2 text-xs font-semibold hover:opacity-90"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Rotate
              </button>
              <button
                type="button"
                onClick={() => updateEdit(editingPage.id, { rotation: (((edit.rotation + 90) % 360) as PageEdit["rotation"]) })}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground py-2 text-xs font-semibold hover:opacity-90"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Rotate
              </button>
              <button
                type="button"
                onClick={() => updateEdit(editingPage.id, { ...defaultEdit(), corners: edit.corners })}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground py-2 text-xs font-semibold hover:opacity-90"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset page
              </button>
            </div>

            <div className="space-y-4 rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
              <SliderRow
                label="Straighten"
                value={edit.straighten}
                min={-15}
                max={15}
                onChange={(v) => updateEdit(editingPage.id, { straighten: v })}
              />
              <SliderRow
                label="Brightness"
                value={edit.brightness}
                min={-100}
                max={100}
                onChange={(v) => updateEdit(editingPage.id, { brightness: v })}
              />
              <SliderRow
                label="Contrast"
                value={edit.contrast}
                min={-100}
                max={100}
                onChange={(v) => updateEdit(editingPage.id, { contrast: v })}
              />
              <SliderRow
                label="Sharpness"
                value={edit.sharpness}
                min={0}
                max={100}
                onChange={(v) => updateEdit(editingPage.id, { sharpness: v })}
              />

              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={edit.removeShadows}
                    onChange={(e) => updateEdit(editingPage.id, { removeShadows: e.target.checked })}
                    className="h-4 w-4 rounded border-2 border-foreground accent-foreground"
                  />
                  Remove shadows
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={edit.removeBackground}
                    onChange={(e) => updateEdit(editingPage.id, { removeBackground: e.target.checked })}
                    className="h-4 w-4 rounded border-2 border-foreground accent-foreground"
                  />
                  Remove background
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Empty state -------------------------------------------------------

  if (pages.length === 0) {
    return (
      <div className="space-y-4">
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraChange} />
        <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-foreground bg-background px-6 py-14 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-muted">
            <ScanLine className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-semibold">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Take a photo or upload images to get started</p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </button>
          </div>
        </div>
        <FileDrop accept="image/png,image/jpeg,image/webp" multiple files={[]} onFiles={addFiles} hint="Or upload existing document photos" />
      </div>
    );
  }

  // --- Page list view ------------------------------------------------------

  return (
    <div className="space-y-6">
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraChange} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold">
          {pages.length} page{pages.length > 1 ? "s" : ""}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >
            <Camera className="h-3.5 w-3.5" />
            Add photo
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      <FileDrop accept="image/png,image/jpeg,image/webp" multiple files={[]} onFiles={addFiles} hint="Add more pages (order = list order)" />

      <div className="space-y-3">
        {pages.map((page, i) => {
          const thumb = thumbUrls.get(page.id);
          return (
            <div
              key={page.id}
              ref={(el) => {
                if (el) cardRefs.current.set(page.id, el);
                else cardRefs.current.delete(page.id);
              }}
              onPointerMove={onGripPointerMove}
              onPointerUp={onGripPointerUp}
              className={`flex items-center gap-3 rounded-xl border-2 border-foreground bg-background p-2.5 shadow-[3px_3px_0_0_var(--color-foreground)] ${
                draggingId === page.id ? "opacity-70" : ""
              }`}
            >
              <button
                type="button"
                onPointerDown={(e) => onGripPointerDown(e, page.id)}
                aria-label="Reorder page"
                style={{ touchAction: "none" }}
                className="flex h-9 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-foreground hover:opacity-90"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-foreground bg-muted">
                <span className="absolute left-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-foreground bg-background text-[9px] font-bold">
                  {i + 1}
                </span>
                {thumb ? (
                  <img src={thumb} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{page.file.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{PRESET_LABELS.find((p) => p.id === page.edit.preset)?.label}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(page.id);
                    setPreviewMode("enhanced");
                    setAdjustingCorners(false);
                  }}
                  aria-label="Edit page"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground hover:opacity-90"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadPageJpg(page, i)}
                  aria-label="Download page as JPG"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removePage(page.id)}
                  aria-label="Remove page"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground hover:opacity-90"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4 rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Page size</p>
            <div className="flex overflow-hidden rounded-lg border-2 border-foreground text-xs font-semibold">
              {PAGE_SIZE_LABELS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPageSize(id)}
                  className={`flex-1 py-1.5 ${pageSize === id ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">File size</p>
            <div className="flex overflow-hidden rounded-lg border-2 border-foreground text-xs font-semibold">
              {(Object.keys(QUALITY) as QualityId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setQuality(id)}
                  className={`flex-1 py-1.5 ${quality === id ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {QUALITY[id].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={exportPdf}
          disabled={exporting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting… ({exportProgress.done}/{exportProgress.total})
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Export {pages.length}-page PDF
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// --- Small shared UI pieces -----------------------------------------------

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
      />
    </div>
  );
}

function CornerAdjuster({
  imageUrl,
  corners,
  onChange,
}: {
  imageUrl: string;
  corners: Corners;
  onChange: (index: number, point: Point) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);

  const handlePointer = (clientX: number, clientY: number) => {
    if (dragIndex.current === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    onChange(dragIndex.current, {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    });
  };

  return (
    <div ref={containerRef} className="relative aspect-[3/4] w-full select-none">
      <img src={imageUrl} alt="Adjust document corners" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <polygon
          points={corners.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(" ")}
          fill="rgba(255,255,255,0.18)"
          stroke="white"
          strokeWidth={2}
        />
      </svg>
      {corners.map((c, i) => (
        <div
          key={i}
          onPointerDown={(e) => {
            e.preventDefault();
            dragIndex.current = i;
            (e.target as Element).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => handlePointer(e.clientX, e.clientY)}
          onPointerUp={() => {
            dragIndex.current = null;
          }}
          style={{
            left: `${c.x * 100}%`,
            top: `${c.y * 100}%`,
            touchAction: "none",
          }}
          className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-primary shadow-[2px_2px_0_0_var(--color-foreground)]"
        />
      ))}
    </div>
  );
}
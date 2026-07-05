import { useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toast } from "sonner";
import { Download, Hash } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

type Position = "br" | "bc" | "bl" | "tr" | "tc" | "tl";

// Where each position sits on the visual page silhouette below.
const POSITION_SPOTS: [Position, string][] = [
  ["tl", "top-2 left-2"],
  ["tc", "top-2 left-1/2 -translate-x-1/2"],
  ["tr", "top-2 right-2"],
  ["bl", "bottom-2 left-2"],
  ["bc", "bottom-2 left-1/2 -translate-x-1/2"],
  ["br", "bottom-2 right-2"],
];

// One-tap font sizes covering the common range for page numbers.
const SIZE_PRESETS = [9, 10, 12, 14, 16];

// One-tap margins covering the common range.
const MARGIN_PRESETS = [12, 18, 24, 36, 48];

// One-tap colors so a common choice never needs the color picker.
const COLOR_PRESETS = ["#26262e", "#6b7280", "#2563eb", "#dc2626", "#ffffff"];

export default function PageNumbers() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [position, setPosition] = useState<Position>("br");
  const [size, setSize] = useState(12);
  const [startAt, setStartAt] = useState(1);
  const [margin, setMargin] = useState(24);
  const [color, setColor] = useState("#26262e");

  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };

  const run = async () => {
    if (!files[0]) return;
    try {
      const doc = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.getPages().forEach((page, i) => {
        const label = String(i + startAt);
        const { width, height } = page.getSize();
        const tw = font.widthOfTextAtSize(label, size);
        const m = margin;
        let x = m, y = m;
        if (position.includes("r")) x = width - tw - m;
        if (position.includes("c")) x = (width - tw) / 2;
        if (position.startsWith("t")) y = height - size - m;
        page.drawText(label, { x, y, size, font, color: hexToRgb(color) });
      });
      downloadBlob(new Blob([await doc.save() as BlobPart], { type: "application/pdf" }), "numbered.pdf");
      toast.success("Numbered");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Hash className="h-3.5 w-3.5" />
          Page Numbers
        </span>
      </div>

      <FileDrop accept="application/pdf" files={files} onFiles={setFiles} />

      {files[0] && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Visual page silhouette instead of a dropdown — click where the number should sit. */}
            <div className="block">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Position
              </span>
              <div className="relative mt-2 h-36 w-full rounded-xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)]">
                {POSITION_SPOTS.map(([pos, spot]) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPosition(pos)}
                    aria-pressed={position === pos}
                    aria-label={`Place page number at ${pos}`}
                    className={
                      "absolute flex h-8 w-8 items-center justify-center rounded-lg border-2 border-foreground text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                      spot +
                      " " +
                      (position === pos
                        ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                        : "bg-secondary/40")
                    }
                  >
                    1
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Font size
                </span>
                <input
                  type="number"
                  min={6}
                  max={48}
                  value={size}
                  onChange={(e) => setSize(+e.target.value)}
                  aria-label="Font size"
                  className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SIZE_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSize(v)}
                      aria-pressed={size === v}
                      className={
                        "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                        (size === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                      }
                    >
                      {v}pt
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Margin (pt)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={margin}
                  onChange={(e) => setMargin(+e.target.value)}
                  aria-label="Margin in points"
                  className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MARGIN_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMargin(v)}
                      aria-pressed={margin === v}
                      className={
                        "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                        (margin === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                      }
                    >
                      {v}pt
                    </button>
                  ))}
                </div>
              </label>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Starting number
              </span>
              <input
                type="number"
                min={1}
                value={startAt}
                onChange={(e) => setStartAt(Math.max(1, +e.target.value || 1))}
                aria-label="Starting number"
                className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
              />
            </label>

            <label className="block">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Color
              </span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Page number color"
                  className="h-11 w-14 shrink-0 rounded-xl border-2 border-foreground bg-card px-1 shadow-[3px_3px_0_0_var(--color-foreground)]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Use color ${c}`}
                      aria-pressed={color === c}
                      style={{ backgroundColor: c }}
                      className={
                        "h-8 w-8 rounded-full border-2 border-foreground transition-transform hover:-translate-y-0.5 " +
                        (color === c ? "shadow-[2px_2px_0_0_var(--color-foreground)] ring-2 ring-primary ring-offset-2" : "")
                      }
                    />
                  ))}
                </div>
              </div>
            </label>
          </div>

          <button
            type="button"
            onClick={run}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <Download className="h-4 w-4" /> Apply &amp; Download
          </button>
        </>
      )}
    </div>
  );
}
import { useState } from "react";
import { toast } from "sonner";
import { Presentation, Download, RotateCcw } from "lucide-react";
import JSZip from "jszip";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { stripExtension, downloadBlob } from "@/lib/document-tools";
import { useDocumentJob } from "@/hooks/useDocumentJob";
import DocumentDropzone from "@/components/document/DocumentDropzone";
import DocProcessingOverlay from "@/components/document/DocProcessingOverlay";

interface SlideElement {
  type: "text" | "image";
  x: number; y: number; w: number; h: number; // percent of slide
  text?: string;
  fontSize?: number;
  imageSrc?: string;
}

interface Slide {
  elements: SlideElement[];
  background?: string;
}

const EMU_PER_INCH = 914400;

function parseColor(xml: string): string | undefined {
  const match = xml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  return match ? `#${match[1]}` : undefined;
}

async function parsePptx(file: File, onProgress: (p: number) => void): Promise<{ slides: Slide[]; width: number; height: number }> {
  const zip = await JSZip.loadAsync(file);

  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) throw new Error("This doesn't look like a valid PowerPoint file.");

  const sizeMatch = presentationXml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
  const slideWidthEmu = sizeMatch ? parseInt(sizeMatch[1]) : 9144000;
  const slideHeightEmu = sizeMatch ? parseInt(sizeMatch[2]) : 6858000;

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)![1]);
      const nb = parseInt(b.match(/slide(\d+)/)![1]);
      return na - nb;
    });

  if (slideFiles.length === 0) throw new Error("This presentation has no slides.");

  const slides: Slide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])!.async("text");
    const slideNum = i + 1;
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relsXml = await zip.file(relsPath)?.async("text");
    const relMap: Record<string, string> = {};
    if (relsXml) {
      const relMatches = relsXml.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"/g);
      for (const m of relMatches) relMap[m[1]] = m[2].replace("../", "ppt/");
    }

    const elements: SlideElement[] = [];

    // Text boxes: match each <p:sp> block, extract position + concatenated text runs.
    const spBlocks = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
    for (const sp of spBlocks) {
      const offMatch = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const extMatch = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      const textRuns = [...sp.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
      const sizeMatch2 = sp.match(/sz="(\d+)"/);

      if (textRuns.trim() && offMatch && extMatch) {
        elements.push({
          type: "text",
          x: (parseInt(offMatch[1]) / slideWidthEmu) * 100,
          y: (parseInt(offMatch[2]) / slideHeightEmu) * 100,
          w: (parseInt(extMatch[1]) / slideWidthEmu) * 100,
          h: (parseInt(extMatch[2]) / slideHeightEmu) * 100,
          text: textRuns,
          fontSize: sizeMatch2 ? parseInt(sizeMatch2[1]) / 100 : 18,
        });
      }
    }

    // Images: match <p:pic> blocks, resolve r:embed via relationship map, extract as base64.
    const picBlocks = slideXml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || [];
    for (const pic of picBlocks) {
      const embedMatch = pic.match(/r:embed="(rId\d+)"/);
      const offMatch = pic.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const extMatch = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      if (embedMatch && relMap[embedMatch[1]] && offMatch && extMatch) {
        const imgPath = relMap[embedMatch[1]];
        const imgFile = zip.file(imgPath);
        if (imgFile) {
          const base64 = await imgFile.async("base64");
          const ext = imgPath.split(".").pop()?.toLowerCase() || "png";
          const mime = ext === "jpg" ? "jpeg" : ext;
          elements.push({
            type: "image",
            x: (parseInt(offMatch[1]) / slideWidthEmu) * 100,
            y: (parseInt(offMatch[2]) / slideHeightEmu) * 100,
            w: (parseInt(extMatch[1]) / slideWidthEmu) * 100,
            h: (parseInt(extMatch[2]) / slideHeightEmu) * 100,
            imageSrc: `data:image/${mime};base64,${base64}`,
          });
        }
      }
    }

    const background = parseColor(slideXml.match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0] || "");

    slides.push({ elements, background });
    onProgress(10 + (40 * (i + 1)) / slideFiles.length);
  }

  return {
    slides,
    width: slideWidthEmu / EMU_PER_INCH,
    height: slideHeightEmu / EMU_PER_INCH,
  };
}

export default function PowerPointToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { status, progress, stepLabel, errorMessage, run, cancel, reset } = useDocumentJob();

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleReset = () => {
    setFile(null);
    setResultBlob(null);
    reset();
  };

  const handleConvert = async () => {
    if (!file) return;
    setResultBlob(null);

    await run("converting this presentation", async (setProgress, checkCancelled) => {
      setProgress(5, "Reading presentation…");
      const { slides, width, height } = await parsePptx(file, (p) => setProgress(p, "Extracting slides…"));
      checkCancelled();

      const DPI = 96;
      const pageWidthPx = width * DPI;
      const pageHeightPx = height * DPI;

      const pdf = new jsPDF({ unit: "pt", orientation: width > height ? "landscape" : "portrait", format: [width * 72, height * 72] });

      const stage = document.createElement("div");
      stage.style.position = "fixed";
      stage.style.left = "-9999px";
      stage.style.top = "0";
      stage.style.width = `${pageWidthPx}px`;
      stage.style.height = `${pageHeightPx}px`;
      document.body.appendChild(stage);

      try {
        for (let i = 0; i < slides.length; i++) {
          checkCancelled();
          const slide = slides[i];
          stage.innerHTML = "";
          stage.style.background = slide.background || "#ffffff";
          stage.style.position = "fixed";

          for (const el of slide.elements) {
            const div = document.createElement("div");
            div.style.position = "absolute";
            div.style.left = `${el.x}%`;
            div.style.top = `${el.y}%`;
            div.style.width = `${el.w}%`;
            div.style.height = `${el.h}%`;
            if (el.type === "text") {
              div.style.fontSize = `${el.fontSize}pt`;
              div.style.overflow = "hidden";
              div.style.fontFamily = "Arial, sans-serif";
              div.textContent = el.text || "";
            } else if (el.type === "image" && el.imageSrc) {
              const img = document.createElement("img");
              img.src = el.imageSrc;
              img.style.width = "100%";
              img.style.height = "100%";
              img.style.objectFit = "contain";
              div.appendChild(img);
            }
            stage.appendChild(div);
          }

          setProgress(50 + (40 * (i + 1)) / slides.length, `Rendering slide ${i + 1}/${slides.length}…`);
          await new Promise((r) => setTimeout(r, 30));
          checkCancelled();

          const canvas = await html2canvas(stage, { width: pageWidthPx, height: pageHeightPx, scale: 1.5, useCORS: true });
          const imgData = canvas.toDataURL("image/jpeg", 0.9);

          if (i > 0) pdf.addPage([width * 72, height * 72]);
          pdf.addImage(imgData, "JPEG", 0, 0, width * 72, height * 72);
        }
      } finally {
        document.body.removeChild(stage);
      }

      setProgress(95, "Finalizing…");
      setResultBlob(pdf.output("blob"));
      setProgress(100, "Done");
    });
  };

  const handleDownload = () => {
    if (!resultBlob || !file) return;
    downloadBlob(resultBlob, `${stripExtension(file.name)}.pdf`);
    toast.success("Downloaded");
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <DocumentDropzone
          onFile={handleFile}
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          label="Drop a .pptx file here, or click to browse"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Selected: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button onClick={handleReset} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>

          {status === "idle" && (
            <button
              onClick={handleConvert}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Presentation className="h-4 w-4" /> Convert to PDF
            </button>
          )}

          <p className="text-xs text-muted-foreground">
            Note: text, images, and slide backgrounds are preserved. Animations, charts, SmartArt, and complex shape effects aren't supported — best results come from text/image-based slides.
          </p>
        </div>
      )}

      <DocProcessingOverlay status={status} progress={progress} stepLabel={stepLabel} errorMessage={errorMessage} onCancel={cancel} />

      {resultBlob && status === "done" && (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
          <p className="text-xs uppercase text-muted-foreground">Preview</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <iframe src={URL.createObjectURL(resultBlob)} className="h-[500px] w-full rounded-lg border border-border" title="PDF preview" />
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      )}
    </div>
  );
}
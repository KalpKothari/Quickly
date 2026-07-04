import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, Download, RotateCcw } from "lucide-react";
import mammoth from "mammoth";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { stripExtension, downloadBlob } from "@/lib/document-tools";
import { useDocumentJob } from "@/hooks/useDocumentJob";
import DocumentDropzone from "@/components/document/DocumentDropzone";
import DocProcessingOverlay from "@/components/document/DocProcessingOverlay";

export default function WordToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const { status, progress, stepLabel, errorMessage, run, cancel, reset } = useDocumentJob();

  const handleFile = (f: File) => {
    setFile(f);
    setHtmlContent(null);
    setResultBlob(null);
    reset();
  };

  const handleReset = () => {
    setFile(null);
    setHtmlContent(null);
    setResultBlob(null);
    reset();
  };

  const handleConvert = async () => {
    if (!file) return;
    setResultBlob(null);
    setHtmlContent(null);

    await run("converting this document", async (setProgress, checkCancelled) => {
      setProgress(10, "Reading document…");
      const arrayBuffer = await file.arrayBuffer();
      checkCancelled();

      setProgress(30, "Extracting content…");
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement((image) =>
            image.read("base64").then((imageBuffer) => ({
              src: `data:${image.contentType};base64,${imageBuffer}`,
            })),
          ),
        },
      );
      checkCancelled();

      if (!result.value || result.value.trim().length === 0) {
        throw new Error("This document appears to be empty.");
      }

      setHtmlContent(result.value);
      setProgress(50, "Rendering pages…");

      // Give the DOM a tick to actually paint the injected HTML before we rasterize it.
      await new Promise((r) => setTimeout(r, 50));
      checkCancelled();

      const container = renderRef.current;
      if (!container) throw new Error("Rendering surface not ready.");

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidthPt = pdf.internal.pageSize.getWidth();
      const pageHeightPt = pdf.internal.pageSize.getHeight();

      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      checkCancelled();
      setProgress(75, "Building PDF…");

      const imgWidthPt = pageWidthPt;
      const imgHeightPt = (canvas.height * imgWidthPt) / canvas.width;
      const pageCount = Math.ceil(imgHeightPt / pageHeightPt);

      const pxPerPage = (canvas.height / imgHeightPt) * pageHeightPt;

      for (let i = 0; i < pageCount; i++) {
        if (i > 0) pdf.addPage();
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(pxPerPage, canvas.height - i * pxPerPage);
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, i * pxPerPage, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        const sliceHeightPt = (sliceCanvas.height * imgWidthPt) / canvas.width;
        pdf.addImage(sliceData, "JPEG", 0, 0, imgWidthPt, sliceHeightPt);
        setProgress(75 + (15 * (i + 1)) / pageCount, `Building PDF (page ${i + 1}/${pageCount})…`);
        checkCancelled();
      }

      setProgress(95, "Finalizing…");
      const pdfBlob = pdf.output("blob");
      setResultBlob(pdfBlob);
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
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          label="Drop a .docx file here, or click to browse"
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
              <FileDown className="h-4 w-4" /> Convert to PDF
            </button>
          )}

          <p className="text-xs text-muted-foreground">
            Note: formatting, headings, images, and simple tables are preserved. Complex Word layouts (multi-column text, footnotes, exact pagination) may render slightly differently than in Word itself.
          </p>
        </div>
      )}

      <DocProcessingOverlay status={status} progress={progress} stepLabel={stepLabel} errorMessage={errorMessage} onCancel={cancel} />

      {/* Hidden off-screen render target used for rasterizing the converted HTML */}
      {htmlContent && (
        <div className="pointer-events-none fixed left-[-9999px] top-0 w-[794px] bg-white p-10" ref={renderRef}>
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      )}

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
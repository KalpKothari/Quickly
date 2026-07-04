import { useMemo, useRef, useState } from "react";
import { RotateCcw, FileText, ArrowLeftRight, ChevronDown, ChevronUp, UploadCloud, FileMinus, FilePlus } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { diffWords } from "diff";
import { cn } from "@/lib/utils";
import { useDocumentJob } from "@/hooks/useDocumentJob";
import DocumentDropzone from "@/components/document/DocumentDropzone";
import DocProcessingOverlay from "@/components/document/DocProcessingOverlay";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPageText(doc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? (item as { str: string }).str : "")).join(" ");
}

async function extractFullText(file: File): Promise<{ text: string; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    pages.push(normalizeText(await extractPageText(doc, p)));
  }
  return { text: pages.join("\n\n"), pageCount: doc.numPages };
}

export default function ComparePdfs() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [pageCountA, setPageCountA] = useState(0);
  const [pageCountB, setPageCountB] = useState(0);
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [activeDiffIndex, setActiveDiffIndex] = useState(0);
  const diffRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const combinedInputRef = useRef<HTMLInputElement>(null);
  const { status, progress, stepLabel, errorMessage, run, cancel, reset } = useDocumentJob();

  const handleReset = () => {
    setFileA(null);
    setFileB(null);
    setPageCountA(0);
    setPageCountB(0);
    setTextA("");
    setTextB("");
    setActiveDiffIndex(0);
    reset();
  };

  const loadPair = async (a: File, b: File) => {
    await run("comparing these PDFs", async (setProgress, checkCancelled) => {
      setProgress(20, "Extracting text from first PDF…");
      const resultA = await extractFullText(a);
      checkCancelled();
      setPageCountA(resultA.pageCount);
      setTextA(resultA.text);

      setProgress(60, "Extracting text from second PDF…");
      const resultB = await extractFullText(b);
      checkCancelled();
      setPageCountB(resultB.pageCount);
      setTextB(resultB.text);

      setProgress(100, "Done");
    });
  };

  const handleFileA = (f: File) => {
    setFileA(f);
    if (fileB) loadPair(f, fileB);
  };
  const handleFileB = (f: File) => {
    setFileB(f);
    if (fileA) loadPair(fileA, f);
  };

  const handleCombinedPick = (files: FileList) => {
    const list = Array.from(files).filter((f) => f.type === "application/pdf");
    if (list.length === 0) return;
    if (list.length === 1) {
      if (!fileA) handleFileA(list[0]);
      else handleFileB(list[0]);
      return;
    }
    handleFileA(list[0]);
    handleFileB(list[1]);
  };

  const handleSwap = () => {
    if (!fileA || !fileB) return;
    const newA = fileB;
    const newB = fileA;
    setFileA(newA);
    setFileB(newB);
    setActiveDiffIndex(0);
    loadPair(newA, newB);
  };

  const wordDiffParts = diffWords(textA, textB);
  const isIdentical = textA === textB;

  const diffIndices = useMemo(
    () => wordDiffParts.map((p, i) => (p.added || p.removed ? i : -1)).filter((i) => i !== -1),
    [wordDiffParts],
  );
  const wordsAdded = wordDiffParts.filter((p) => p.added).reduce((sum, p) => sum + p.value.trim().split(/\s+/).filter(Boolean).length, 0);
  const wordsRemoved = wordDiffParts.filter((p) => p.removed).reduce((sum, p) => sum + p.value.trim().split(/\s+/).filter(Boolean).length, 0);

  // Presentation-only grouping of the same diff parts — no new comparison logic.
  // "Only in A" = removed segments (present in text A, absent from B).
  // "Only in B" = added segments (absent from text A, present in B).
  const onlyInA = useMemo(
    () => wordDiffParts.filter((p) => p.removed && p.value.trim().length > 0).map((p) => p.value.trim()),
    [wordDiffParts],
  );
  const onlyInB = useMemo(
    () => wordDiffParts.filter((p) => p.added && p.value.trim().length > 0).map((p) => p.value.trim()),
    [wordDiffParts],
  );

  const jumpTo = (direction: 1 | -1) => {
    if (diffIndices.length === 0) return;
    const currentPos = diffIndices.indexOf(activeDiffIndex);
    const nextPos = currentPos === -1 ? 0 : (currentPos + direction + diffIndices.length) % diffIndices.length;
    const nextIndex = diffIndices[nextPos];
    setActiveDiffIndex(nextIndex);
    diffRefs.current[nextIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const bothFilesReady = fileA && fileB && status === "done";

  return (
    <div className="space-y-6">
      {!bothFilesReady && (
        <div>
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
            Add the two PDFs you want to compare
          </p>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) handleCombinedPick(e.dataTransfer.files);
            }}
            onClick={() => combinedInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-foreground/40 bg-card p-8 text-center transition-all hover:-translate-y-0.5 hover:border-foreground hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-primary" style={{ transform: "rotate(-6deg)" }}>
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="text-sm font-bold">
              Drop both PDFs here at once, or <span className="text-primary underline decoration-2 underline-offset-2">browse</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Select 2 files together — they'll be compared automatically</div>
            <input
              ref={combinedInputRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => e.target.files && handleCombinedPick(e.target.files)}
              className="hidden"
            />
          </div>

          {(fileA || fileB) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  First PDF
                </p>
                {!fileA ? (
                  <DocumentDropzone onFile={handleFileA} accept="application/pdf" label="Drop first PDF here" />
                ) : (
                  <p className="rounded-2xl border-2 border-foreground bg-card p-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]">
                    {fileA.name}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <p className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Second PDF
                </p>
                {!fileB ? (
                  <DocumentDropzone onFile={handleFileB} accept="application/pdf" label="Drop second PDF here" />
                ) : (
                  <p className="rounded-2xl border-2 border-foreground bg-card p-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]">
                    {fileB.name}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <DocProcessingOverlay status={status} progress={progress} stepLabel={stepLabel} errorMessage={errorMessage} onCancel={cancel} />

      {bothFilesReady && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span>{fileA.name}</span>
              <span className="rounded-full border-2 border-foreground bg-background px-2 py-0.5 text-xs">{pageCountA} pages</span>
              <span className="text-muted-foreground">vs</span>
              <span>{fileB.name}</span>
              <span className="rounded-full border-2 border-foreground bg-background px-2 py-0.5 text-xs">{pageCountB} pages</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSwap}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
              </button>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-destructive hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Start over
              </button>
            </div>
          </div>

          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
            Comparison result
          </p>

          {isIdentical ? (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700 shadow-[4px_4px_0_0_var(--color-foreground)] dark:text-emerald-400">
              No text differences found — these documents appear identical.
            </div>
          ) : (
            <>
              {/* NEW: Only-in-A / Only-in-B breakdown, using the same diff parts already computed */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 rounded-2xl border-2 border-red-500 bg-red-500/5 p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
                  <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
                    <FileMinus className="h-3.5 w-3.5" /> Only in {fileA.name}
                  </p>
                  {onlyInA.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing found only in this file.</p>
                  ) : (
                    <ul className="max-h-64 space-y-1.5 overflow-auto text-sm">
                      {onlyInA.map((chunk, idx) => (
                        <li key={idx} className="rounded-lg border-2 border-red-500/30 bg-background px-2.5 py-1.5 text-red-700 dark:text-red-400">
                          {chunk}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2 rounded-2xl border-2 border-emerald-500 bg-emerald-500/5 p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
                  <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    <FilePlus className="h-3.5 w-3.5" /> Only in {fileB.name}
                  </p>
                  {onlyInB.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing found only in this file.</p>
                  ) : (
                    <ul className="max-h-64 space-y-1.5 overflow-auto text-sm">
                      {onlyInB.map((chunk, idx) => (
                        <li key={idx} className="rounded-lg border-2 border-emerald-500/30 bg-background px-2.5 py-1.5 text-emerald-700 dark:text-emerald-400">
                          {chunk}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Existing inline diff view — unchanged */}
              <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> Text Differences
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border-2 border-foreground bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      +{wordsAdded} added
                    </span>
                    <span className="rounded-full border-2 border-foreground bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:text-red-400">
                      -{wordsRemoved} removed
                    </span>
                    {diffIndices.length > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => jumpTo(-1)}
                          className="rounded-full border-2 border-foreground bg-background p-1.5 transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-foreground)]"
                          aria-label="Previous change"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => jumpTo(1)}
                          className="rounded-full border-2 border-foreground bg-background p-1.5 transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-foreground)]"
                          aria-label="Next change"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="max-h-[600px] overflow-auto rounded-xl border-2 border-foreground bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {wordDiffParts.map((part, idx) => (
                    <span
                      key={idx}
                      ref={(el) => {
                        if (part.added || part.removed) diffRefs.current[idx] = el;
                      }}
                      className={cn(
                        part.added && "rounded bg-emerald-500/20 px-0.5 font-semibold text-emerald-700 dark:text-emerald-400",
                        part.removed && "rounded bg-red-500/20 px-0.5 text-red-700 line-through dark:text-red-400",
                        activeDiffIndex === idx && (part.added || part.removed) && "ring-2 ring-primary",
                      )}
                    >
                      {part.value}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
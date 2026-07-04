import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Music, Download, RotateCcw, ArrowRight } from "lucide-react";
import { fetchFile, getExtension } from "@/lib/ffmpeg-core";
import { useFFmpegJob } from "@/hooks/useFFmpegJob";
import VideoDropzone from "@/components/video/VideoDropzone";
import ProcessingOverlay from "@/components/video/ProcessingOverlay";
import { fileDataToBlob } from "@/lib/blob";

export default function ExtractAudio() {
  const [file, setFile] = useState<File | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { status, progress, errorMessage, run, cancel, reset } = useFFmpegJob();

  useEffect(() => {
    if (!resultBlob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(resultBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resultBlob]);

  const handleFile = (f: File) => {
    setFile(f);
    setResultBlob(null);
    reset();
  };

  const handleResetWorkspace = () => {
    setFile(null);
    setResultBlob(null);
    reset();
  };

  const handleExtract = async (targetFile: File) => {
    if (!targetFile) return;
    setResultBlob(null);
    const ext = getExtension(targetFile.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(targetFile));
      checkCancelled();
      await ffmpeg.exec(["-i", `input.${ext}`, "-vn", "-acodec", "libmp3lame", "-q:a", "2", "output.mp3"]);
      checkCancelled();
      const data = await ffmpeg.readFile("output.mp3");
      setResultBlob(fileDataToBlob(data, "audio/mp3"));
      await ffmpeg.deleteFile(`input.${ext}`);
      await ffmpeg.deleteFile("output.mp3");
    });
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `${file?.name.replace(/\.[^.]+$/, "") || "audio"}.mp3`;
    a.click();
  };

  // Trigger processing automatically once a file is dropped into the canvas
  useEffect(() => {
    if (file && !resultBlob && status === "idle") {
      handleExtract(file);
    }
  }, [file]);

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Music className="h-3.5 w-3.5" />
            Audio Extractor
          </span>
        </div>
      </div>

      {!file ? (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <VideoDropzone onFile={handleFile} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Metadata & Quick Reset Toolbar Layout - Capsule Pill Layout */}
          <div className="rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-[3px_3px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                1
              </span>
              <div className="text-sm font-semibold text-foreground truncate">
                {file.name}
                <span className="text-muted-foreground font-normal"> (Source File Asset)</span>
              </div>
            </div>
            
            <button
              onClick={handleResetWorkspace}
              className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Change Video
            </button>
          </div>

          {/* Fallback Manual Trigger Option */}
          {status === "idle" && !resultBlob && (
            <button
              onClick={() => handleExtract(file)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Music className="h-5 w-5" /> Run Audio Extraction <ArrowRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Processing State Interstitial Overlay */}
      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />

      {/* Visual Result Rendering Panel */}
      {audioUrl && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 px-1">
                Preview (Extracted MP3 Audio File)
              </div>
              
              <div className="rounded-xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-4 shadow-[2px_2px_0_0_var(--color-foreground)]">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio src={audioUrl} controls className="w-full accent-primary" />
              </div>
            </div>

            <button
              onClick={handleDownload}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-4 text-base font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Download className="h-5 w-5" /> Save Extracted MP3 Audio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from "react";
import { Music, Download } from "lucide-react";
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

  const handleExtract = async () => {
    if (!file) return;
    setResultBlob(null);
    const ext = getExtension(file.name);

    await run(async (ffmpeg, checkCancelled) => {
      await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file));
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

  return (
    <div className="space-y-6">
      {!file ? (
        <VideoDropzone onFile={handleFile} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selected: {file.name}</p>
          <button
            onClick={handleExtract}
            disabled={status === "loading-engine" || status === "processing"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Music className="h-4 w-4" /> Extract Audio (MP3)
          </button>
        </div>
      )}

      <ProcessingOverlay status={status} progress={progress} errorMessage={errorMessage} onCancel={cancel} />

      {audioUrl && (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
          <p className="text-xs uppercase text-muted-foreground">Preview (extracted audio)</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full" />
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Download MP3
          </button>
        </div>
      )}
    </div>
  );
}
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Clipboard, X } from "lucide-react";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

function extractId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    if (m) return m[1];
    return null;
  } catch { return null; }
}

const QUALITIES = [
  { key: "maxresdefault", label: "Max resolution (HD)" },
  { key: "sddefault", label: "Standard (640×480)" },
  { key: "hqdefault", label: "High (480×360)" },
  { key: "mqdefault", label: "Medium (320×180)" },
];

export default function YouTubeThumb() {
  const { showSupportPrompt } = useSupportPrompt();
  const [url, setUrl] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const id = useMemo(() => extractId(url), [url]);

  const download = async (q: string) => {
    if (!id) return;
    setDownloading(q);
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${q}.jpg`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `youtube-${id}-${q}.jpg`;
      a.click();
      toast.success("Downloaded");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch {
      toast.error("Couldn't fetch thumbnail");
    } finally {
      setDownloading(null);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {
      toast.error("Couldn't read clipboard — paste the link manually.");
    }
  };

  return (
    <div className="space-y-6">
      {/* STEP 1 — paste the link */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Paste the YouTube link
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 pr-9 text-sm shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            {url && (
              <button
                type="button"
                onClick={() => setUrl("")}
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
          >
            <Clipboard className="h-4 w-4" /> Paste
          </button>
        </div>
      </div>

      {/* STEP 2 — preview & pick a size */}
      {id ? (
        <div className="space-y-5">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
            Pick a size to download
          </p>

          <div className="overflow-hidden rounded-2xl border-2 border-foreground shadow-[5px_5px_0_0_var(--color-foreground)]">
            <img
              src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
              onError={(e) => ((e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}
              alt="thumb"
              className="w-full"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {QUALITIES.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => download(q.key)}
                disabled={downloading === q.key}
                className="group flex items-center gap-3 rounded-xl border-2 border-foreground bg-card p-2.5 text-left shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-wait disabled:opacity-70"
              >
                <img
                  src={`https://i.ytimg.com/vi/${id}/${q.key}.jpg`}
                  alt={q.label}
                  className="h-12 w-20 shrink-0 rounded-lg border-2 border-foreground object-cover"
                />
                <span className="flex-1 text-sm font-semibold">{q.label}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-foreground bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  {downloading === q.key ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Save
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : url && (
        <div className="rounded-xl border-2 border-dashed border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          Please enter a valid YouTube URL.
        </div>
      )}
    </div>
  );
}
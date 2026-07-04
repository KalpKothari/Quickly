import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, ClipboardPaste } from "lucide-react";

async function shortenViaCleanuri(long: string): Promise<string> {
  const res = await fetch("https://cleanuri.com/api/v1/shorten", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "url=" + encodeURIComponent(long),
  });
  const j = (await res.json()) as { result_url?: string; error?: string };
  if (!j.result_url) throw new Error(j.error || "cleanuri failed");
  return j.result_url;
}

async function shortenViaTinyurl(long: string): Promise<string> {
  const res = await fetch(
    "https://tinyurl.com/api-create.php?url=" + encodeURIComponent(long),
  );
  if (!res.ok) throw new Error("tinyurl failed");
  const txt = (await res.text()).trim();
  if (!/^https?:\/\//i.test(txt)) throw new Error("tinyurl invalid response");
  return txt;
}

export default function UrlShortener() {
  const [url, setUrl] = useState("");
  const [short, setShort] = useState("");
  const [loading, setLoading] = useState(false);

  // Same validation, fallback, and shortening logic as before — now parameterized
  // so it can run against either the input state or freshly pasted clipboard text
  // without waiting on a state update.
  const shorten = async (raw?: string) => {
    const trimmed = (raw ?? url).trim();
    let normalized = trimmed;
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      normalized = "https://" + trimmed;
    }
    try {
      new URL(normalized);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }
    setLoading(true);
    setShort("");
    try {
      let result: string;
      try {
        result = await shortenViaCleanuri(normalized);
      } catch {
        result = await shortenViaTinyurl(normalized);
      }
      setShort(result);
      // Copy automatically in addition to the manual copy button, so the common
      // case (shorten, then go paste it somewhere) needs no extra click.
      try { await navigator.clipboard.writeText(result); } catch { /* clipboard may be unavailable */ }
      toast.success("Short URL created");
    } catch {
      toast.error("Couldn't shorten this URL. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const pasteAndShorten = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toast.error("Clipboard is empty"); return; }
      setUrl(text);
      await shorten(text);
    } catch {
      toast.error("Couldn't read clipboard. Please paste manually.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Link2 className="h-3.5 w-3.5" />
          URL Shortener
        </span>
      </div>

      {/* One-tap path for the most common case: a link already sitting on the clipboard. */}
      <button
        onClick={pasteAndShorten}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-card px-4 py-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 sm:w-auto"
      >
        <ClipboardPaste className="h-4 w-4" />
        Paste from clipboard &amp; shorten
      </button>

      <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-foreground/15" />
        or paste it in manually
        <span className="h-px flex-1 bg-foreground/15" />
      </div>

      <label className="block">
        <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          Paste a long URL
        </span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/very/long/path?with=params"
          onKeyDown={(e) => { if (e.key === "Enter") shorten(); }}
          aria-label="Long URL to shorten"
          className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
        />
      </label>

      <button
        onClick={() => shorten()}
        disabled={loading || !url}
        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <Link2 className="h-4 w-4" /> {loading ? "Shortening..." : "Shorten URL"}
      </button>

      {short && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-4 shadow-[5px_5px_0_0_var(--color-foreground)]">
          <a
            href={short}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate font-mono text-lg font-bold text-primary hover:underline"
          >
            {short}
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(short); toast.success("Copied"); }}
            aria-label="Copy short URL"
            className="rounded-full border-2 border-foreground bg-primary p-2 text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      )}

      <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
        Generate fast, reliable, and shareable short links using trusted URL shortening providers.
      </p>
    </div>
  );
}
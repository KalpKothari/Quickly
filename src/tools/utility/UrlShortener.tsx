import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2 } from "lucide-react";

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
  const shorten = async () => {
    const trimmed = url.trim();
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
      toast.success("Short URL created");
    } catch {
      toast.error("Couldn't shorten this URL. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-6">
      <label className="block"><span className="text-xs uppercase text-muted-foreground">Paste a long URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/very/long/path?with=params"
          onKeyDown={(e) => { if (e.key === "Enter") shorten(); }}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
      </label>
      <button onClick={shorten} disabled={loading || !url}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <Link2 className="h-4 w-4" /> {loading ? "Shortening..." : "Shorten URL"}
      </button>
      {short && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-4">
          <a href={short} target="_blank" rel="noreferrer" className="flex-1 truncate font-mono text-lg text-primary hover:underline">{short}</a>
          <button onClick={() => { navigator.clipboard.writeText(short); toast.success("Copied"); }} className="rounded-lg bg-primary p-2 text-primary-foreground"><Copy className="h-4 w-4" /></button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Powered by the free cleanuri and TinyURL services.</p>
    </div>
  );
}

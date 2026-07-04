import { useMemo, useState } from "react";
import { Clipboard, Copy, Eraser } from "lucide-react";
import { toast } from "sonner";

export default function WordCounter() {
  const [text, setText] = useState("");
  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, "").length;
    const sentences = trimmed ? (trimmed.match(/[.!?]+(\s|$)/g)?.length ?? 1) : 0;
    const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).length : 0;
    const readingTime = Math.max(1, Math.ceil(words / 220));
    return { words, characters, charactersNoSpaces, sentences, paragraphs, readingTime };
  }, [text]);

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText((t) => t + clip);
    } catch {
      toast.error("Couldn't read clipboard — paste manually instead.");
    }
  };

  const copyText = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  };

  const clearText = () => setText("");

  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={pasteFromClipboard}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
        >
          <Clipboard className="h-3.5 w-3.5" /> Paste
        </button>
        <button
          onClick={copyText}
          disabled={!text}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[4px_4px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        <button
          onClick={clearText}
          disabled={!text}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:bg-orange-500/15 enabled:hover:text-foreground enabled:hover:shadow-[4px_4px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type your text here..."
        className="h-72 w-full resize-y rounded-2xl border-2 border-foreground bg-card p-4 text-sm shadow-[4px_4px_0_0_var(--color-foreground)] outline-none focus:shadow-[6px_6px_0_0_var(--color-primary)]"
      />

      {/* featured primary stat */}
      <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
        <div
          className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-primary/20 to-fuchsia-500/20 p-5 shadow-[4px_4px_0_0_var(--color-foreground)]"
          style={{ transform: "rotate(-0.5deg)" }}
        >
          <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Words
          </div>
          <div className="mt-2 font-display text-4xl font-extrabold">{stats.words}</div>
        </div>
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]" style={{ transform: "rotate(1deg)" }}>
          <div className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            Characters
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold">{stats.characters}</div>
        </div>
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]" style={{ transform: "rotate(-1deg)" }}>
          <div className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            Read time
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold">{stats.readingTime} min</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["No spaces", stats.charactersNoSpaces],
          ["Sentences", stats.sentences],
          ["Paragraphs", stats.paragraphs],
        ].map(([label, val], i) => (
          <div
            key={label as string}
            className="rounded-xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
            style={{ transform: `rotate(${i % 2 === 0 ? "-1deg" : "1deg"})` }}
          >
            <div className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              {label}
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold">{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
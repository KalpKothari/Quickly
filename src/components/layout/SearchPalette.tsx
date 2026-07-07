import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { searchTools } from "@/lib/search";
import { popularTools, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();

  const results = useMemo<Tool[]>(() => (q.trim() ? searchTools(q, 10) : popularTools().slice(0, 8)), [q]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter" && results[cursor]) {
        onClose();
        navigate({ to: "/tool/$slug", params: { slug: results[cursor].slug } });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, cursor, results, onClose, navigate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 px-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border-2 border-foreground bg-popover shadow-[8px_8px_0_0_var(--color-foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-foreground px-4">
          <Search className="h-4 w-4 text-primary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 40+ tools..."
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border-2 border-foreground bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No tools matched "{q}". Try "compress", "pdf" or "qr".
            </div>
          )}
          {results.map((t, i) => (
            <button
              key={t.slug}
              onClick={() => {
                onClose();
                navigate({ to: "/tool/$slug", params: { slug: t.slug } });
              }}
              onMouseEnter={() => setCursor(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors",
                cursor === i
                  ? "border-foreground bg-primary/15 shadow-[3px_3px_0_0_var(--color-foreground)]"
                  : "border-transparent hover:border-foreground hover:bg-secondary/60",
              )}
            >
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-foreground"
                style={{
                  backgroundColor: `color-mix(in oklab, var(--color-cat-${t.category === "image" ? "image" : t.category}) 20%, transparent)`,
                  color: `var(--color-cat-${t.category === "image" ? "image" : t.category})`,
                }}
              >
                <t.icon className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="font-semibold text-foreground">{t.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{t.description}</span>
              </span>
              {t.status === "soon" && (
                <span
                  className="rounded-full border-2 border-foreground bg-background px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ transform: "rotate(-4deg)" }}
                >
                  Soon
                </span>
              )}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t-2 border-foreground px-4 py-2 text-[11px] font-medium text-muted-foreground">
          <span>{q.trim() ? `${results.length} results` : "Popular tools"}</span>
          <span>
            <kbd className="rounded border-2 border-foreground bg-background px-1 py-0.5">↑↓</kbd> nav •{" "}
            <kbd className="rounded border-2 border-foreground bg-background px-1 py-0.5">↵</kbd> open
          </span>
        </div>
      </div>
    </div>
  );
}
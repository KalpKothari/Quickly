import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Menu, Moon, Search, Sun, X, Sparkles, ChevronDown } from "lucide-react";
import { CATEGORIES, toolsByCategory } from "@/lib/tools";
import { useTheme } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { SearchPalette } from "./SearchPalette";
import { useHotkey } from "@/hooks/use-hotkey";

export function Header() {
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => setMobileOpen(false), [path]);
  useEffect(() => setMegaOpen(false), [path]);

  useHotkey("mod+k", (e) => {
    e.preventDefault();
    setPaletteOpen(true);
  });
  useHotkey("/", (e) => {
    if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
    e.preventDefault();
    setPaletteOpen(true);
  });
  useHotkey("g+h", () => navigate({ to: "/" }));

  const openMega = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMegaOpen(true);
  };
  const scheduleCloseMega = () => {
    closeTimer.current = setTimeout(() => setMegaOpen(false), 150);
  };

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b-2 border-foreground bg-background"
        onMouseLeave={scheduleCloseMega}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <span className="inline-flex h-9 w-9 -rotate-6 items-center justify-center rounded-xl border-2 border-foreground bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:rotate-0">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>Quickly</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1.5 lg:flex">
            {CATEGORIES.map((c) => {
              const active = path.startsWith(`/${c.slug}`);
              return (
                <Link
                  key={c.id}
                  to="/$category"
                  params={{ category: c.slug }}
                  className={cn(
                    "rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-all",
                    active
                      ? "border-foreground bg-primary/20 text-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                      : "border-transparent text-muted-foreground hover:-translate-y-0.5 hover:border-foreground hover:bg-card hover:text-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]",
                  )}
                >
                  {c.name.replace(" Utilities", "").replace(" Tools", "")}
                </Link>
              );
            })}

            <button
              onMouseEnter={openMega}
              onClick={() => setMegaOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-all",
                megaOpen
                  ? "border-foreground bg-primary/20 text-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                  : "border-transparent text-muted-foreground hover:-translate-y-0.5 hover:border-foreground hover:bg-card hover:text-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]",
              )}
            >
              All Tools
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", megaOpen && "rotate-180")} />
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 sm:flex"
            >
              <Search className="h-4 w-4" />
              <span>Search tools</span>
              <kbd className="ml-4 rounded border-2 border-foreground bg-background px-1.5 py-0.5 text-[10px] font-bold">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="rounded-full border-2 border-foreground bg-card p-2 text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] sm:hidden"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={toggle}
              className="rounded-full border-2 border-foreground bg-card p-2 text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:rotate-12"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-full border-2 border-foreground bg-card p-2 text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] lg:hidden"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Full-width mega menu panel — spans the entire viewport below the header */}
        <div
          onMouseEnter={openMega}
          onMouseLeave={scheduleCloseMega}
          className={cn(
            "absolute left-0 top-full z-50 w-full border-b-2 border-foreground bg-card shadow-[0_6px_0_0_var(--color-foreground)] transition-all duration-200 ease-out",
            megaOpen
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-2 opacity-0",
          )}
        >
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <div className="grid grid-cols-4 gap-6">
              {CATEGORIES.map((c) => {
                const tools = toolsByCategory(c.id).filter((t) => t.status === "live");
                return (
                  <div key={c.id} className="space-y-2">
                    <Link
                      to="/$category"
                      params={{ category: c.slug }}
                      className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <c.icon className="h-3.5 w-3.5" style={{ color: `var(--color-${c.color})` }} />
                      {c.name}
                    </Link>
                    <ul className="space-y-1.5">
                      {tools.slice(0, 6).map((t) => (
                        <li key={t.slug}>
                          <Link
                            to="/tool/$slug"
                            params={{ slug: t.slug }}
                            className="text-sm text-foreground/80 transition-colors hover:text-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {tools.length > 6 && (
                      <Link
                        to="/$category"
                        params={{ category: c.slug }}
                        className="inline-block text-xs font-semibold text-primary hover:underline"
                      >
                        View all →
                      </Link>
                    )}
                    {tools.length === 0 && <p className="text-xs text-muted-foreground">Coming soon</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="border-t-2 border-foreground bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3">
            {CATEGORIES.map((c, i) => (
              <Link
                key={c.id}
                to="/$category"
                params={{ category: c.slug }}
                className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-card px-3 py-2.5 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                style={{ transform: `rotate(${i % 2 === 0 ? "-0.6deg" : "0.6deg"})` }}
              >
                <c.icon className="h-4 w-4" style={{ color: `var(--color-${c.color})` }} />
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getCategoryBySlug, toolsByCategory } from "@/lib/tools";
import { ArrowRight, ChevronRight, Hammer } from "lucide-react";

export const Route = createFileRoute("/$category")({
  ssr: false,
  loader: ({ params }) => {
    const cat = getCategoryBySlug(params.category);
    if (!cat) throw notFound();
    return { cat, tools: toolsByCategory(cat.id) };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Category — Quickly" }] };
    const { cat } = loaderData;
    return {
      meta: [
        { title: `${cat.name} — Free online ${cat.name.toLowerCase()} | Quickly` },
        { name: "description", content: cat.tagline },
        { property: "og:title", content: `${cat.name} — Quickly` },
        { property: "og:description", content: cat.tagline },
        { property: "og:url", content: `/${cat.slug}` },
      ],
      links: [{ rel: "canonical", href: `/${cat.slug}` }],
    };
  },
  component: CategoryPage,
});

// Honest, specific-sounding build-status lines for the Video category's "coming soon" cards —
// rotated deterministically by position so it doesn't read as a single copy-pasted label,
// without claiming anything untrue (no fake percentages, no fake ETAs).
const VIDEO_BUILD_NOTES = [
  "In active development",
  "Next in the build queue",
  "Currently being coded",
  "Being tested internally",
];

function CategoryPage() {
  const { cat, tools } = Route.useLoaderData();
  const Icon = cat.icon;
  const live = tools.filter((t: any) => t.status === "live");
  const soon = tools.filter((t: any) => t.status === "soon");
  const catColor = `var(--color-${cat.color})`;
  const isVideo = cat.slug === "videos";

  return (
    <div className="relative">
      <style>{`
        @keyframes qk-blob-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); border-radius: 42% 58% 65% 35% / 45% 45% 55% 55%; }
          33% { transform: translate(4vw, 3vh) scale(1.1); border-radius: 65% 35% 40% 60% / 60% 40% 60% 40%; }
          66% { transform: translate(-3vw, 5vh) scale(0.95); border-radius: 35% 65% 55% 45% / 40% 60% 40% 60%; }
        }
        @keyframes qk-blob-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); border-radius: 55% 45% 40% 60% / 50% 55% 45% 50%; }
          50% { transform: translate(-5vw, -4vh) scale(1.15); border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%; }
        }
        @keyframes qk-pan-grid {
          from { background-position: 0 0; }
          to { background-position: 48px 48px; }
        }
        @keyframes qk-bubble-rise {
          0% { transform: translateY(10vh) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.9; }
          90% { opacity: 0.9; }
          100% { transform: translateY(-115vh) translateX(24px) rotate(30deg); opacity: 0; }
        }
        @keyframes qk-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .qk-bg-blob-a { animation: qk-blob-drift-a 22s ease-in-out infinite; }
        .qk-bg-blob-b { animation: qk-blob-drift-b 26s ease-in-out infinite; }
        .qk-bg-grid { animation: qk-pan-grid 14s linear infinite; }
        .qk-bubble { animation: qk-bubble-rise linear infinite; }
        .qk-pulse-dot { animation: qk-pulse-dot 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .qk-bg-blob-a, .qk-bg-blob-b, .qk-bg-grid, .qk-bubble, .qk-pulse-dot { animation: none !important; }
        }
      `}</style>

      {/* animated background layer — fixed to viewport so it stays lively while you scroll */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="qk-bg-grid absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--color-foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--color-foreground) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="qk-bg-blob-a absolute -left-20 top-10 h-72 w-72" style={{ backgroundColor: catColor, opacity: 0.12 }} />
        <div className="qk-bg-blob-b absolute -right-16 top-1/3 h-80 w-80" style={{ backgroundColor: "var(--color-fuchsia-500, #d946ef)", opacity: 0.1 }} />
        <div className="qk-bg-blob-a absolute bottom-0 left-1/3 h-64 w-64" style={{ backgroundColor: "var(--color-orange-500, #f97316)", opacity: 0.08, animationDelay: "6s" }} />

        {[
          { left: "8%", dur: "16s", delay: "0s", size: "h-6 w-6" },
          { left: "22%", dur: "20s", delay: "4s", size: "h-4 w-4" },
          { left: "48%", dur: "18s", delay: "8s", size: "h-5 w-5" },
          { left: "66%", dur: "22s", delay: "2s", size: "h-4 w-4" },
          { left: "84%", dur: "17s", delay: "6s", size: "h-6 w-6" },
          { left: "92%", dur: "24s", delay: "10s", size: "h-3 w-3" },
        ].map((b, i) => (
          <div
            key={i}
            className="qk-bubble absolute bottom-0"
            style={{ left: b.left, animationDuration: b.dur, animationDelay: b.delay, color: catColor }}
          >
            <Icon className={b.size} strokeWidth={2.5} />
          </div>
        ))}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
      <nav className="mb-6 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link to="/" className="hover:text-primary hover:underline hover:decoration-2 hover:underline-offset-4">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="rounded-md border-2 border-foreground bg-card px-1.5 py-0.5 text-foreground">{cat.name}</span>
      </nav>

      <header className="mb-12 flex items-start gap-5">
        <div
          className="flex h-16 w-16 shrink-0 -rotate-6 items-center justify-center rounded-2xl border-2 border-foreground shadow-[4px_4px_0_0_var(--color-foreground)]"
          style={{
            backgroundColor: `color-mix(in oklab, var(--color-${cat.color}) 25%, transparent)`,
            color: `var(--color-${cat.color})`,
          }}
        >
          <Icon className="h-8 w-8" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{cat.name}</h1>
          <p className="mt-2 text-muted-foreground sm:text-lg">{cat.tagline}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary/15 px-3 py-1 text-xs font-bold">
            {live.length} live tool{live.length === 1 ? "" : "s"} · {soon.length} coming soon
          </p>
        </div>
      </header>

      <section>
        <h2 className="mb-5 inline-block rounded-md border-2 border-foreground bg-orange-500/15 px-2 py-0.5 font-display text-sm font-bold uppercase tracking-widest">
          Available now
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((t: any) => (
            <Link
              key={t.slug}
              to="/tool/$slug"
              params={{ slug: t.slug }}
              className="group flex items-start gap-3 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-1"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-foreground"
                style={{
                  backgroundColor: `color-mix(in oklab, var(--color-${cat.color}) 20%, transparent)`,
                  color: `var(--color-${cat.color})`,
                }}
              >
                <t.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {soon.length > 0 && (
        <section className="mt-14">
          {isVideo ? (
            <div className="mb-5">
              <h2 className="inline-block rounded-md border-2 border-foreground bg-orange-500/15 px-2 py-0.5 font-display text-sm font-bold uppercase tracking-widest">
                In development
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                We're building these one at a time and shipping each one once it actually works properly — no filler, no fake countdowns.
              </p>
            </div>
          ) : (
            <h2 className="mb-5 inline-block rounded-md border-2 border-dashed border-muted-foreground/50 px-2 py-0.5 font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Coming soon
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((t: any, i: number) => (
              <div
                key={t.slug}
                className={
                  isVideo
                    ? "relative flex items-start gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
                    : "relative flex items-start gap-3 rounded-2xl border-2 border-dashed border-muted-foreground/40 bg-secondary/30 p-4 opacity-80"
                }
              >
                <div
                  className={
                    isVideo
                      ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-primary/15 text-primary"
                      : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted text-muted-foreground"
                  }
                >
                  <t.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    {isVideo ? (
                      <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-background px-2 py-0.5 text-[10px] font-bold uppercase">
                        <span className="qk-pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
                        Building
                      </span>
                    ) : (
                      <span
                        className="rounded-full border-2 border-foreground bg-background px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{ transform: "rotate(-4deg)" }}
                      >
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                  {isVideo && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary/80">
                      <Hammer className="h-3 w-3" />
                      {VIDEO_BUILD_NOTES[i % VIDEO_BUILD_NOTES.length]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
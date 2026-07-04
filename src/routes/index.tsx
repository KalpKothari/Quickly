import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Search,
  ArrowRight,
  Zap,
  Shield,
  Sparkles,
  Clock,
  Check,
  ChevronDown,
  Flame,
  Quote,
  Star,
  Heart,
  IndianRupee,
  QrCode,
  Loader2,
} from "lucide-react";
import { CATEGORIES, TOOLS, featuredTools, popularTools, getToolBySlug, type Tool } from "@/lib/tools";
import { searchTools } from "@/lib/search";
import { useRecent } from "@/lib/stores";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:url", content: "/" },
    ],
  }),
  component: Landing,
});

const TILTS = ["-2deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg", "-2.5deg", "1.5deg"];

// ---- UPI Support configuration ----
const UPI_ID = "kalpkothari14@oksbi";
const UPI_PAYEE_NAME = "Quickly Support";
const MIN_UPI_AMOUNT = 10;
const PRESET_AMOUNTS = [49, 99, 199];

function buildUpiLink(amount: number) {
  return `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(
    UPI_PAYEE_NAME,
  )}&am=${encodeURIComponent(amount.toString())}&cu=INR`;
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function Landing() {
  const [q, setQ] = useState("");
  const results = useMemo<Tool[]>(() => (q.trim() ? searchTools(q, 6) : []), [q]);
  const recentTools = useRecent((s) => s.recentTools);
  const recent = recentTools.map(getToolBySlug).filter(Boolean) as Tool[];

  const liveTools = TOOLS.filter((t) => t.status === "live");
  const tickerTools = [...liveTools, ...liveTools];

  // ---- Support the Project (UPI) state ----
  const [selectedPreset, setSelectedPreset] = useState<number | null>(49);
  const [customAmount, setCustomAmount] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const effectiveAmount = useMemo(() => {
    if (customAmount.trim() !== "") {
      const n = Number(customAmount);
      return Number.isFinite(n) ? n : NaN;
    }
    return selectedPreset ?? NaN;
  }, [customAmount, selectedPreset]);

  const isValidAmount = Number.isFinite(effectiveAmount) && effectiveAmount >= MIN_UPI_AMOUNT;

  const handlePresetClick = (value: number) => {
    setSelectedPreset(value);
    setCustomAmount("");
    setShowQR(false);
    setQrDataUrl(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomAmount(e.target.value);
    setSelectedPreset(null);
    setShowQR(false);
    setQrDataUrl(null);
  };

  const handlePayViaUpi = () => {
    if (!isValidAmount) return;
    const link = buildUpiLink(effectiveAmount);
    if (isMobileDevice()) {
      window.location.href = link;
    } else {
      setShowQR(true);
    }
  };

  // Regenerate the QR code dynamically whenever the amount changes while it's visible
  useEffect(() => {
    if (!showQR || !isValidAmount) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    setQrLoading(true);
    const link = buildUpiLink(effectiveAmount);
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(link, {
          width: 280,
          margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
          setQrLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showQR, isValidAmount, effectiveAmount]);

  return (
    <div className="overflow-x-clip bg-background">
      <style>{`
        @keyframes qk-float {
          0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
          50% { transform: translateY(-14px) rotate(var(--r, 0deg)); }
        }
        @keyframes qk-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes qk-blob-morph {
          0%, 100% { border-radius: 42% 58% 65% 35% / 45% 45% 55% 55%; }
          33% { border-radius: 65% 35% 40% 60% / 60% 40% 60% 40%; }
          66% { border-radius: 35% 65% 55% 45% / 40% 60% 40% 60%; }
        }
        @keyframes qk-pop {
          from { opacity: 0; transform: scale(0.85) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes qk-wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
        @keyframes qk-underline {
          from { stroke-dashoffset: 300; }
          to { stroke-dashoffset: 0; }
        }
        .qk-float { animation: qk-float 5.5s ease-in-out infinite; }
        .qk-blob { animation: qk-blob-morph 10s ease-in-out infinite; }
        .qk-pop { animation: qk-pop 0.6s cubic-bezier(.22,1.4,.36,1) both; }
        .qk-ticker-track { animation: qk-marquee 30s linear infinite; }
        .qk-ticker-track:hover { animation-play-state: paused; }
        .qk-hard { border: 2.5px solid var(--color-foreground); box-shadow: 6px 6px 0 0 var(--shadow-c, var(--color-primary)); transition: transform .18s ease, box-shadow .18s ease; }
        .qk-hard:hover { transform: translate(-3px,-3px); box-shadow: 9px 9px 0 0 var(--shadow-c, var(--color-primary)); }
        .qk-hard:active { transform: translate(2px,2px); box-shadow: 2px 2px 0 0 var(--shadow-c, var(--color-primary)); }
        .qk-wiggle-hover:hover { animation: qk-wiggle 0.4s ease-in-out; }
        .qk-underline-path { stroke-dasharray: 300; animation: qk-underline 1s ease-out 0.3s both; }
        @media (prefers-reduced-motion: reduce) {
          .qk-float, .qk-blob, .qk-pop, .qk-ticker-track, .qk-wiggle-hover:hover, .qk-underline-path { animation: none !important; }
        }
      `}</style>

      {/* HERO */}
      <section className="relative overflow-hidden px-4 pt-16 pb-10 sm:pt-24">
        {/* decorative blobs, flat & light, not glowing */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="qk-blob absolute -left-16 top-10 h-56 w-56 bg-primary/15" />
          <div className="qk-blob absolute -right-10 top-32 h-48 w-48 bg-orange-500/15" style={{ animationDelay: "2s" }} />
          <div className="qk-blob absolute left-1/2 bottom-0 h-40 w-40 bg-fuchsia-500/10" style={{ animationDelay: "4s" }} />
        </div>

        {/* floating sticker icons */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block">
          {[
            { Icon: Sparkles, top: "12%", left: "8%", r: "-12deg", c: "text-primary", d: "0s" },
            { Icon: Star, top: "20%", left: "88%", r: "10deg", c: "text-orange-500", d: "1.2s" },
            { Icon: Zap, top: "68%", left: "5%", r: "8deg", c: "text-fuchsia-500", d: "0.6s" },
            { Icon: Check, top: "72%", left: "90%", r: "-8deg", c: "text-primary", d: "1.8s" },
          ].map(({ Icon, top, left, r, c, d }, i) => (
            <div
              key={i}
              className={`qk-float absolute rounded-2xl border-2 border-foreground bg-card p-2.5 shadow-[4px_4px_0_0_var(--color-foreground)] ${c}`}
              style={{ top, left, ["--r" as string]: r, animationDelay: d }}
            >
              <Icon className="h-5 w-5" />
            </div>
          ))}
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="qk-pop qk-wiggle-hover mb-6 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {liveTools.length}+ tools ready to use
          </div>

          <h1 className="qk-pop font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl" style={{ animationDelay: "0.1s" }}>
            One toolbox for
            <span className="relative mt-1 inline-block">
              <span className="relative z-10 bg-gradient-to-r from-primary via-fuchsia-500 to-orange-500 bg-clip-text text-transparent">
                everything digital.
              </span>
              <svg
                aria-hidden
                viewBox="0 0 300 20"
                className="absolute -bottom-3 left-0 h-4 w-full text-primary"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 14 Q 75 2, 150 12 T 298 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  className="qk-underline-path"
                />
              </svg>
            </span>
          </h1>

          <p className="qk-pop mx-auto mt-8 max-w-2xl text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "0.2s" }}>
            PDFs, images, students, everyday utilities — all in one fast, private, browser-native app. No signup, no uploads to servers.
          </p>

          <div className="qk-pop mx-auto mt-10 max-w-2xl" style={{ animationDelay: "0.3s" }}>
            <div className="relative rounded-full border-2.5 border-foreground bg-card shadow-[6px_6px_0_0_var(--color-foreground)]" style={{ borderWidth: "2.5px" }}>
              <div className="flex items-center px-5">
                <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search: compress, pdf, qr, emi..."
                  className="h-14 w-full bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            {results.length > 0 && (
              <ul className="qk-pop mt-3 space-y-1 rounded-2xl border-2 border-foreground bg-card p-2 text-left shadow-[6px_6px_0_0_var(--color-foreground)]">
                {results.map((t) => (
                  <li key={t.slug}>
                    <Link to="/tool/$slug" params={{ slug: t.slug }} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-primary/10">
                      <t.icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{t.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* TICKER RIBBON */}
      <div className="relative py-3" style={{ transform: "rotate(-1.2deg)", marginBlock: "1.5rem" }}>
        <div className="border-y-2 border-foreground bg-gradient-to-r from-primary via-fuchsia-500 to-orange-500 py-3">
          <div className="flex overflow-hidden">
            <div className="qk-ticker-track flex shrink-0 items-center gap-8 whitespace-nowrap pr-8">
              {tickerTools.map((t, i) => (
                <Link
                  key={`${t.slug}-${i}`}
                  to="/tool/$slug"
                  params={{ slug: t.slug }}
                  className="flex items-center gap-2 text-sm font-bold text-primary-foreground"
                >
                  <t.icon className="h-4 w-4" />
                  {t.name}
                  <Star className="h-3 w-3 opacity-70" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CATEGORIES */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <span className="rounded-md border-2 border-foreground bg-orange-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-widest">Browse</span>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Explore by category</h2>
            <p className="mt-2 text-muted-foreground">Eight collections. Every tool crafted for real work.</p>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c, i) => {
            const count = TOOLS.filter((t) => t.category === c.id && t.status === "live").length;
            return (
              <Link
                key={c.id}
                to="/$category"
                params={{ category: c.slug }}
                className="qk-hard group relative rounded-3xl bg-card p-6"
                style={{ ["--shadow-c" as string]: `var(--color-${c.color})`, transform: `rotate(${TILTS[i % TILTS.length]})` }}
              >
                <div
                  className="qk-blob flex h-14 w-14 items-center justify-center border-2 border-foreground transition-transform duration-300 group-hover:rotate-12"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--color-${c.color}) 30%, transparent)`,
                    color: `var(--color-${c.color})`,
                  }}
                >
                  <c.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">{c.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.tagline}</p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="rounded-full border-2 border-foreground bg-background px-2.5 py-1 font-bold">{count} tools</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* FEATURED */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <span className="rounded-md border-2 border-foreground bg-primary/20 px-2 py-0.5 text-xs font-bold uppercase tracking-widest">Handpicked</span>
        <h2 className="mb-6 mt-3 font-display text-2xl font-bold sm:text-3xl">Featured tools</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredTools().slice(0, 8).map((t, i) => (
            <Link
              key={t.slug}
              to="/tool/$slug"
              params={{ slug: t.slug }}
              className="qk-hard group relative flex items-start gap-3 rounded-2xl bg-card p-5"
              style={{ ["--shadow-c" as string]: i % 2 === 0 ? "var(--color-fuchsia-500, #d946ef)" : "var(--color-orange-500, #f97316)" }}
            >
              <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-foreground bg-primary text-primary-foreground">
                <Star className="h-3.5 w-3.5" />
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-primary/15 text-primary">
                <t.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* POPULAR */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h2 className="mb-6 flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl">
          <Flame className="h-6 w-6 text-orange-500" /> Popular right now
        </h2>
        <div className="flex flex-wrap gap-3">
          {popularTools().map((t) => (
            <Link
              key={t.slug}
              to="/tool/$slug"
              params={{ slug: t.slug }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-card px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-1"
            >
              <t.icon className="h-4 w-4 text-primary" /> {t.name}
            </Link>
          ))}
        </div>
      </section>

      {/* RECENT */}
      {recent.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <h2 className="mb-6 flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl">
            <Clock className="h-5 w-5" /> Recently used
          </h2>
          <div className="flex flex-wrap gap-3">
            {recent.map((t) => (
              <Link
                key={t.slug}
                to="/tool/$slug"
                params={{ slug: t.slug }}
                className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/15"
              >
                <t.icon className="h-4 w-4" /> {t.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* WHY */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <span className="rounded-md border-2 border-foreground bg-fuchsia-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-widest">Why us</span>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Why Quickly?</h2>
          <p className="mt-2 text-muted-foreground">Built for the moments you don't have time to fight with clunky tools.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Zap, title: "Instant", body: "Tools open in under a second. Everything runs on your device.", c: "var(--color-primary)" },
            { icon: Shield, title: "Private by default", body: "Your files never leave your browser for most tools.", c: "#f97316" },
            { icon: Sparkles, title: "Actually useful", body: "Real, working implementations — not fake buttons.", c: "#d946ef" },
            { icon: Check, title: "Free forever", body: "No signup, no watermark, no daily limits on core tools.", c: "var(--color-primary)" },
          ].map((f, i) => (
            <div
              key={f.title}
              className="qk-hard group rounded-3xl bg-card p-6"
              style={{ ["--shadow-c" as string]: f.c, transform: `rotate(${TILTS[i % TILTS.length]})` }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-background transition-transform duration-300 group-hover:scale-110" style={{ color: f.c }}>
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-4">
          {[
            ["48+", "Tools", "var(--color-primary)"],
            ["8", "Categories", "#f97316"],
            ["100%", "In-browser", "#d946ef"],
            ["0", "Signups needed", "var(--color-primary)"],
          ].map(([n, l, c], i) => (
            <div
              key={l}
              className="qk-hard rounded-3xl bg-card py-8 text-center"
              style={{ ["--shadow-c" as string]: c, transform: `rotate(${TILTS[(i + 3) % TILTS.length]})` }}
            >
              <div className="font-display text-4xl font-extrabold sm:text-5xl" style={{ color: c }}>
                {n}
              </div>
              <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">How it works</h2>
        <div className="relative mt-14 grid gap-10 sm:grid-cols-3">
          <svg
            aria-hidden
            viewBox="0 0 400 60"
            className="pointer-events-none absolute left-0 right-0 top-6 hidden w-full text-primary sm:block"
            preserveAspectRatio="none"
          >
            <path d="M20 20 Q 130 60, 200 20 T 380 20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" />
          </svg>
          {[
            ["1", "Pick a tool", "Search or browse categories.", "var(--color-primary)"],
            ["2", "Drop your file", "Or paste your text — no signup ever.", "#f97316"],
            ["3", "Download result", "Everything processes in your browser.", "#d946ef"],
          ].map(([n, t, b, c]) => (
            <div key={n} className="relative z-10 text-center">
              <div
                className="qk-float mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground font-display text-xl font-extrabold text-foreground"
                style={{ backgroundColor: `color-mix(in oklab, ${c} 35%, white)`, ["--r" as string]: "0deg" }}
              >
                {n}
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Loved by makers everywhere</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            ["Ananya, Designer", "I stopped bookmarking 12 different sites. Quickly is my go-to for image work.", "bg-primary/15"],
            ["Rohan, Student", "The CGPA and attendance calculators saved me during finals week.", "bg-orange-500/15"],
            ["Priya, Founder", "Fast, clean, no popups. Merging investor PDFs takes seconds now.", "bg-fuchsia-500/15"],
          ].map(([name, quote, tint], i) => (
            <div
              key={name}
              className={`relative rounded-sm border-2 border-foreground p-6 shadow-[6px_6px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-1 hover:rotate-0 ${tint}`}
              style={{ transform: `rotate(${TILTS[i % TILTS.length]})` }}
            >
              <div className="absolute -top-3 left-1/2 h-6 w-16 -translate-x-1/2 -rotate-3 border-2 border-foreground bg-background/90" />
              <Quote className="h-6 w-6 text-foreground/40" />
              <p className="mt-3 text-sm font-medium">{quote}</p>
              <div className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">— {name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Questions? We have answers.</h2>
        <div className="mt-10 space-y-4">
          {[
            ["Is Quickly really free?", "Yes. Every live tool works free, no signup, no watermark."],
            [
              "Do you upload my files?",
              "No. Your files stay on your device for almost every tool and are processed directly in your browser. Nothing is uploaded or stored on our servers."
            ],
            [
              "Why are some tools marked 'coming soon'?",
              "Video, PDF↔Office and social downloaders need server-side processing that we're building. Everything else works today.",
            ],
            ["Which browsers work?", "Any modern Chromium, Firefox, or Safari released in the last two years."],
          ].map(([q, a]) => (
            <details key={q} className="group rounded-2xl border-2 border-foreground bg-card p-5 open:shadow-[5px_5px_0_0_var(--color-primary)]">
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                {q}
                <ChevronDown className="h-5 w-5 shrink-0 rounded-full border-2 border-foreground p-0.5 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* SUPPORT THE PROJECT (UPI) */}
      <section id="support" className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div
          className="qk-hard relative overflow-hidden rounded-3xl bg-card p-6 sm:p-8"
          style={{ ["--shadow-c" as string]: "#d946ef" }}
        >
          {/* decorative accents to match the rest of the site */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="qk-blob absolute -right-14 -top-14 h-40 w-40 bg-fuchsia-500/10" />
            <div className="qk-blob absolute -bottom-16 -left-10 h-36 w-36 bg-primary/10" style={{ animationDelay: "3s" }} />
          </div>

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
            {/* left: message */}
            <div className="text-center lg:pt-1 lg:text-left">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-fuchsia-500/15 text-fuchsia-500 lg:mx-0">
                <Heart className="h-5 w-5" />
              </div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Support the Project</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground sm:text-base lg:mx-0">
                If you found this tool helpful or interesting, consider supporting its development.
                Your contribution helps improve the experience and keep it accessible for everyone.
              </p>
            </div>

            {/* right: interactive controls */}
            <div className="mx-auto flex w-full max-w-sm flex-col items-stretch gap-3 lg:mx-0">
              <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handlePresetClick(amt)}
                    className={`inline-flex items-center gap-1 rounded-full border-2 border-foreground px-4 py-2 text-sm font-bold transition-all ${
                      selectedPreset === amt && customAmount.trim() === ""
                        ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                        : "bg-background hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
                    }`}
                  >
                    <IndianRupee className="h-3.5 w-3.5" />
                    {amt}
                  </button>
                ))}
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <div className="flex h-11 flex-1 items-center gap-2 rounded-full border-2 border-foreground bg-background px-4">
                  <IndianRupee className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_UPI_AMOUNT}
                    placeholder={`Custom (min ₹${MIN_UPI_AMOUNT})`}
                    value={customAmount}
                    onChange={handleCustomChange}
                    className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePayViaUpi}
                  disabled={!isValidAmount}
                  className="qk-hard inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                  style={{ ["--shadow-c" as string]: "var(--color-foreground)" }}
                >
                  <QrCode className="h-4 w-4" />
                  Pay
                </button>
              </div>

              {customAmount.trim() !== "" && !isValidAmount && (
                <p className="text-center text-xs font-medium text-red-500 lg:text-left">
                  Minimum amount is ₹{MIN_UPI_AMOUNT}.
                </p>
              )}

              {/* QR code (desktop only, revealed on click) — hugs its own content, no stretch */}
              {showQR && isValidAmount && (
                <div className="qk-pop mx-auto inline-flex items-center gap-4 self-center rounded-2xl border-2 border-foreground bg-white p-3 lg:mx-0 lg:self-start">
                  <div className="flex h-[140px] w-[140px] shrink-0 items-center justify-center bg-white">
                    {qrLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    {!qrLoading && qrDataUrl && (
                      <img
                        src={qrDataUrl}
                        alt="Scan to pay via UPI"
                        width={140}
                        height={140}
                        className="block h-[140px] w-[140px] object-contain"
                      />
                    )}
                  </div>
                  <p className="pr-2 text-xs font-medium leading-relaxed text-foreground/70">
                    Scan with any UPI app
                    <br />
                    to pay ₹{effectiveAmount}
                  </p>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground lg:text-left">
                This is a voluntary contribution. Payments are made directly via UPI and are not automatically verified.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
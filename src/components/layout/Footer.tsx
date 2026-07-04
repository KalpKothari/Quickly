import { Link } from "@tanstack/react-router";
import { Sparkles, Github, Twitter } from "lucide-react";
import { CATEGORIES } from "@/lib/tools";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t-2 border-foreground bg-primary/5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)",
          backgroundSize: "22px 22px",
          color: "var(--color-foreground)",
          opacity: 0.06,
        }}
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
        <div>
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span
              className="inline-flex h-9 w-9 -rotate-6 items-center justify-center rounded-xl border-2 border-foreground bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <Sparkles className="h-4 w-4" />
            </span>
            Quickly
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            All-in-one productivity toolbox. 60+ free tools that work right in your browser — no signup, no uploads to servers.
          </p>
          <div className="mt-4 flex gap-2">
            <a
              href="#"
              aria-label="GitHub"
              className="rounded-full border-2 border-foreground bg-card p-2 text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:rotate-6"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Twitter"
              className="rounded-full border-2 border-foreground bg-card p-2 text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:-rotate-6"
            >
              <Twitter className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 md:col-span-2">
          {CATEGORIES.slice(0, 4).map((c, i) => (
            <div key={c.id} style={{ transform: `rotate(${i % 2 === 0 ? "-1deg" : "1deg"})` }}>
              <Link
                to="/$category"
                params={{ category: c.slug }}
                className="inline-block rounded-md border-2 border-transparent text-sm font-bold text-foreground hover:border-foreground hover:bg-card hover:px-1.5 hover:text-primary"
              >
                {c.name}
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">{c.tagline}</p>
            </div>
          ))}
        </div>

        <div>
          <h4 className="inline-block rounded-md border-2 border-foreground bg-orange-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-widest">
            Company
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/" className="hover:text-foreground hover:underline hover:decoration-primary hover:decoration-2 hover:underline-offset-4">
                About
              </Link>
            </li>
            <li>
              <a href="#faq" className="hover:text-foreground hover:underline hover:decoration-primary hover:decoration-2 hover:underline-offset-4">
                FAQ
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground hover:underline hover:decoration-primary hover:decoration-2 hover:underline-offset-4">
                Privacy
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground hover:underline hover:decoration-primary hover:decoration-2 hover:underline-offset-4">
                Terms
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative border-t-2 border-foreground px-6 py-5 text-center text-xs font-medium text-muted-foreground">
        © {new Date().getFullYear()} Quickly. Built for creators, students & professionals. Made with care in India.
      </div>
    </footer>
  );
}
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { getCategory, type Tool } from "@/lib/tools";
import { type ReactNode } from "react";

export function ToolShell({ tool, children }: { tool: Tool; children: ReactNode }) {
  const cat = getCategory(tool.category);
  const Icon = tool.icon;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <nav className="mb-6 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link to="/" className="hover:text-primary hover:underline hover:decoration-2 hover:underline-offset-4">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link
          to="/$category"
          params={{ category: cat.slug }}
          className="hover:text-primary hover:underline hover:decoration-2 hover:underline-offset-4"
        >
          {cat.name}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="rounded-md border-2 border-foreground bg-card px-1.5 py-0.5 text-foreground">{tool.name}</span>
      </nav>

      <header className="mb-8 flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 -rotate-6 items-center justify-center rounded-2xl border-2 border-foreground shadow-[4px_4px_0_0_var(--color-foreground)]"
          style={{
            backgroundColor: `color-mix(in oklab, var(--color-${cat.color}) 25%, transparent)`,
            color: `var(--color-${cat.color})`,
          }}
        >
          <Icon className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{tool.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{tool.description}</p>
        </div>
      </header>

      <div className="rounded-3xl border-2 border-foreground bg-card p-4 shadow-[6px_6px_0_0_var(--color-foreground)] sm:p-8">
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-secondary">
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary via-fuchsia-500 to-orange-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function ComingSoon({ toolName }: { toolName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="mb-4 inline-flex rounded-full border-2 border-foreground bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary"
        style={{ transform: "rotate(-3deg)" }}
      >
        In development
      </div>
      <h2 className="font-display text-xl font-bold">{toolName} is coming soon</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This tool requires server-side processing that we're actively working on. In the meantime, explore our 40+ tools that already run instantly in your browser.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-foreground)]"
      >
        Explore live tools
      </Link>
    </div>
  );
}
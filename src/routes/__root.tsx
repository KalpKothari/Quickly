import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { Toaster } from "sonner";
import { useTheme } from "../lib/stores";
import { SupportProjectModal } from "@/components/support/SupportProjectModal";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div
        className="inline-flex items-center justify-center rounded-3xl border-2 border-foreground bg-primary/15 px-8 py-4 font-display text-7xl font-extrabold text-primary shadow-[6px_6px_0_0_var(--color-foreground)] sm:text-8xl"
        style={{ transform: "rotate(-2deg)" }}
      >
        404
      </div>
      <h1 className="mt-8 font-display text-2xl font-bold">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center justify-center rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-foreground)]"
      >
        Go home
      </Link>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div
        className="inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground bg-orange-500/20 text-2xl shadow-[4px_4px_0_0_var(--color-foreground)]"
        style={{ transform: "rotate(6deg)" }}
      >
        ⚠️
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">This page didn't load</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Something went wrong on our end. You can try refreshing or head back home.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center justify-center rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-foreground)]"
        >
          Try again
        </button>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full border-2 border-foreground bg-card px-5 py-2.5 text-sm font-bold text-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-foreground)]"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Quickly — All-in-one productivity toolbox" },
      { name: "description", content: "60+ free tools for PDFs, images, video, audio, students and everyday utilities. Fast, private, in-browser." },
      { name: "author", content: "Quickly" },
      { name: "theme-color", content: "#6366f1" },
      { property: "og:site_name", content: "Quickly" },
      { property: "og:title", content: "Quickly — All-in-one productivity toolbox" },
      { property: "og:description", content: "60+ free tools for PDFs, images, students and everyday utilities. Fast, private, in-browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@quickly" },
    ],
    links: [
      // Add this line right here to force a new favicon!
      { 
        rel: "icon", 
  type: "image/png", 
  href: "/logo.png" 
},
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Quickly",
          description: "All-in-one productivity toolbox — 60+ free browser tools.",
          potentialAction: { "@type": "SearchAction", target: "/?q={search_term_string}", "query-input": "required name=search_term_string" },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
      <Toaster />
      <SupportProjectModal />
    </QueryClientProvider>
  );
}
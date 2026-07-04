import { Suspense, useEffect } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { getToolBySlug, getCategory } from "@/lib/tools";
import { TOOL_COMPONENTS } from "@/tools/registry";
import { ToolShell, ComingSoon } from "@/components/tool/ToolShell";
import { useRecent } from "@/lib/stores";

export const Route = createFileRoute("/tool/$slug")({
  ssr: false,
  loader: ({ params }) => {
    const tool = getToolBySlug(params.slug);
    if (!tool) throw notFound();
    return { tool };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Tool not found — Quickly" }, { name: "robots", content: "noindex" }] };
    const t = loaderData.tool;
    const title = `${t.name} — Free online tool | Quickly`;
    return {
      meta: [
        { title },
        { name: "description", content: t.description },
        { property: "og:title", content: title },
        { property: "og:description", content: t.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/tool/${t.slug}` },
      ],
      links: [{ rel: "canonical", href: `/tool/${t.slug}` }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: t.name,
          description: t.description,
          applicationCategory: getCategory(t.category).name,
          operatingSystem: "Any",
          offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
        }),
      }],
    };
  },
  component: ToolPage,
  notFoundComponent: NotFoundTool,
});

function NotFoundTool() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-foreground bg-orange-500/15 text-3xl shadow-[4px_4px_0_0_var(--color-foreground)]"
        style={{ transform: "rotate(-6deg)" }}
      >
        🔍
      </div>
      <h1 className="mt-6 font-display text-3xl font-bold">Tool not found</h1>
      <p className="mt-2 text-muted-foreground">
        Try the search (press{" "}
        <kbd className="rounded border-2 border-foreground bg-card px-1.5 py-0.5 text-xs font-bold">⌘K</kbd>) to find what you need.
      </p>
    </div>
  );
}

function ToolPage() {
  const { tool } = Route.useLoaderData();
  const markUsed = useRecent((s) => s.markUsed);
  useEffect(() => { markUsed(tool.slug); }, [tool.slug, markUsed]);
  const Comp = TOOL_COMPONENTS[tool.slug];
  return (
    <ToolShell tool={tool}>
      {tool.status === "soon" || !Comp ? (
        <ComingSoon toolName={tool.name} />
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            </div>
          }
        >
          <Comp />
        </Suspense>
      )}
    </ToolShell>
  );
}
export const GA_MEASUREMENT_ID = "G-GV8VNTBJXS";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// Fires a pageview for the given path. Called once on load and again on every
// client-side route change, since GA's default snippet only auto-tracks full
// page loads and TanStack Router navigations don't reload the page.
export function trackPageView(path: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
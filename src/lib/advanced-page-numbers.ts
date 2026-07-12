export type NumStyle = "decimal" | "roman-lower" | "roman-upper" | "alpha-lower" | "alpha-upper";

export interface Section {
  id: string;
  label: string;
  startPdfPage: number;   // 1-based, inclusive
  endPdfPage: number;     // 1-based, inclusive — NEW: sections now have an explicit end
  startNumber: number;    // what number/letter the first counted page in this section gets
  style: NumStyle;
  skipPdfPages: number[]; // 1-based page numbers within this section to skip entirely
  position: "br" | "bc" | "bl" | "tr" | "tc" | "tl";
  size: number;
  margin: number;
  color: string;
}

export function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: crypto.randomUUID(),
    label: "Section",
    startPdfPage: 1,
    endPdfPage: 1,
    startNumber: 1,
    style: "decimal",
    skipPdfPages: [],
    position: "br",
    size: 12,
    margin: 24,
    color: "#26262e",
    ...overrides,
  };
}

// ─── Number formatters ────────────────────────────────────────────────────────

function toRoman(n: number): string {
  if (n < 1) return "";
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
}

// Alphabetical: 1→a, 26→z, 27→aa, 28→ab…
function toAlpha(n: number): string {
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

export function formatPageNumber(n: number, style: NumStyle): string {
  if (n < 1) return "";
  switch (style) {
    case "decimal":     return String(n);
    case "roman-lower": return toRoman(n).toLowerCase();
    case "roman-upper": return toRoman(n);
    case "alpha-lower": return toAlpha(n);
    case "alpha-upper": return toAlpha(n).toUpperCase();
  }
}

// ─── Continuity helper ────────────────────────────────────────────────────────
//
// Given a completed section, returns the suggested start values for the NEXT section:
//   - startPdfPage  = previous endPdfPage + 1
//   - startNumber   = previous startNumber + number of pages that were actually stamped
//                     (i.e. total physical pages in range minus skipped ones)
//
// The caller is free to override any of these suggested values.

export function computeNextSectionDefaults(
  prev: Section,
  totalDocPages: number,
): { startPdfPage: number; startNumber: number; style: NumStyle } {
  const rangePages = prev.endPdfPage - prev.startPdfPage + 1;
  // Count how many pages in the range were actually skipped (only those within [start,end]).
  const skipsInRange = prev.skipPdfPages.filter(
    (p) => p >= prev.startPdfPage && p <= prev.endPdfPage
  ).length;
  const stampedCount = Math.max(0, rangePages - skipsInRange);

  return {
    startPdfPage: Math.min(prev.endPdfPage + 1, totalDocPages),
    startNumber: prev.startNumber + stampedCount,
    style: prev.style, // inherit style so switching styles is opt-in, not forced
  };
}

// ─── Summary helpers ─────────────────────────────────────────────────────────

// Returns the first and last label that will actually appear in a section
// (accounting for skips so the summary is accurate).
export function sectionLabelRange(sec: Section): { first: string; last: string } {
  const skipSet = new Set(sec.skipPdfPages.map(Number));
  let counter = sec.startNumber;
  let first: string | null = null;
  let last: string | null = null;

  for (let p = sec.startPdfPage; p <= sec.endPdfPage; p++) {
    if (skipSet.has(p)) continue;
    const label = formatPageNumber(counter, sec.style);
    if (first === null) first = label;
    last = label;
    counter++;
  }

  return {
    first: first ?? "—",
    last: last ?? "—",
  };
}

// ─── Core engine ──────────────────────────────────────────────────────────────
//
// Returns an array of length `totalPages` where index i (0-based) holds either
// the label to stamp on PDF page i+1, or null (outside every section / skipped).
//
// Rules:
//  - Pages before startPdfPage or after endPdfPage: outside section, null.
//  - Pages in skipPdfPages: no label, counter does NOT advance.
//  - Pages inside [startPdfPage, endPdfPage] and not skipped: stamped, counter advances.
//  - Multiple sections: later sections in the array WIN for overlapping pages.

export function buildPageMap(sections: Section[], totalPages: number): (string | null)[] {
  const map: (string | null)[] = new Array(totalPages).fill(null);

  for (const sec of sections) {
    const end = Math.min(sec.endPdfPage, totalPages);
    // Normalise skip set to plain integers — guards against string values that can appear
    // if section state is ever serialised/deserialised (JSON turns numbers into strings
    // in some edge cases), which would cause a strict === miss inside .includes().
    const skipSet = new Set(sec.skipPdfPages.map(Number));
    let counter = sec.startNumber;

    for (let pdfPage = sec.startPdfPage; pdfPage <= end; pdfPage++) {
      const idx = pdfPage - 1;

      if (skipSet.has(pdfPage)) {
        map[idx] = null; // skipped — no stamp, no counter increment
        continue;
      }

      map[idx] = formatPageNumber(counter, sec.style);
      counter++;
    }
  }

  return map;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const AUTH_KEY = "qk_adv_pn_auth";
const AUTH_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export function isAuthenticated(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts < AUTH_TTL_MS;
  } catch {
    return false;
  }
}

export function authenticate(username: string, password: string): boolean {
  if (username === "kalpkothari" && password === "qwertyuiop") {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ts: Date.now() }));
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}
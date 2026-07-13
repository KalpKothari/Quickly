import { diffWords, type Change } from "diff";

export interface DiffChunk {
  id: string;
  type: "equal" | "added" | "removed" | "modified";
  textA: string;
  textB: string;
  isNumeric: boolean;
  isDate: boolean;
  isContradiction: boolean;
}

export interface ComparisonResult {
  chunks: DiffChunk[];
  stats: {
    wordsA: number;
    wordsB: number;
    additions: number;
    deletions: number;
    modifications: number;
    similarity: number;
  };
  language: { a: string; b: string };
  numericChanges: { original: string; updated: string }[];
  dateChanges: { original: string; updated: string }[];
  contradictions: { original: string; updated: string }[];
}

const DATE_RE = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4})\b/gi;
const NUM_RE = /\b(\$[\d,]+(?:\.\d+)?|£[\d,]+(?:\.\d+)?|€[\d,]+(?:\.\d+)?|\d+(?:[,\.]\d+)*%?)\b/gi;
const NEGATION_RE = /\b(not|never|no|cannot|can't|won't|doesn't|don't|isn't|aren't|wasn't|weren't)\b/i;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Checks if the text belongs to an unsupported language.
 * Returns the detected language string if it matches a non-English pattern.
 */
function checkUnsupportedLanguage(text: string): string | null {
  const t = text.toLowerCase();
  
  // Hindi Unicode range detection
  const hiScore = (t.match(/[\u0900-\u097F]/g) || []).length;
  if (hiScore > 5) return "Hindi";
  
  // Romance language high-frequency keyword check
  const frWords = /\b(le|la|les|de|du|des|est|sont|avec|pour|dans|sur|que|qui|une|un|et|ou)\b/g;
  const esWords = /\b(el|la|los|las|de|del|es|son|con|para|en|que|quien|una|un|y|o|por)\b/g;
  const fr = (t.match(frWords) || []).length;
  const es = (t.match(esWords) || []).length;
  
  if (fr > es && fr > 3) return "French";
  if (es > fr && es > 3) return "Spanish";
  
  return null;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMatches(text: string, re: RegExp): string[] {
  return [...text.matchAll(new RegExp(re.source, "gi"))].map((m) => m[0]);
}

export function compare(rawA: string, rawB: string): ComparisonResult {
  const a = normalizeText(rawA);
  const b = normalizeText(rawB);

  // Guard Clause: Validate against non-English documents before processing
  const langA = checkUnsupportedLanguage(a);
  const langB = checkUnsupportedLanguage(b);
  
  if (langA || langB) {
    const detectedLang = langA || langB;
    throw new Error(`Unsupported Language: Only English is supported. Detected: ${detectedLang}`);
  }

  // Word-level diff
  const changes: Change[] = diffWords(a, b, { ignoreWhitespace: true });

  // Pair removed+added adjacent chunks as "modified"
  const chunks: DiffChunk[] = [];
  let i = 0;
  while (i < changes.length) {
    const curr = changes[i];
    const next = changes[i + 1];

    if (curr.removed && next?.added) {
      const textA = curr.value;
      const textB = next.value;
      const isNumeric = NUM_RE.test(textA) || NUM_RE.test(textB);
      const isDate = DATE_RE.test(textA) || DATE_RE.test(textB);
      const hasNegA = NEGATION_RE.test(textA);
      const hasNegB = NEGATION_RE.test(textB);
      const isContradiction = hasNegA !== hasNegB;
      chunks.push({ id: crypto.randomUUID(), type: "modified", textA, textB, isNumeric, isDate, isContradiction });
      i += 2;
      continue;
    }

    if (curr.added) {
      chunks.push({ id: crypto.randomUUID(), type: "added", textA: "", textB: curr.value, isNumeric: false, isDate: false, isContradiction: false });
    } else if (curr.removed) {
      chunks.push({ id: crypto.randomUUID(), type: "removed", textA: curr.value, textB: "", isNumeric: false, isDate: false, isContradiction: false });
    } else {
      chunks.push({ id: crypto.randomUUID(), type: "equal", textA: curr.value, textB: curr.value, isNumeric: false, isDate: false, isContradiction: false });
    }
    i++;
  }

  const additions = chunks.filter((c) => c.type === "added").length;
  const deletions = chunks.filter((c) => c.type === "removed").length;
  const modifications = chunks.filter((c) => c.type === "modified").length;
  const equalWords = chunks.filter((c) => c.type === "equal").reduce((sum, c) => sum + countWords(c.textA), 0);
  const wordsA = countWords(a);
  const wordsB = countWords(b);
  
  const rawSimilarity = wordsA + wordsB === 0 ? 100 : Math.round((equalWords * 2) / (wordsA + wordsB) * 100);
  const similarity = Math.max(0, Math.min(100, rawSimilarity));

  const numericChanges: { original: string; updated: string }[] = [];
  const dateChanges: { original: string; updated: string }[] = [];
  const contradictions: { original: string; updated: string }[] = [];

  for (const c of chunks.filter((x) => x.type === "modified")) {
    const numsA = extractMatches(c.textA, NUM_RE);
    const numsB = extractMatches(c.textB, NUM_RE);
    if (numsA.length || numsB.length) numericChanges.push({ original: c.textA.trim(), updated: c.textB.trim() });
    const datesA = extractMatches(c.textA, DATE_RE);
    const datesB = extractMatches(c.textB, DATE_RE);
    if (datesA.length || datesB.length) dateChanges.push({ original: c.textA.trim(), updated: c.textB.trim() });
    if (c.isContradiction) contradictions.push({ original: c.textA.trim(), updated: c.textB.trim() });
  }

  return {
    chunks,
    stats: { wordsA, wordsB, additions, deletions, modifications, similarity },
    language: { a: "English", b: "English" },
    numericChanges,
    dateChanges,
    contradictions,
  };
}
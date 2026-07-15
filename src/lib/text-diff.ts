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
 * Evaluates whether text resembles common programming languages
 */
function isProgrammingCode(text: string): boolean {
  // Check for common markdown code wrappers or signature indentation blocks
  if (text.includes("```") || text.includes("function ") || text.includes("import ") || text.includes("export ")) return true;
  
  // High weight structural patterns (braces, brackets, semi-colons, statements)
  const codeSignals = [
    /const\s+\w+\s*=/, /let\s+\w+\s*=/, /def\s+\w+\(.*\):/, /if\s+__name__\s*==/,
    /console\.log\(/, /print\(/, /<\/?[a-z][\s\S]*>/i, /SELECT\s+.*\s+FROM/i,
    /\{[\s\S]*\}/, /\b(public|private|protected)\s+class\b/, /^\s*(interface|type)\s+\w+\s*\{/m
  ];
  
  return codeSignals.some(re => re.test(text));
}

/**
 * Validates language and flags unsupported non-English scripts or Latin-based natural text.
 */
function checkUnsupportedLanguage(text: string): string | null {
  if (!text.trim()) return null;

  // Step 1: Safe bypass if identified as a source code snippet
  if (isProgrammingCode(text)) return null;

  const t = text.toLowerCase();

  // Step 2: Unicode Range Checkers for non-Latin Scripts
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "Tamil";
  if (/[\u4E00-\u9FFF]/.test(text)) return "Chinese";
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(text)) return "Japanese";
  if (/[\u0600-\u06FF]/.test(text)) return "Arabic";
  if (/[\u0400-\u04FF]/.test(text)) return "Russian/Cyrillic";

  // Step 3: High-accuracy stop-word density checks for Latin alphabet languages
  const stopWords: Record<string, RegExp> = {
    Spanish: /\b(el|la|los|las|un|una|unos|unas|del|al|y|o|pero|para|por|con|este|esta|como|su|sus|es|son|se)\b/g,
    French: /\b(le|la|les|un|une|des|du|de|et|ou|mais|pour|par|avec|ce|cette|dans|sur|est|sont|en|au|aux)\b/g,
    German: /\b(der|die|das|ein|eine|und|oder|aber|für|von|mit|dieser|diese|ist|sind|in|zu|den|dem|des)\b/g,
    Italian: /\b(il|la|i|le|un|una|del|al|e|o|ma|per|da|con|questo|questa|come|su|suoi|è|sono|in)\b/g,
    Portuguese: /\b(o|a|os|as|um|uma|do|da|com|para|por|em|este|esta|como|seu|seus|é|são|para|mais)\b/g,
  };

  let maxScore = 0;
  let detectedLanguage: string | null = null;

  for (const [lang, regex] of Object.entries(stopWords)) {
    const matchCount = (t.match(regex) || []).length;
    if (matchCount > maxScore) {
      maxScore = matchCount;
      detectedLanguage = lang;
    }
  }

  // Only reject if localized stop word occurrence is distinct (e.g., more than 2 hits)
  if (detectedLanguage && maxScore >= 3) {
    return detectedLanguage;
  }

  // Cross reference English text signature presence to defend against micro-length lines
  const enWords = /\b(the|and|of|to|a|in|is|that|it|he|was|for|on|are|as|with|his|they|i|at|be|this|have|from|or|by|one|had|by|word)\b/g;
  const enCount = (t.match(enWords) || []).length;

  // If there's content, no code detected, zero English flags, and foreign layout patterns, catch generalized fallback
  if (enCount === 0 && countWords(text) > 4) {
    return "Non-English (Unknown)";
  }

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
    throw new Error(`Unsupported Language: Only English and programming code are supported. Detected language: ${detectedLang}`);
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
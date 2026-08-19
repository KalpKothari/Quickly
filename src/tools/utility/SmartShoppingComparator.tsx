import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, BadgePercent, CalendarClock, Check, ChevronDown, Copy, Edit3, Fuel,
  Gift, HardDrive, Info, ListChecks, Package, PiggyBank, Plus, RotateCcw, Share2,
  ShoppingBasket, SlidersHorizontal, Sparkles, Target, Ticket, Trash2,
  TrendingDown, Trophy, UtensilsCrossed, Wallet, Wifi, X, Zap,
} from "lucide-react";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

/* ------------------------------------------------------------------ */
/* units + categories                                                 */
/* ------------------------------------------------------------------ */

type Dim = "mass" | "volume" | "count" | "data" | "time" | "custom";
type CatKey = "grocery" | "food" | "data" | "subscription" | "fuel" | "product" | "custom";
type ModType = "percent" | "flat";
type FieldKey = "price" | "qty" | "unit" | "validity" | "discount" | "coupon" | "cashback" | "subData";

type UnitDef = { key: string; label: string; name: string; dim: Dim; factor: number };

const MONTH = 365.25 / 12; // 30.4375 days — keeps ₹/year ÷ 12 exact
const MAX_OPTIONS = 10;

/** factor converts an entered quantity into the base unit of its dimension. */
const UNITS: UnitDef[] = [
  { key: "mg", label: "mg", name: "Milligram (mg)", dim: "mass", factor: 1e-6 },
  { key: "g", label: "g", name: "Gram (g)", dim: "mass", factor: 1e-3 },
  { key: "kg", label: "kg", name: "Kilogram (kg)", dim: "mass", factor: 1 },
  { key: "ml", label: "ml", name: "Millilitre (ml)", dim: "volume", factor: 1e-3 },
  { key: "l", label: "L", name: "Litre (L)", dim: "volume", factor: 1 },
  { key: "pc", label: "piece", name: "Piece", dim: "count", factor: 1 },
  { key: "pair", label: "pair", name: "Pair (2 pcs)", dim: "count", factor: 2 },
  { key: "dozen", label: "dozen", name: "Dozen (12 pcs)", dim: "count", factor: 12 },
  { key: "kb", label: "KB", name: "Kilobyte (KB)", dim: "data", factor: 1 / 1048576 },
  { key: "mb", label: "MB", name: "Megabyte (MB)", dim: "data", factor: 1 / 1024 },
  { key: "gb", label: "GB", name: "Gigabyte (GB)", dim: "data", factor: 1 },
  { key: "tb", label: "TB", name: "Terabyte (TB)", dim: "data", factor: 1024 },
  { key: "day", label: "day", name: "Day", dim: "time", factor: 1 },
  { key: "week", label: "week", name: "Week (7 days)", dim: "time", factor: 7 },
  { key: "month", label: "month", name: "Month", dim: "time", factor: MONTH },
  { key: "q", label: "3 months", name: "3 Months (Quarter)", dim: "time", factor: MONTH * 3 },
  { key: "h", label: "6 months", name: "6 Months (Half Year)", dim: "time", factor: MONTH * 6 },
  { key: "year", label: "year", name: "Year", dim: "time", factor: 365.25 },
  { key: "custom", label: "unit", name: "Custom unit", dim: "custom", factor: 1 },
];

const UNIT_MAP: Record<string, UnitDef> = Object.fromEntries(UNITS.map((u) => [u.key, u]));
const PLURAL: Record<string, string> = {
  pc: "pieces", pair: "pairs", dozen: "dozens", day: "days", week: "weeks",
  month: "months", year: "years", gb: "GB", tb: "TB", mb: "MB", kb: "KB",
};

const DIM_LABEL: Record<Dim, string> = {
  mass: "Weight", volume: "Volume", count: "Count", data: "Data", time: "Duration", custom: "Custom",
};

/** Units allowed as the normalised comparison unit, smallest first. */
const DISPLAY_UNITS: Record<Dim, string[]> = {
  mass: ["mg", "g", "kg"], volume: ["ml", "l"], count: ["pc"],
  data: ["kb", "mb", "gb", "tb"], time: ["day", "week", "month", "year"], custom: ["custom"],
};

type CategoryDef = {
  key: CatKey; label: string; icon: LucideIcon; tagline: string;
  qtyLabel: string; qtyNoun: string; qtyDims: Dim[]; qtyDefault: string;
  subjectPlaceholder: string; namePlaceholder: string;
  pricePlaceholder: string; qtyPlaceholder: string;
  needPlaceholder: string;
  validity?: { label: string; default: string; placeholder: string };
  perDay?: { label: string; hint: string };
  allowsBundledData?: boolean;
};

const CATS: Record<CatKey, CategoryDef> = {
  grocery: {
    key: "grocery", label: "Groceries", icon: ShoppingBasket,
    tagline: "Rice, atta, oil, dal — compare packs by weight, volume or pieces.",
    qtyLabel: "Quantity", qtyNoun: "quantity", qtyDims: ["mass", "volume", "count"], qtyDefault: "kg",
    subjectPlaceholder: "e.g. Basmati rice", namePlaceholder: "e.g. 5 kg pack",
    pricePlaceholder: "360", qtyPlaceholder: "5", needPlaceholder: "e.g. 7",
  },
  food: {
    key: "food", label: "Food & Drinks", icon: UtensilsCrossed,
    tagline: "Bottles, cans, combos and family packs — compare by size.",
    qtyLabel: "Size", qtyNoun: "size", qtyDims: ["volume", "mass", "count"], qtyDefault: "ml",
    subjectPlaceholder: "e.g. Cold drink", namePlaceholder: "e.g. 750 ml bottle",
    pricePlaceholder: "70", qtyPlaceholder: "750", needPlaceholder: "e.g. 2",
  },
  data: {
    key: "data", label: "Data Plans", icon: Wifi,
    tagline: "Prepaid packs, add-ons and broadband — cost per GB and per day.",
    qtyLabel: "Data Quota", qtyNoun: "data", qtyDims: ["data"], qtyDefault: "gb",
    subjectPlaceholder: "e.g. Prepaid recharge", namePlaceholder: "e.g. ₹299 pack",
    pricePlaceholder: "299", qtyPlaceholder: "1.5", needPlaceholder: "e.g. 100",
    validity: { label: "Validity", default: "day", placeholder: "28" },
    perDay: { label: "Daily quota", hint: "Most prepaid packs give data per day. Keep this on for daily allowances." },
  },
  subscription: {
    key: "subscription", label: "Subscriptions & OTT", icon: CalendarClock,
    tagline: "OTT & telecom plans — compare duration, price/month AND bundled data per day.",
    qtyLabel: "Duration", qtyNoun: "duration", qtyDims: ["time"], qtyDefault: "month",
    subjectPlaceholder: "e.g. OTT + Telecom Bundle", namePlaceholder: "e.g. 3 Month + 2GB/day Plan",
    pricePlaceholder: "799", qtyPlaceholder: "3", needPlaceholder: "e.g. 12",
    allowsBundledData: true,
  },
  fuel: {
    key: "fuel", label: "Fuel", icon: Fuel,
    tagline: "Petrol, diesel and CNG — litres or kilograms, with cashback.",
    qtyLabel: "Quantity", qtyNoun: "quantity", qtyDims: ["volume", "mass"], qtyDefault: "l",
    subjectPlaceholder: "e.g. Petrol", namePlaceholder: "e.g. Pump A",
    pricePlaceholder: "1048", qtyPlaceholder: "10", needPlaceholder: "e.g. 35",
  },
  product: {
    key: "product", label: "Products", icon: Package,
    tagline: "Single units vs multipacks — pieces, weight or volume.",
    qtyLabel: "Quantity", qtyNoun: "quantity", qtyDims: ["count", "mass", "volume"], qtyDefault: "pc",
    subjectPlaceholder: "e.g. Bath soap", namePlaceholder: "e.g. Pack of 4",
    pricePlaceholder: "160", qtyPlaceholder: "4", needPlaceholder: "e.g. 6",
  },
  custom: {
    key: "custom", label: "Custom", icon: SlidersHorizontal,
    tagline: "Name your own unit — washes, servings, rides, prints, anything.",
    qtyLabel: "Quantity", qtyNoun: "quantity",
    qtyDims: ["custom", "mass", "volume", "count", "data", "time"], qtyDefault: "custom",
    subjectPlaceholder: "e.g. Detergent", namePlaceholder: "e.g. Value pack",
    pricePlaceholder: "399", qtyPlaceholder: "72", needPlaceholder: "e.g. 100",
  },
};

const CAT_ORDER: CatKey[] = ["grocery", "food", "data", "subscription", "fuel", "product", "custom"];

/* ------------------------------------------------------------------ */
/* model                                                              */
/* ------------------------------------------------------------------ */

type Mod = { value: string; type: ModType };

type Opt = {
  id: string; name: string; price: string;
  qty: string; unit: string;
  validity: string; validityUnit: string; perDay: boolean;
  subDataQty: string; subDataUnit: string; subDataPerDay: boolean;
  discount: Mod; coupon: Mod; cashback: Mod;
  extras: boolean;
};

const rid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `o${Math.random().toString(36).slice(2, 10)}`;

const blankOpt = (cat: CategoryDef): Opt => ({
  id: rid(), name: "", price: "", qty: "", unit: cat.qtyDefault,
  validity: "", validityUnit: cat.validity?.default ?? "day", perDay: !!cat.perDay,
  subDataQty: "", subDataUnit: "gb", subDataPerDay: true,
  discount: { value: "", type: "percent" },
  coupon: { value: "", type: "flat" },
  cashback: { value: "", type: "flat" },
  extras: false,
});

type Example = { subject: string; customUnit?: string; need?: [string, string]; rows: Partial<Opt>[] };

const EXAMPLES: Record<CatKey, Example> = {
  grocery: {
    subject: "Basmati rice", need: ["7", "kg"],
    rows: [
      { name: "1 kg pack", price: "80", qty: "1", unit: "kg" },
      { name: "5 kg pack", price: "360", qty: "5", unit: "kg" },
      { name: "10 kg pack", price: "690", qty: "10", unit: "kg" },
    ],
  },
  food: {
    subject: "Cold drink",
    rows: [
      { name: "Can", price: "40", qty: "300", unit: "ml" },
      { name: "Bottle", price: "70", qty: "750", unit: "ml" },
      { name: "Family pack", price: "99", qty: "2", unit: "l" },
    ],
  },
  data: {
    subject: "Broadband / Data Plan", need: ["150", "gb"],
    rows: [
      { name: "100 GB Addon", price: "199", qty: "100", unit: "gb", validity: "30", validityUnit: "day", perDay: false },
      { name: "Daily 2GB Plan (84d)", price: "719", qty: "2", unit: "gb", validity: "84", validityUnit: "day", perDay: true },
      { name: "1 TB Bulk Data Plan", price: "999", qty: "1", unit: "tb", validity: "90", validityUnit: "day", perDay: false },
    ],
  },
  subscription: {
    subject: "OTT + Data Combo", need: ["12", "month"],
    rows: [
      { name: "Monthly Plan + 1.5 GB/day", price: "299", qty: "1", unit: "month", subDataQty: "1.5", subDataUnit: "gb", subDataPerDay: true },
      { name: "Quarterly OTT + 2 GB/day", price: "799", qty: "1", unit: "q", subDataQty: "2", subDataUnit: "gb", subDataPerDay: true },
      { name: "Annual OTT (No daily data)", price: "1499", qty: "1", unit: "year", subDataQty: "", subDataUnit: "gb", subDataPerDay: false },
    ],
  },
  fuel: {
    subject: "Petrol", need: ["30", "l"],
    rows: [
      { name: "Pump A", price: "1048", qty: "10", unit: "l" },
      { name: "Pump B (app cashback)", price: "1060", qty: "10", unit: "l", cashback: { value: "50", type: "flat" }, extras: true },
    ],
  },
  product: {
    subject: "Bath soap", need: ["6", "pc"],
    rows: [
      { name: "Single bar", price: "45", qty: "1", unit: "pc" },
      { name: "Pack of 4", price: "160", qty: "4", unit: "pc" },
      { name: "Pack of 6", price: "225", qty: "6", unit: "pc" },
    ],
  },
  custom: {
    subject: "Detergent", customUnit: "washes", need: ["100", "custom"],
    rows: [
      { name: "Small pack", price: "199", qty: "30", unit: "custom" },
      { name: "Value pack", price: "399", qty: "72", unit: "custom" },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* number + money helpers                                             */
/* ------------------------------------------------------------------ */

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function sanitizeNum(raw: string) {
  const neg = raw.trim().startsWith("-");
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    const [a, b] = [s.slice(0, dot), s.slice(dot + 1).replace(/\./g, "")];
    s = `${a}.${b.slice(0, 4)}`;
  }
  return (neg ? "-" : "") + s.slice(0, 13);
}

function toNum(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function inr(n: number, decimals?: number) {
  if (!Number.isFinite(n)) return "—";
  const d = decimals ?? (Number.isInteger(r2(n)) ? 0 : 2);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

function rateStr(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 1 ? (Number.isInteger(r2(v)) ? 0 : 2) : a >= 0.01 ? 3 : a > 0 ? 5 : 0;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

const num = (n: number, maxD = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: maxD }) : "—";

const uLabel = (u: UnitDef, custom: string) => (u.dim === "custom" ? custom.trim() || "unit" : u.label);

function uWord(u: UnitDef, n: number, custom: string) {
  const l = uLabel(u, custom);
  if (u.dim === "custom") return l;
  return Math.abs(n) === 1 ? l : PLURAL[u.key] ?? l;
}

function qtyText(qtyBase: number, u: UnitDef, custom: string) {
  const v = qtyBase / u.factor;
  return `${num(v, 4)} ${uWord(u, v, custom)}`;
}

/* ------------------------------------------------------------------ */
/* normalisation                                                      */
/* ------------------------------------------------------------------ */

function pickDisplayUnit(dim: Dim, selectedKeys: string[], minPerBase: number): UnitDef {
  const cands = DISPLAY_UNITS[dim].map((k) => UNIT_MAP[k]);
  const finestSelected = Math.min(...selectedKeys.map((k) => UNIT_MAP[k]?.factor ?? 1));
  let start = 0;
  for (let i = 0; i < cands.length; i++) if (cands[i].factor <= finestSelected + 1e-12) start = i;
  for (let i = start; i < cands.length; i++) if (minPerBase * cands[i].factor >= 1) return cands[i];
  return cands[cands.length - 1];
}

/* ------------------------------------------------------------------ */
/* combination solver                                                 */
/* ------------------------------------------------------------------ */

type Pack = { id: string; qtyBase: number; cost: number };
type Combo = { picks: { id: string; count: number }[]; totalCost: number; totalQtyBase: number; exact: boolean };

function gcd(a: number, b: number) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a || 1;
}

function solveCombo(packs: Pack[], needBase: number, cap = 250_000): Combo | null {
  const items = packs.filter((p) => p.qtyBase > 0 && Number.isFinite(p.cost) && p.cost >= 0);
  if (!items.length || !(needBase > 0)) return null;

  const SCALE = 1000;
  let sizes = items.map((i) => Math.max(1, Math.round(i.qtyBase * SCALE)));
  let need = Math.max(1, Math.round(needBase * SCALE));
  const g = sizes.reduce((acc, s) => gcd(acc, s), need);
  sizes = sizes.map((s) => Math.max(1, Math.round(s / g)));
  need = Math.max(1, Math.round(need / g));

  const counts = items.map(() => 0);
  let exact = true;

  if (need > cap) {
    let bi = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i].cost / sizes[i] < items[bi].cost / sizes[bi]) bi = i;
    }
    const tail = Math.min(cap, Math.max(4 * Math.max(...sizes), 1000));
    const bulk = Math.floor((need - tail) / sizes[bi]);
    if (bulk > 0) { counts[bi] += bulk; need -= bulk * sizes[bi]; exact = false; }
  }

  const dp = new Float64Array(need + 1);
  const from = new Int16Array(need + 1).fill(-1);
  for (let q = 1; q <= need; q++) {
    let best = Infinity, bi = -1;
    for (let i = 0; i < sizes.length; i++) {
      const rest = q - sizes[i];
      const c = items[i].cost + (rest > 0 ? dp[rest] : 0);
      if (c < best - 1e-12) { best = c; bi = i; }
    }
    dp[q] = best; from[q] = bi;
  }

  let q = need;
  let guard = 0;
  while (q > 0 && guard++ < 2_000_000) {
    const i = from[q];
    if (i < 0) break;
    counts[i]++;
    q = Math.max(0, q - sizes[i]);
  }

  let totalCost = 0, totalQtyBase = 0;
  counts.forEach((c, i) => { totalCost += c * items[i].cost; totalQtyBase += c * items[i].qtyBase; });

  return {
    picks: counts.map((c, i) => ({ id: items[i].id, count: c })).filter((p) => p.count > 0),
    totalCost: r2(totalCost), totalQtyBase, exact,
  };
}

/* ------------------------------------------------------------------ */
/* per-option calculation                                             */
/* ------------------------------------------------------------------ */

type Row = {
  opt: Opt; idx: number; label: string;
  errors: Partial<Record<FieldKey, string>>;
  notes: string[];
  price: number; discountAmt: number; couponAmt: number; cashbackAmt: number;
  payable: number; effective: number;
  unit: UnitDef | null; dim: Dim | null;
  totalQty: number; qtyBase: number;
  validityDays: number | null; perDayCost: number | null;
  perBase: number;
  bundledDataTotalGb: number | null;
  bundledDataPerDayGb: number | null;
  costPerGb: number | null;
  ready: boolean; comparable: boolean;
  dispUnit: UnitDef | null;
};

function applyMod(
  mod: Mod, base: number, field: FieldKey, noun: string,
  errors: Partial<Record<FieldKey, string>>, notes: string[],
): number {
  const raw = mod.value.trim();
  if (!raw) return 0;
  const v = toNum(raw);
  if (v === null) { errors[field] = `Enter a valid ${noun} amount.`; return 0; }
  if (v < 0) { errors[field] = `${noun} can't be negative.`; return 0; }
  if (mod.type === "percent" && v > 100) { errors[field] = `${noun} can't be more than 100%.`; return 0; }

  let amt = mod.type === "percent" ? (base * v) / 100 : v;
  amt = r2(amt);
  if (amt > base) {
    notes.push(`${noun} of ${inr(amt)} is more than ${inr(base)} — capped at ${inr(base)}.`);
    amt = base;
  }
  return amt;
}

function computeRow(opt: Opt, idx: number, cat: CategoryDef): Row {
  const errors: Partial<Record<FieldKey, string>> = {};
  const notes: string[] = [];

  const priceN = toNum(opt.price);
  if (priceN === null) errors.price = "Enter the price.";
  else if (priceN < 0) errors.price = "Price can't be negative.";
  else if (priceN === 0) errors.price = "Price must be more than ₹0.";
  else if (priceN > 1e9) errors.price = "That price looks too large.";

  const qtyN = toNum(opt.qty);
  if (qtyN === null) errors.qty = `Enter the ${cat.qtyNoun}.`;
  else if (qtyN < 0) errors.qty = `${cat.qtyLabel} can't be negative.`;
  else if (qtyN === 0) errors.qty = `${cat.qtyLabel} must be more than 0.`;
  else if (qtyN > 1e9) errors.qty = "That number looks too large.";

  const unit = UNIT_MAP[opt.unit] ?? null;
  if (!unit) errors.unit = "Pick a unit.";

  let validityDays: number | null = null;
  if (cat.validity) {
    const v = toNum(opt.validity);
    const vu = UNIT_MAP[opt.validityUnit];
    if (v === null) errors.validity = `Enter the ${cat.validity.label.toLowerCase()}.`;
    else if (v <= 0) errors.validity = `${cat.validity.label} must be more than 0.`;
    else if (!vu) errors.validity = "Pick a unit.";
    else validityDays = v * vu.factor;
  }

  const price = priceN && priceN > 0 ? priceN : 0;
  const discountAmt = applyMod(opt.discount, price, "discount", "Discount", errors, notes);
  const afterDiscount = r2(price - discountAmt);
  const couponAmt = applyMod(opt.coupon, afterDiscount, "coupon", "Coupon", errors, notes);
  const payable = r2(afterDiscount - couponAmt);
  const cashbackAmt = applyMod(opt.cashback, payable, "cashback", "Cashback", errors, notes);
  const effective = r2(payable - cashbackAmt);

  const usePerDay = !!cat.perDay && opt.perDay;
  const totalQty = usePerDay && validityDays ? (qtyN ?? 0) * validityDays : qtyN ?? 0;
  const qtyBase = unit ? totalQty * unit.factor : 0;

  if (!cat.validity && unit && unit.dim === "time" && qtyBase > 0) {
    validityDays = qtyBase;
  }

  // Calculate bundled data for Subscriptions
  let bundledDataTotalGb: number | null = null;
  let bundledDataPerDayGb: number | null = null;
  let costPerGb: number | null = null;

  if (cat.allowsBundledData) {
    const subDataN = toNum(opt.subDataQty);
    const subDataU = UNIT_MAP[opt.subDataUnit] ?? UNIT_MAP.gb;
    if (subDataN != null && subDataN > 0) {
      const singleDataGb = subDataN * subDataU.factor;
      if (opt.subDataPerDay && validityDays && validityDays > 0) {
        bundledDataPerDayGb = singleDataGb;
        bundledDataTotalGb = singleDataGb * validityDays;
      } else {
        bundledDataTotalGb = singleDataGb;
        bundledDataPerDayGb = validityDays && validityDays > 0 ? singleDataGb / validityDays : null;
      }
      if (bundledDataTotalGb > 0 && effective > 0) {
        costPerGb = effective / bundledDataTotalGb;
      }
    }
  } else if (cat.key === "data" && unit?.dim === "data" && qtyBase > 0) {
    bundledDataTotalGb = qtyBase;
    bundledDataPerDayGb = validityDays && validityDays > 0 ? qtyBase / validityDays : null;
    costPerGb = effective > 0 ? effective / qtyBase : null;
  }

  const ready =
    !errors.price && !errors.qty && !errors.unit && !errors.validity &&
    !errors.discount && !errors.coupon && !errors.cashback &&
    qtyBase > 0 && !!unit;

  return {
    opt, idx, label: opt.name.trim() || `Option ${idx + 1}`,
    errors, notes,
    price, discountAmt, couponAmt, cashbackAmt, payable, effective,
    unit, dim: unit?.dim ?? null,
    totalQty, qtyBase,
    validityDays,
    perDayCost: validityDays && validityDays > 0 ? effective / validityDays : null,
    perBase: ready ? effective / qtyBase : Number.POSITIVE_INFINITY,
    bundledDataTotalGb,
    bundledDataPerDayGb,
    costPerGb,
    ready, comparable: false, dispUnit: unit,
  };
}

/* ------------------------------------------------------------------ */
/* UI design atoms                                                    */
/* ------------------------------------------------------------------ */

const CARD = "rounded-2xl border-2 border-foreground bg-card shadow-[5px_5px_0_0_var(--color-foreground)]";
const SUBCARD = "rounded-xl border-2 border-foreground bg-background shadow-[2px_2px_0_0_var(--color-foreground)]";
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full min-w-0 min-h-11 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold " +
  "shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]";
const INPUT_BAD = "border-red-500 focus:shadow-[3px_3px_0_0_#ef4444]";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 " +
  "text-sm font-black text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform " +
  "hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50";
const BTN_GHOST =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 " +
  "text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 " +
  "disabled:pointer-events-none disabled:opacity-50";
const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-2.5 py-1 " +
  "text-[10px] font-black uppercase tracking-wide";

function Modal({
  title, icon, maxWidth = "max-w-md", onClose, footer, children,
}: {
  title: string; icon?: React.ReactNode; maxWidth?: string;
  onClose: () => void; footer?: React.ReactNode; children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center bg-black/65 p-2 sm:p-4 backdrop-blur-md">
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`max-h-[92dvh] w-full ${maxWidth} flex flex-col overflow-hidden ${CARD} p-4 sm:p-5`}
      >
        {/* Fixed Header */}
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3 border-b-2 border-foreground/10 pb-3">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-black uppercase tracking-wide truncate">
            {icon}{title}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 rounded-full border-2 border-foreground bg-background p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-2 space-y-3 pb-2">
          {children}
        </div>

        {/* Fixed Footer */}
        {footer && (
          <div className="mt-3 shrink-0 border-t-2 border-foreground/10 pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function StepHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-primary text-[11px] font-black text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function FieldMsg({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={id} role="alert" className="mt-1 flex items-start gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
        <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />{error}
      </p>
    );
  }
  if (hint) return <p id={id} className="mt-1 text-[11px] font-semibold text-muted-foreground">{hint}</p>;
  return null;
}

function Select({
  id, value, onChange, label, invalid, describedBy, children,
}: {
  id: string; value: string; onChange: (v: string) => void; label: string;
  invalid?: boolean; describedBy?: string; children: React.ReactNode;
}) {
  return (
    <div className="relative w-full min-w-0">
      <select
        id={id} value={value} aria-label={label}
        aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} appearance-none pr-8 truncate text-xs sm:text-sm ${invalid ? INPUT_BAD : ""}`}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70" />
    </div>
  );
}

function UnitOptions({ dims, customName }: { dims: Dim[]; customName: string }) {
  return (
    <>
      {dims.map((d) => (
        <optgroup key={d} label={DIM_LABEL[d]}>
          {UNITS.filter((u) => u.dim === d).map((u) => (
            <option key={u.key} value={u.key}>
              {u.dim === "custom" ? `${customName.trim() || "unit"} (custom)` : u.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function ModField({
  id, icon, label, mod, onChange, error, hint,
}: {
  id: string; icon: React.ReactNode; label: string; mod: Mod;
  onChange: (m: Mod) => void; error?: string; hint?: string;
}) {
  const msgId = `${id}-msg`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={`flex items-center gap-1.5 ${LABEL}`}>{icon}{label}</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={id} type="text" inputMode="decimal" autoComplete="off"
          value={mod.value} placeholder="0"
          aria-invalid={!!error || undefined} aria-describedby={error || hint ? msgId : undefined}
          onChange={(e) => onChange({ ...mod, value: sanitizeNum(e.target.value) })}
          className={`${INPUT} ${error ? INPUT_BAD : ""}`}
        />
        <div className="flex shrink-0 overflow-hidden rounded-xl border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)]">
          {(["percent", "flat"] as ModType[]).map((t) => (
            <button
              key={t} type="button" aria-pressed={mod.type === t}
              aria-label={t === "percent" ? `${label} as a percentage` : `${label} in rupees`}
              onClick={() => onChange({ ...mod, type: t })}
              className={`min-h-11 w-11 text-sm font-black transition-colors ${
                mod.type === t ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
              } ${t === "flat" ? "border-l-2 border-foreground" : ""}`}
            >
              {t === "percent" ? "%" : "₹"}
            </button>
          ))}
        </div>
      </div>
      <FieldMsg id={msgId} error={error} hint={hint} />
    </div>
  );
}

function CategoryPicker({ value, onChange }: { value: CatKey; onChange: (k: CatKey) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = CAT_ORDER.length;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(CAT_ORDER[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="What are you comparing" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {CAT_ORDER.map((k, i) => {
        const c = CATS[k];
        const on = k === value;
        const Icon = c.icon;
        return (
          <button
            key={k} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            ref={(el) => { refs.current[i] = el; }}
            onClick={() => onChange(k)} onKeyDown={(e) => onKey(e, i)}
            className={`flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-foreground px-2 py-3 text-center transition-transform hover:-translate-y-0.5 ${
              on
                ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                : "bg-background text-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="text-[11px] font-black uppercase leading-tight">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main tool                                                          */
/* ------------------------------------------------------------------ */

type SortKey = "value" | "total" | "entered";

export default function SmartShoppingComparator() {
  const { showSupportPrompt } = useSupportPrompt();

  const [catKey, setCatKey] = useState<CatKey>("subscription");
  const cat = CATS[catKey];

  const [subject, setSubject] = useState("");
  const [customUnit, setCustomUnit] = useState("unit");
  const [options, setOptions] = useState<Opt[]>(() => [blankOpt(CATS.subscription), blankOpt(CATS.subscription)]);

  const [optionsModalOpen, setOptionsModalOpen] = useState(false);

  const [need, setNeed] = useState("");
  const [needUnit, setNeedUnit] = useState("month");

  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [computing, setComputing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [resetOpen, setResetOpen] = useState(false);

  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const needRef = useRef<HTMLInputElement>(null);

  /* ---------------- calculation ---------------- */

  const analysis = useMemo(() => {
    const rows = options.map((o, i) => computeRow(o, i, cat));
    const readyRows = rows.filter((r) => r.ready);

    let dominantDim: Dim | null = null;
    if (readyRows.length) {
      const tally = new Map<Dim, number>();
      readyRows.forEach((r) => tally.set(r.dim!, (tally.get(r.dim!) ?? 0) + 1));
      dominantDim = readyRows[0].dim!;
      let best = tally.get(dominantDim) ?? 0;
      tally.forEach((count, dim) => { if (count > best) { best = count; dominantDim = dim; } });
    }

    rows.forEach((r) => {
      if (!r.ready || !dominantDim) return;
      if (r.dim === dominantDim) r.comparable = true;
      else {
        r.errors.unit =
          `This is measured in ${DIM_LABEL[r.dim!].toLowerCase()} while the others use ` +
          `${DIM_LABEL[dominantDim].toLowerCase()} — it can't be compared directly.`;
      }
    });

    const comparable = rows.filter((r) => r.comparable);
    let displayUnit: UnitDef | null = null;
    if (comparable.length && dominantDim) {
      displayUnit = pickDisplayUnit(
        dominantDim,
        comparable.map((r) => r.unit!.key),
        Math.min(...comparable.map((r) => r.perBase)),
      );
    }
    rows.forEach((r) => { r.dispUnit = r.comparable ? displayUnit : r.unit; });

    const byValue = [...comparable].sort((a, b) => a.perBase - b.perBase || a.idx - b.idx);
    const byTotal = [...comparable].sort((a, b) => a.effective - b.effective || a.idx - b.idx);
    const bestValue = byValue[0] ?? null;
    const worstValue = byValue[byValue.length - 1] ?? null;
    const cheapest = byTotal[0] ?? null;
    const eq = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
    const valueTies = bestValue ? comparable.filter((r) => eq(r.perBase, bestValue.perBase)) : [];

    const byPerDay = comparable.filter((r) => r.perDayCost != null).sort((a, b) => a.perDayCost! - b.perDayCost!);
    const bestPerDay = byPerDay[0] ?? null;

    const needQty = toNum(need);
    let needErr: string | undefined;
    let needBase = 0;
    const needU = UNIT_MAP[needUnit];

    if (need.trim() !== "") {
      if (needQty === null) needErr = "Enter a valid number.";
      else if (needQty <= 0) needErr = "Tell us an amount above 0.";
      else if (!needU) needErr = "Pick a valid unit.";
      else if (dominantDim && needU.dim !== dominantDim) {
        needErr = `Pick a ${DIM_LABEL[dominantDim].toLowerCase()} unit to match your options.`;
      } else {
        needBase = needQty * needU.factor;
        const smallest = Math.min(...comparable.map((r) => r.qtyBase), Infinity);
        if (comparable.length && needBase / smallest > 500_000) {
          needErr = "That requirement is very large — try a bigger unit or a smaller number.";
          needBase = 0;
        }
      }
    }

    let combo: Combo | null = null;
    let singles: { row: Row; count: number; cost: number; qtyBase: number }[] = [];
    let baseline: { row: Row; count: number; cost: number; qtyBase: number } | null = null;
    let saving = 0;

    if (needBase > 0 && comparable.length >= 2) {
      combo = solveCombo(comparable.map((r) => ({ id: r.opt.id, qtyBase: r.qtyBase, cost: r.effective })), needBase);
      singles = comparable
        .map((r) => {
          const count = Math.max(1, Math.ceil(needBase / r.qtyBase - 1e-9));
          return { row: r, count, cost: r2(count * r.effective), qtyBase: count * r.qtyBase };
        })
        .sort((a, b) => a.cost - b.cost);

      const smallestRow = [...comparable].sort((a, b) => a.qtyBase - b.qtyBase || b.perBase - a.perBase)[0];
      baseline = singles.find((s) => s.row.opt.id === smallestRow.opt.id) ?? null;
      if (combo && baseline) saving = r2(baseline.cost - combo.totalCost);
    }

    const firstProblem = (() => {
      for (const r of rows) {
        const k = (["price", "qty", "unit", "validity", "discount", "coupon", "cashback"] as FieldKey[])
          .find((f) => r.errors[f]);
        if (k) return { row: r, field: k, message: r.errors[k]! };
      }
      return null;
    })();

    return {
      rows, comparable, dominantDim, displayUnit,
      byValue, byTotal, bestValue, worstValue, cheapest, valueTies, bestPerDay,
      needErr, needBase, combo, singles, baseline, saving, firstProblem,
      hasCashback: comparable.some((r) => r.cashbackAmt > 0),
      mismatched: rows.filter((r) => r.ready && !r.comparable),
    };
  }, [options, cat, need, needUnit]);

  const { rows, comparable, dominantDim, displayUnit } = analysis;
  const unitWord = displayUnit ? uLabel(displayUnit, customUnit) : "";

  const activeDims: Dim[] = useMemo(() => {
    if (dominantDim) return [dominantDim];
    return cat.qtyDims;
  }, [dominantDim, cat.qtyDims]);

  useEffect(() => {
    const u = UNIT_MAP[needUnit];
    const targetDim = dominantDim ?? cat.qtyDims[0];
    if (!u || u.dim !== targetDim) {
      setNeedUnit(displayUnit?.key ?? cat.qtyDefault);
    }
  }, [dominantDim, cat.qtyDims, cat.qtyDefault, displayUnit, needUnit]);

  /* ---------------- mutations ---------------- */

  const patch = (id: string, p: Partial<Opt>) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const changeCat = (key: CatKey) => {
    const next = CATS[key];
    setCatKey(key);
    setNeedUnit(next.qtyDefault);
    setNeed("");
    setOptions((prev) =>
      prev.map((o) => {
        const u = UNIT_MAP[o.unit];
        return {
          ...o,
          unit: u && next.qtyDims.includes(u.dim) ? o.unit : next.qtyDefault,
          validityUnit: UNIT_MAP[o.validityUnit]?.dim === "time" ? o.validityUnit : next.validity?.default ?? "day",
          perDay: next.perDay ? o.perDay : false,
        };
      }),
    );
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) {
      toast.error(`You can compare up to ${MAX_OPTIONS} options at a time.`);
      return;
    }
    const last = options[options.length - 1];
    setOptions((prev) => [
      ...prev,
      {
        ...blankOpt(cat),
        unit: last?.unit ?? cat.qtyDefault,
        validityUnit: last?.validityUnit ?? cat.validity?.default ?? "day",
        perDay: last?.perDay ?? !!cat.perDay,
      },
    ]);
  };

  const removeOption = (id: string) => {
    if (options.length <= 2) {
      toast.error("Keep at least two options to compare.");
      return;
    }
    setOptions((prev) => prev.filter((o) => o.id !== id));
  };

  const loadExample = () => {
    const ex = EXAMPLES[catKey];
    setSubject(ex.subject);
    if (ex.customUnit) setCustomUnit(ex.customUnit);
    setOptions(ex.rows.map((r) => ({ ...blankOpt(cat), ...r, id: rid() })));
    if (ex.need) { setNeed(ex.need[0]); setNeedUnit(ex.need[1]); }
    else { setNeed(""); }
    setSubmitted(false);
    setRevealed(false);
    toast.success(`Loaded a sample ${cat.label.toLowerCase()} comparison.`);
  };

  const doReset = () => {
    setOptions([blankOpt(cat), blankOpt(cat)]);
    setSubject("");
    setNeed("");
    setSubmitted(false); setRevealed(false); setSortBy("value");
    setResetOpen(false);
    toast.success("Comparison cleared.");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const compare = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    if (analysis.needErr) {
      toast.error(analysis.needErr);
      needRef.current?.focus();
      return;
    }
    if (comparable.length < 2) {
      setOptionsModalOpen(true);
      toast.error(
        analysis.firstProblem
          ? `${analysis.firstProblem.row.label}: ${analysis.firstProblem.message}`
          : "Fill in a price and duration/quantity for at least two options in the popup.",
      );
      return;
    }

    setRevealed(true);
    setComputing(true);
    window.setTimeout(() => {
      setComputing(false);
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      showSupportPrompt();
    }, 300);
  };

  /* ---------------- copy / share summary ---------------- */

  const summary = useMemo(() => {
    const { bestValue, cheapest, combo, baseline, saving, needBase } = analysis;
    if (!bestValue || !cheapest || !displayUnit) return "";
    const U = unitWord;
    const lines: string[] = [];
    lines.push(`Smart Shopping Comparison · ${cat.label}`);
    if (subject.trim()) lines.push(subject.trim());
    if (needBase > 0) lines.push(`Needed: ${qtyText(needBase, displayUnit, customUnit)}`);
    lines.push("");

    analysis.byValue.forEach((r) => {
      const bits = [
        qtyText(r.qtyBase, displayUnit, customUnit),
        `${inr(r.effective)} total`,
        `${rateStr(r.perBase * displayUnit.factor)}/${U}`,
      ];
      if (r.perDayCost != null) bits.push(`${rateStr(r.perDayCost)}/day`);
      if (r.bundledDataTotalGb != null && r.bundledDataTotalGb > 0) {
        bits.push(`${num(r.bundledDataTotalGb, 2)} GB data included`);
      }
      lines.push(`• ${r.label} — ${bits.join(" · ")}`);
    });

    lines.push("");
    lines.push(`BEST VALUE   ${bestValue.label} — ${rateStr(bestValue.perBase * displayUnit.factor)}/${U}`);
    lines.push(`CHEAPEST     ${cheapest.label} — ${inr(cheapest.effective)} total`);
    if (combo && needBase > 0) {
      lines.push(`BEST FOR ${qtyText(needBase, displayUnit, customUnit).toUpperCase()}   ${comboText(combo, comparable, displayUnit, customUnit)} — ${inr(combo.totalCost)}`);
      if (baseline && saving > 0) {
        lines.push(`SAVINGS      ${inr(saving)} vs ${baseline.count} × ${baseline.row.label} (${inr(baseline.cost)})`);
      }
    }
    lines.push("");
    lines.push("Compared with Quickly · Smart Shopping Comparator");
    return lines.join("\n");
  }, [analysis, cat.label, subject, displayUnit, unitWord, customUnit, comparable]);

  const copySummary = async () => {
    if (!summary) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(summary);
      else {
        const ta = document.createElement("textarea");
        ta.value = summary;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("copy blocked");
      }
      toast.success("Comparison copied to your clipboard.");
      showSupportPrompt();
    } catch {
      toast.error("Could not copy automatically — open the text summary below and copy it manually.");
    }
  };

  const shareSummary = async () => {
    if (!summary) return;
    try {
      await navigator.share({ title: "Smart Shopping Comparison", text: summary });
      showSupportPrompt();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast.error("Sharing isn't available on this device.");
    }
  };

  /* ---------------- error visibility ---------------- */

  const rawOf = (o: Opt, f: FieldKey) =>
    f === "price" ? o.price : f === "qty" ? o.qty : f === "validity" ? o.validity
      : f === "unit" ? o.unit : (o[f] as Mod)?.value ?? "";

  const errOf = (r: Row, f: FieldKey) => {
    const e = r.errors[f];
    if (!e) return undefined;
    if (submitted || f === "unit") return e;
    return rawOf(r.opt, f).trim() !== "" ? e : undefined;
  };

  const statusText =
    comparable.length >= 2
      ? `${comparable.length} of ${options.length} options ready — ${revealed ? "results update live below." : "press Compare."}`
      : "Add a price and duration/quantity to at least two options in the popup to compare.";

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          Smart Shopping Comparator
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={loadExample} className={BTN_GHOST}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Try an example
          </button>
          <button type="button" onClick={() => setResetOpen(true)} className={BTN_GHOST}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
          </button>
        </div>
      </div>

      <form ref={formRef} onSubmit={compare} className="space-y-5" noValidate>
        {/* ---------- step 1 ---------- */}
        <div className={`${CARD} p-4 sm:p-5`}>
          <StepHead n={1} title="What are you comparing?" hint={cat.tagline} />
          <CategoryPicker value={catKey} onChange={changeCat} />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="ssc-subject" className={LABEL}>
                Item / Plan name <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <input
                id="ssc-subject" type="text" value={subject} maxLength={48} autoComplete="off"
                placeholder={cat.subjectPlaceholder}
                onChange={(e) => setSubject(e.target.value)}
                className={`${INPUT} mt-1.5`}
              />
              <FieldMsg id="ssc-subject-msg" hint="Used in headings and the copied summary." />
            </div>

            {catKey === "custom" && (
              <div className="min-w-0">
                <label htmlFor="ssc-custom-unit" className={LABEL}>Your unit name</label>
                <input
                  id="ssc-custom-unit" type="text" value={customUnit} maxLength={16} autoComplete="off"
                  placeholder="e.g. washes, servings, rides"
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className={`${INPUT} mt-1.5`}
                />
                <FieldMsg id="ssc-custom-unit-msg" hint="Pick “custom” in the unit dropdown to use it." />
              </div>
            )}
          </div>
        </div>

        {/* ---------- step 2 (POPUP CONTROLLER & COMPACT OVERVIEW) ---------- */}
        <div className={`${CARD} p-4 sm:p-5`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <StepHead
              n={2}
              title={`Enter the ${cat.label.toLowerCase()} options`}
              hint={`Configure up to ${MAX_OPTIONS} plans & options in a clean popup.`}
            />
            <button
              type="button"
              onClick={() => setOptionsModalOpen(true)}
              className={`${BTN_PRIMARY} w-full sm:w-auto`}
            >
              <Edit3 className="h-4 w-4" aria-hidden /> Open &amp; Edit Options ({options.length})
            </button>
          </div>

          {/* Quick options overview chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rows.map((r) => (
              <button
                key={r.opt.id}
                type="button"
                onClick={() => setOptionsModalOpen(true)}
                className={`group inline-flex items-center gap-2 rounded-xl border-2 border-foreground px-3 py-2 text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                  r.ready
                    ? "bg-background text-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                    : "border-dashed border-red-500/80 bg-red-500/10 text-red-700 dark:text-red-300"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center rounded bg-foreground/10 text-[10px] font-black">
                  {r.idx + 1}
                </span>
                <span>{r.label}</span>
                {r.ready ? (
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black text-foreground">
                      {inr(r.effective)} / {r.totalQty} {r.unit?.label}
                    </span>
                    {r.bundledDataPerDayGb != null && (
                      <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-black text-indigo-700 dark:text-indigo-300">
                        {num(r.bundledDataPerDayGb, 2)} GB/day
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400">
                    Needs info
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                addOption();
                setOptionsModalOpen(true);
              }}
              disabled={options.length >= MAX_OPTIONS}
              className={BTN_GHOST}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add option
            </button>
          </div>

          {analysis.mismatched.length > 0 && (
            <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-400/15 p-3 shadow-[2px_2px_0_0_var(--color-foreground)]">
              <p className="flex items-start gap-2 text-xs font-bold text-foreground">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span>
                  {analysis.mismatched.map((r) => r.label).join(", ")}{" "}
                  {analysis.mismatched.length === 1 ? "uses" : "use"} a different unit dimension and won't be compared directly.
                </span>
              </p>
            </div>
          )}
        </div>

        {/* ---------- step 3 (DYNAMIC BASED ON SELECTED SECTION) ---------- */}
        <div className={`${CARD} p-4 sm:p-5`}>
          <StepHead
            n={3}
            title={`How much ${cat.qtyNoun} do you actually need?`}
            hint={`Optional. Fill this in and Quickly calculates the cheapest combination of plans for your target ${cat.qtyNoun}.`}
          />

          <div className="grid gap-3 sm:max-w-lg sm:grid-cols-[minmax(0,1fr)_12.5rem]">
            <div className="min-w-0">
              <label htmlFor="ssc-need" className={LABEL}>
                {cat.key === "subscription" ? "Duration needed" : cat.key === "data" ? "Data quota needed" : `${cat.qtyLabel} needed`}
              </label>
              <input
                ref={needRef} id="ssc-need" type="text" inputMode="decimal" autoComplete="off"
                value={need} placeholder={cat.needPlaceholder}
                aria-invalid={!!analysis.needErr || undefined}
                aria-describedby="ssc-need-msg"
                onChange={(e) => setNeed(sanitizeNum(e.target.value))}
                className={`${INPUT} mt-1.5 ${analysis.needErr ? INPUT_BAD : ""}`}
              />
            </div>
            <div className="min-w-0">
              <span className={LABEL}>Unit</span>
              <div className="mt-1.5">
                <Select
                  id="ssc-need-unit" label="Required unit" value={needUnit} onChange={setNeedUnit}
                  describedBy="ssc-need-msg"
                >
                  <UnitOptions dims={activeDims} customName={customUnit} />
                </Select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <FieldMsg
                id="ssc-need-msg"
                error={analysis.needErr}
                hint="Without this, you still get the best rate and the cheapest option below."
              />
            </div>
          </div>
        </div>

        {/* ---------- compare button ---------- */}
        <div className={`${CARD} flex min-w-0 flex-wrap items-center justify-between gap-3 p-4`}>
          <p aria-live="polite" className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
            {statusText}
          </p>
          <button type="submit" className={`${BTN_PRIMARY} w-full sm:w-auto`}>
            <Zap className="h-4 w-4" aria-hidden /> Compare {comparable.length >= 2 ? `${comparable.length} options` : "options"}
          </button>
        </div>
      </form>

      {/* ---------- EDIT OPTIONS POPUP MODAL ---------- */}
      {optionsModalOpen && (
        <Modal
          title={`Configure ${cat.label} Options`}
          icon={<Edit3 className="h-4 w-4 text-primary" aria-hidden />}
          maxWidth="max-w-2xl sm:max-w-3xl"
          onClose={() => setOptionsModalOpen(false)}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addOption}
                  disabled={options.length >= MAX_OPTIONS}
                  className={BTN_GHOST}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add another option
                </button>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {options.length} of {MAX_OPTIONS}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setOptionsModalOpen(false)}
                className={BTN_PRIMARY}
              >
                <Check className="h-4 w-4" aria-hidden /> Done
              </button>
            </div>
          }
        >
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Configure up to {MAX_OPTIONS} options. Enter the price and {cat.qtyNoun}.
            {cat.allowsBundledData && " You can also specify bundled daily/total GB data."}
          </p>

          <div className="space-y-3">
            {rows.map((r) => (
              <OptionCard
                key={r.opt.id}
                row={r} cat={cat} customUnit={customUnit}
                canRemove={options.length > 2}
                errOf={errOf}
                onPatch={(p) => patch(r.opt.id, p)}
                onRemove={() => removeOption(r.opt.id)}
              />
            ))}
          </div>
        </Modal>
      )}

      {/* ---------- results ---------- */}
      {revealed && (
        <section ref={resultsRef} aria-labelledby="ssc-results-heading" className="scroll-mt-4 space-y-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h2 id="ssc-results-heading" className="text-base font-black uppercase tracking-wide">
              {subject.trim() ? `${subject.trim()} — results` : "Results"}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOptionsModalOpen(true)}
                className={BTN_GHOST}
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden /> Edit options
              </button>
              <button
                type="button"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={BTN_GHOST}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Back to top
              </button>
            </div>
          </div>

          {computing ? (
            <ResultsSkeleton />
          ) : comparable.length < 2 || !displayUnit || !analysis.bestValue || !analysis.cheapest ? (
            <div className={`${CARD} p-6 text-center`}>
              <div className="mx-auto mb-3 inline-flex rounded-2xl border-2 border-foreground bg-primary/10 p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                <Info className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <p className="text-sm font-black uppercase tracking-wide">Not enough options to compare yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm font-semibold text-muted-foreground">
                Two options need a valid price and {cat.qtyNoun} in the same unit family.
              </p>
              <button
                type="button"
                onClick={() => setOptionsModalOpen(true)}
                className={`${BTN_PRIMARY} mt-4`}
              >
                <Edit3 className="h-4 w-4" aria-hidden /> Open Options Editor
              </button>
            </div>
          ) : (
            <Results
              analysis={analysis} cat={cat} customUnit={customUnit} displayUnit={displayUnit}
              unitWord={unitWord} sortBy={sortBy} setSortBy={setSortBy}
              summary={summary} canShare={canShare}
              onCopy={copySummary} onShare={shareSummary}
              onWantNeed={() => {
                formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.setTimeout(() => needRef.current?.focus(), 300);
              }}
            />
          )}
        </section>
      )}

      {resetOpen && (
        <Modal
          title="Reset comparison"
          icon={<AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />}
          onClose={() => setResetOpen(false)}
        >
          <p className="text-sm font-semibold text-foreground">
            This clears every option, the item name and your requirement. Nothing is saved anywhere, so it cannot be recovered.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" autoFocus onClick={doReset} className={`${BTN_PRIMARY} flex-1 bg-red-500 text-white`}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset everything
            </button>
            <button type="button" onClick={() => setResetOpen(false)} className={BTN_GHOST}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* option card                                                        */
/* ------------------------------------------------------------------ */

function OptionCard({
  row, cat, customUnit, canRemove, errOf, onPatch, onRemove,
}: {
  row: Row; cat: CategoryDef; customUnit: string; canRemove: boolean;
  errOf: (r: Row, f: FieldKey) => string | undefined;
  onPatch: (p: Partial<Opt>) => void;
  onRemove: () => void;
}) {
  const o = row.opt;
  const id = `ssc-${o.id}`;
  const activeExtras =
    (o.discount.value.trim() ? 1 : 0) + (o.coupon.value.trim() ? 1 : 0) + (o.cashback.value.trim() ? 1 : 0);
  const dUnit = row.dispUnit;

  return (
    <fieldset className={`${SUBCARD} min-w-0 p-3 sm:p-4`}>
      <legend className="sr-only">{row.label}</legend>

      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-secondary/40 text-[11px] font-black">
          {row.idx + 1}
        </span>
        <label htmlFor={`${id}-name`} className="sr-only">Option {row.idx + 1} name</label>
        <input
          id={`${id}-name`} type="text" value={o.name} maxLength={40} autoComplete="off"
          placeholder={cat.namePlaceholder}
          onChange={(e) => onPatch({ name: e.target.value })}
          className={`${INPUT} min-h-10 py-1.5`}
        />
        <button
          type="button" onClick={onRemove} disabled={!canRemove}
          aria-label={`Remove ${row.label}`}
          title={canRemove ? `Remove ${row.label}` : "Keep at least two options"}
          className="shrink-0 rounded-lg border-2 border-foreground bg-card p-2 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:bg-red-500 hover:text-white disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Price */}
        <div className="min-w-0">
          <label htmlFor={`${id}-price`} className={LABEL}>Price</label>
          <div className="relative mt-1.5">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black">₹</span>
            <input
              id={`${id}-price`} type="text" inputMode="decimal" autoComplete="off"
              value={o.price} placeholder={cat.pricePlaceholder}
              aria-invalid={!!errOf(row, "price") || undefined}
              aria-describedby={`${id}-price-msg`}
              onChange={(e) => onPatch({ price: sanitizeNum(e.target.value) })}
              className={`${INPUT} pl-8 ${errOf(row, "price") ? INPUT_BAD : ""}`}
            />
          </div>
          <FieldMsg id={`${id}-price-msg`} error={errOf(row, "price")} />
        </div>

        {/* Quantity / Duration + Unit */}
        <div className="min-w-0">
          <label htmlFor={`${id}-qty`} className={LABEL}>{cat.qtyLabel}</label>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_12rem] gap-2">
            <input
              id={`${id}-qty`} type="text" inputMode="decimal" autoComplete="off"
              value={o.qty} placeholder={cat.qtyPlaceholder}
              aria-invalid={!!errOf(row, "qty") || undefined}
              aria-describedby={`${id}-qty-msg`}
              onChange={(e) => onPatch({ qty: sanitizeNum(e.target.value) })}
              className={`${INPUT} ${errOf(row, "qty") ? INPUT_BAD : ""}`}
            />
            <Select
              id={`${id}-unit`} label={`${cat.qtyLabel} unit`} value={o.unit}
              invalid={!!errOf(row, "unit")} describedBy={`${id}-qty-msg`}
              onChange={(v) => onPatch({ unit: v })}
            >
              <UnitOptions dims={cat.qtyDims} customName={customUnit} />
            </Select>
          </div>
          <FieldMsg id={`${id}-qty-msg`} error={errOf(row, "qty") ?? errOf(row, "unit")} />
        </div>

        {/* Subscription Optional Bundled Data */}
        {cat.allowsBundledData && (
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`${id}-subdata`} className={`flex items-center gap-1.5 ${LABEL}`}>
              <HardDrive className="h-3.5 w-3.5" aria-hidden />
              Included Data Benefit <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <div className="mt-1.5 flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="flex-1 min-w-[120px]">
                <input
                  id={`${id}-subdata`} type="text" inputMode="decimal" autoComplete="off"
                  value={o.subDataQty} placeholder="e.g. 1.5, 2, 50"
                  onChange={(e) => onPatch({ subDataQty: sanitizeNum(e.target.value) })}
                  className={INPUT}
                />
              </div>
              <div className="w-24 sm:w-28 shrink-0">
                <Select
                  id={`${id}-subdata-unit`} label="Data unit" value={o.subDataUnit}
                  onChange={(v) => onPatch({ subDataUnit: v })}
                >
                  <option value="mb">MB</option>
                  <option value="gb">GB</option>
                  <option value="tb">TB</option>
                </Select>
              </div>
              <button
                type="button" aria-pressed={o.subDataPerDay}
                onClick={() => onPatch({ subDataPerDay: !o.subDataPerDay })}
                className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border-2 border-foreground px-3.5 text-xs font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] transition-colors ${
                  o.subDataPerDay ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
                }`}
              >
                <span>{o.subDataPerDay ? "/ Day" : "Total"}</span>
              </button>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
              Useful for comparing plans that bundle daily data (e.g. 2 GB/day) with subscription access.
            </p>
          </div>
        )}

        {/* Validity for data plans */}
        {cat.validity && (
          <>
            <div className="min-w-0">
              <label htmlFor={`${id}-validity`} className={LABEL}>{cat.validity.label}</label>
              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_12rem] gap-2">
                <input
                  id={`${id}-validity`} type="text" inputMode="decimal" autoComplete="off"
                  value={o.validity} placeholder={cat.validity.placeholder}
                  aria-invalid={!!errOf(row, "validity") || undefined}
                  aria-describedby={`${id}-validity-msg`}
                  onChange={(e) => onPatch({ validity: sanitizeNum(e.target.value) })}
                  className={`${INPUT} ${errOf(row, "validity") ? INPUT_BAD : ""}`}
                />
                <Select
                  id={`${id}-validity-unit`} label={`${cat.validity.label} unit`} value={o.validityUnit}
                  onChange={(v) => onPatch({ validityUnit: v })}
                >
                  <UnitOptions dims={["time"]} customName={customUnit} />
                </Select>
              </div>
              <FieldMsg id={`${id}-validity-msg`} error={errOf(row, "validity")} />
            </div>

            {cat.perDay && (
              <div className="min-w-0">
                <span className={LABEL}>{cat.perDay.label}</span>
                <div className="mt-1.5">
                  <button
                    type="button" aria-pressed={o.perDay}
                    onClick={() => onPatch({ perDay: !o.perDay })}
                    className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 border-foreground px-3 py-2.5 text-xs font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 ${
                      o.perDay ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
                    }`}
                  >
                    <span>{o.perDay ? "Data is per day" : "Data is a total"}</span>
                    <span
                      aria-hidden
                      className={`grid h-5 w-5 place-items-center rounded border-2 border-current ${o.perDay ? "" : "opacity-40"}`}
                    >
                      {o.perDay && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                </div>
                <FieldMsg
                  id={`${id}-perday-msg`}
                  hint={
                    o.perDay && row.validityDays && toNum(o.qty)
                      ? `${num(toNum(o.qty)!, 4)} ${UNIT_MAP[o.unit]?.label} × ${num(row.validityDays, 2)} days = ${qtyText(row.qtyBase, UNIT_MAP[o.unit] ?? UNIT_MAP.gb, customUnit)} total.`
                      : cat.perDay.hint
                  }
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Live readout */}
      {row.ready && dUnit && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`${CHIP} bg-primary/10`}>
            <TrendingDown className="h-3 w-3" aria-hidden />
            {rateStr(row.perBase * dUnit.factor)} / {uLabel(dUnit, customUnit)}
          </span>
          <span className={CHIP}>{inr(row.effective)} for {qtyText(row.qtyBase, dUnit, customUnit)}</span>
          {row.perDayCost != null && <span className={CHIP}>{rateStr(row.perDayCost)} / day</span>}
          {row.bundledDataPerDayGb != null && (
            <span className={`${CHIP} bg-indigo-500/15 text-indigo-800 dark:text-indigo-300`}>
              <HardDrive className="h-3 w-3" aria-hidden /> {num(row.bundledDataPerDayGb, 2)} GB/day ({num(row.bundledDataTotalGb!, 1)} GB total)
            </span>
          )}
          {row.cashbackAmt > 0 && (
            <span className={`${CHIP} bg-emerald-500/15`}>
              <Gift className="h-3 w-3" aria-hidden /> {inr(row.payable)} upfront
            </span>
          )}
        </div>
      )}

      {/* Extras (Discounts / Coupons / Cashback) */}
      <div className="mt-3">
        <button
          type="button" aria-expanded={o.extras} aria-controls={`${id}-extras`}
          onClick={() => onPatch({ extras: !o.extras })}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-dashed border-foreground/40 bg-card px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors hover:border-foreground"
        >
          <BadgePercent className="h-3.5 w-3.5" aria-hidden />
          Discount, coupon &amp; cashback
          {activeExtras > 0 && (
            <span className="rounded-full border-2 border-foreground bg-primary px-1.5 text-[10px] font-black text-primary-foreground">
              {activeExtras}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${o.extras ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {o.extras && (
          <div id={`${id}-extras`} className="mt-3 space-y-3 rounded-xl border-2 border-foreground/25 bg-card p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <ModField
                id={`${id}-discount`} label="Discount" icon={<BadgePercent className="h-3.5 w-3.5" aria-hidden />}
                mod={o.discount} onChange={(m) => onPatch({ discount: m })} error={errOf(row, "discount")}
              />
              <ModField
                id={`${id}-coupon`} label="Coupon" icon={<Ticket className="h-3.5 w-3.5" aria-hidden />}
                mod={o.coupon} onChange={(m) => onPatch({ coupon: m })} error={errOf(row, "coupon")}
              />
              <ModField
                id={`${id}-cashback`} label="Cashback" icon={<Gift className="h-3.5 w-3.5" aria-hidden />}
                mod={o.cashback} onChange={(m) => onPatch({ cashback: m })} error={errOf(row, "cashback")}
              />
            </div>

            {row.price > 0 && (row.discountAmt > 0 || row.couponAmt > 0 || row.cashbackAmt > 0) && (
              <div className="rounded-xl border-2 border-foreground bg-background p-3 text-[11px] font-bold shadow-[2px_2px_0_0_var(--color-foreground)]">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
                  <span className="line-through">{inr(row.price)}</span>
                  {row.discountAmt > 0 && <span>− {inr(row.discountAmt)} discount</span>}
                  {row.couponAmt > 0 && <span>− {inr(row.couponAmt)} coupon</span>}
                  <span className="text-foreground">= you pay {inr(row.payable)}</span>
                </p>
                {row.cashbackAmt > 0 && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
                    <span>− {inr(row.cashbackAmt)} cashback</span>
                    <span className="text-foreground">= effective cost {inr(row.effective)}</span>
                  </p>
                )}
              </div>
            )}

            {row.notes.length > 0 && (
              <ul className="space-y-1">
                {row.notes.map((n) => (
                  <li key={n} className="flex items-start gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />{n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* results                                                            */
/* ------------------------------------------------------------------ */

function comboText(combo: Combo, comparable: Row[], u: UnitDef, customUnit: string) {
  return combo.picks
    .map((p) => ({ p, row: comparable.find((r) => r.opt.id === p.id) }))
    .filter((x) => x.row)
    .sort((a, b) => b.row!.qtyBase - a.row!.qtyBase)
    .map(({ p, row }) => `${p.count} × ${qtyText(row!.qtyBase, u, customUnit)}`)
    .join(" + ");
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Working out the best value…</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD} h-32 animate-pulse bg-secondary/30`} />
        ))}
      </div>
      <div className={`${CARD} h-48 animate-pulse bg-secondary/30`} />
    </div>
  );
}

function Results({
  analysis, cat, customUnit, displayUnit, unitWord, sortBy, setSortBy,
  summary, canShare, onCopy, onShare, onWantNeed,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: any;
  cat: CategoryDef; customUnit: string; displayUnit: UnitDef; unitWord: string;
  sortBy: SortKey; setSortBy: (s: SortKey) => void;
  summary: string; canShare: boolean;
  onCopy: () => void; onShare: () => void; onWantNeed: () => void;
}) {
  const {
    comparable, byValue, byTotal, bestValue, cheapest, valueTies, bestPerDay,
    combo, baseline, saving, needBase, hasCashback,
  } = analysis as {
    comparable: Row[]; byValue: Row[]; byTotal: Row[]; bestValue: Row; worstValue: Row; cheapest: Row;
    valueTies: Row[]; bestPerDay: Row | null;
    combo: Combo | null; singles: { row: Row; count: number; cost: number; qtyBase: number }[];
    baseline: { row: Row; count: number; cost: number; qtyBase: number } | null;
    saving: number; needBase: number; hasCashback: boolean;
  };

  const U = unitWord;
  const rateOf = (r: Row) => r.perBase * displayUnit.factor;
  const bestRate = rateOf(bestValue);
  const sameWinner = bestValue.opt.id === cheapest.opt.id;
  const hasRequirement = combo != null && needBase > 0;

  const sorted = useMemo(() => {
    if (sortBy === "total") return byTotal;
    if (sortBy === "entered") return [...comparable].sort((a, b) => a.idx - b.idx);
    return byValue;
  }, [sortBy, byValue, byTotal, comparable]);

  const announce = `Buy ${bestValue.label} — it gives you the most ${U} for your money.` +
    (hasRequirement ? ` For ${qtyText(needBase, displayUnit, customUnit)}, buy ${comboText(combo!, comparable, displayUnit, customUnit)} for ${inr(combo!.totalCost)}.` : "");

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="sr-only">{announce}</p>

      {/* Best Value Verdict */}
      <div className={`${CARD} p-5 bg-primary/10`}>
        <div className={`flex items-center gap-1.5 ${LABEL}`}>
          <Trophy className="h-4 w-4 text-primary" aria-hidden />
          Best Value Choice
        </div>
        <p className="mt-2 text-2xl font-black text-foreground">{bestValue.label}</p>
        <p className="mt-1 text-sm font-bold text-foreground">
          It gives you the best rate for your money — {rateStr(bestRate)} per {U}.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {sameWinner ? (
            <span className={`${CHIP} bg-emerald-500/15`}><Wallet className="h-3 w-3" aria-hidden />Also the lowest total cost</span>
          ) : (
            <span className={CHIP}>{cheapest.label} has a smaller bill ({inr(cheapest.effective)}), but higher rate per {U}</span>
          )}
          {bestPerDay && bestPerDay.opt.id === bestValue.opt.id && (
            <span className={`${CHIP} bg-primary/10`}><CalendarClock className="h-3 w-3" aria-hidden />₹{num(bestPerDay.perDayCost!, 2)}/day too</span>
          )}
          {bestValue.bundledDataPerDayGb != null && (
            <span className={`${CHIP} bg-indigo-500/15 text-indigo-800 dark:text-indigo-300`}>
              <HardDrive className="h-3 w-3" aria-hidden /> Includes {num(bestValue.bundledDataPerDayGb, 2)} GB/day
            </span>
          )}
        </div>

        {valueTies.length > 1 && (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            Same rate per {U} as {valueTies.filter((r) => r.opt.id !== bestValue.opt.id).map((r) => r.label).join(", ")}.
          </p>
        )}
      </div>

      {bestPerDay && bestPerDay.opt.id !== bestValue.opt.id && (
        <div className={`${SUBCARD} p-3 sm:p-4`}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
            <span className={`${CHIP} bg-primary/10`}>
              <CalendarClock className="h-3 w-3" aria-hidden />Cheaper by the day
            </span>
            <span className="text-foreground">
              If you prefer the lowest cost per day, {bestPerDay.label} costs ₹{num(bestPerDay.perDayCost!, 2)} a day.
            </span>
          </p>
        </div>
      )}

      {hasRequirement ? (
        <div className={`${CARD} p-5 bg-indigo-500/10`}>
          <div className={`flex items-center gap-1.5 ${LABEL}`}>
            <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            For the {qtyText(needBase, displayUnit, customUnit)} you need
          </div>
          <p className="mt-2 text-xl font-black text-foreground">{comboText(combo!, comparable, displayUnit, customUnit)}</p>
          <p className="mt-1 text-sm font-bold text-foreground">Total cost: {inr(combo!.totalCost)}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {combo!.picks
              .map((p) => {
                const r = comparable.find((x) => x.opt.id === p.id)!;
                return `Buy ${p.count} × ${r.label}`;
              })
              .join(", ")}
            {!combo!.exact && " (rounded to the best pack for this quantity)"}
          </p>
          {saving > 0 && baseline && (
            <p className="mt-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
              This saves you {inr(saving)} compared to buying only {baseline.row.label} ({baseline.count} of them, {inr(baseline.cost)} total).
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-foreground/40 bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <div className={`flex items-center gap-1.5 ${LABEL}`}>
            <Target className="h-4 w-4" aria-hidden />Want a tailored combination?
          </div>
          <p className="mt-2 text-sm font-bold text-muted-foreground">
            Tell us how much {cat.qtyNoun} you actually need, and we'll calculate the cheapest pack combination.
          </p>
          <button type="button" onClick={onWantNeed} className={`${BTN_GHOST} mt-3`}>
            <Target className="h-3.5 w-3.5" aria-hidden /> Enter requirement
          </button>
        </div>
      )}

      {/* Full comparison table */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden />
            Side by Side Comparison
          </h3>
          <div className="flex items-center gap-2">
            <label htmlFor="ssc-sort" className={LABEL}>Sort by</label>
            <div className="w-40">
              <Select id="ssc-sort" label="Sort options" value={sortBy} onChange={(v) => setSortBy(v as SortKey)}>
                <option value="value">Best value</option>
                <option value="total">Lowest price</option>
                <option value="entered">As entered</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Desktop table */}
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-full border-collapse text-sm">
            <caption className="sr-only">Every option with what you get, what you pay, and the price per {U}</caption>
            <thead>
              <tr className="border-b-2 border-foreground/20 text-left">
                {["Option", `Duration / Quantity (${U})`, "Bundled Data", "Total Price", `Rate per ${U}`].map((h, i) => (
                  <th
                    key={h} scope="col"
                    className={`pb-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground ${i > 2 ? "text-right" : i === 1 || i === 2 ? "text-center" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const rate = rateOf(r);
                const isBest = valueTies.some((t) => t.opt.id === r.opt.id);
                return (
                  <tr key={r.opt.id} className={`border-b border-foreground/10 ${isBest ? "bg-primary/5" : ""}`}>
                    <td className="py-3 pr-3">
                      <p className="font-black">{r.label}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {isBest && <span className={`${CHIP} bg-primary/15`}><Trophy className="h-3 w-3" aria-hidden />Best value</span>}
                        {r.opt.id === cheapest.opt.id && <span className={`${CHIP} bg-emerald-500/15`}><Wallet className="h-3 w-3" aria-hidden />Cheapest</span>}
                        {r.perDayCost != null && <span className={CHIP}>₹{num(r.perDayCost, 2)}/day</span>}
                      </div>
                    </td>
                    <td className="py-3 text-center font-semibold tabular-nums">{num(r.qtyBase / displayUnit.factor, 4)}</td>
                    <td className="py-3 text-center font-semibold">
                      {r.bundledDataPerDayGb != null ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          {num(r.bundledDataPerDayGb, 2)} GB/day
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums">
                      {inr(r.effective)}
                      {r.cashbackAmt > 0 && (
                        <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          after cashback
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-base font-black tabular-nums">{rateStr(rate)}</span>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full border border-foreground bg-background">
                        <span
                          className={`block h-full ${isBest ? "bg-primary" : "bg-foreground/40"}`}
                          style={{ width: `${Math.max(6, Math.min(100, (bestRate / rate) * 100))}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="mt-4 space-y-2 md:hidden">
          {sorted.map((r) => {
            const rate = rateOf(r);
            const isBest = valueTies.some((t) => t.opt.id === r.opt.id);
            return (
              <li key={r.opt.id} className={`${SUBCARD} p-3 ${isBest ? "bg-primary/5" : ""}`}>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black">{r.label}</p>
                  <p className="shrink-0 text-right">
                    <span className="block text-lg font-black leading-none tabular-nums">{rateStr(rate)}</span>
                    <span className="text-[10px] font-black uppercase text-muted-foreground">per {U}</span>
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {isBest && <span className={`${CHIP} bg-primary/15`}><Trophy className="h-3 w-3" aria-hidden />Best value</span>}
                  {r.opt.id === cheapest.opt.id && <span className={`${CHIP} bg-emerald-500/15`}><Wallet className="h-3 w-3" aria-hidden />Cheapest</span>}
                  {r.perDayCost != null && <span className={CHIP}>₹{num(r.perDayCost, 2)}/day</span>}
                  {r.bundledDataPerDayGb != null && (
                    <span className={`${CHIP} bg-indigo-500/15 text-indigo-800 dark:text-indigo-300`}>
                      {num(r.bundledDataPerDayGb, 2)} GB/day
                    </span>
                  )}
                </div>

                <span className="mt-2 block h-2 w-full overflow-hidden rounded-full border-2 border-foreground bg-background">
                  <span
                    className={`block h-full ${isBest ? "bg-primary" : "bg-foreground/40"}`}
                    style={{ width: `${Math.max(6, Math.min(100, (bestRate / rate) * 100))}%` }}
                  />
                </span>

                <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
                  <div>
                    <dt className="text-[9px] font-black uppercase text-muted-foreground">Duration/Qty</dt>
                    <dd className="text-xs font-black tabular-nums">{qtyText(r.qtyBase, displayUnit, customUnit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-black uppercase text-muted-foreground">You pay</dt>
                    <dd className="text-xs font-black tabular-nums">{inr(r.effective)}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Actions */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCopy} className={BTN_PRIMARY}>
            <Copy className="h-4 w-4" aria-hidden /> Copy this comparison
          </button>
        </div>

        <details className="mt-3 group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            Show as text
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border-2 border-foreground bg-background p-3 text-[11px] font-semibold leading-relaxed shadow-[2px_2px_0_0_var(--color-foreground)]">
            {summary}
          </pre>
        </details>

        <p className="mt-3 text-[10px] font-semibold text-muted-foreground">
          Calculations are computed live directly in your browser.
          {hasCashback && " Cashback is applied where specified; full amounts are payable upfront."}
        </p>
      </div>
    </div>
  );
}
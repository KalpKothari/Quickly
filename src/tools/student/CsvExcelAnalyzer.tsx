import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
// NOTE: Run `npm i xlsx-js-style` for native Excel colors with zero warnings.
// If you still have `xlsx` installed, change this import to `import * as XLSX from "xlsx-js-style";`
import * as XLSX from "xlsx-js-style";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  RotateCcw,
  Download,
  Search,
  Filter as FilterIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sparkles,
  AlertTriangle,
  Copy,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  ScatterChart as ScatterChartIcon,
  Table2,
  LayoutDashboard,
  Lightbulb,
  Wand2,
  Hash,
  Type as TypeIcon,
  CalendarDays,
  Layers,
  RefreshCw,
  ListFilter,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// --- Tunables -------------------------------------------------------------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const MAX_TYPE_SAMPLE = 500;
const MAX_CHART_CATEGORIES = 15;
const MAX_SCATTER_POINTS = 1500;
const LARGE_FILE_WARN_BYTES = 30 * 1024 * 1024;

const CHART_COLORS = [
  "#2563eb",
  "#f97316",
  "#10b981",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#eab308",
  "#ef4444",
];

// --- Types ------------------------------------------------------------------
type CellValue = string | number | boolean | Date | null;
type Row = Record<string, CellValue>;
type ColumnType = "number" | "date" | "text" | "empty";

interface ColumnInfo {
  name: string;
  type: ColumnType;
  missing: number;
  unique: number;
}

interface NumericStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  sum: number;
  count: number;
  range: number;
}

interface TextStats {
  unique: number;
  top: { value: string; count: number; pct: number }[];
}

interface DateStats {
  earliest: Date;
  latest: Date;
  rangeDays: number;
}

type FilterOperator = "contains" | "equals" | "notEquals" | "gt" | "lt" | "between" | "empty" | "notEmpty";

interface FilterRule {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
  value2: string;
}

interface SortConfig {
  column: string | null;
  direction: "asc" | "desc" | null;
}

type ChartType = "bar" | "line" | "pie" | "scatter" | "histogram";
type Aggregation = "sum" | "avg" | "count";

type InsightCategory = "all" | "health" | "peaks" | "categories" | "timeline";

interface FormattedInsight {
  id: string;
  category: "health" | "peaks" | "categories" | "timeline";
  title: string;
  description: string;
  metric?: string;
  subMetric?: string;
  action?: { label: string; tab: TabId };
}

type TabId = "dashboard" | "explorer" | "statistics" | "insights" | "charts" | "clean";

// --- Pure Helpers -----------------------------------------------------------
function isEmptyValue(v: CellValue): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function toNumber(v: CellValue): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date || typeof v === "boolean") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const cleaned = s.replace(/[$€£¥₹,%]/g, "").trim();
    if (cleaned === "" || isNaN(Number(cleaned))) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toDate(v: CellValue): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.length < 6) return null;
    if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) && !/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) {
      if (!/[A-Za-z]{3,}\s+\d{1,2}/.test(s) && !/\d{1,2}\s+[A-Za-z]{3,}/.test(s)) {
        return null;
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function detectColumnType(values: CellValue[]): ColumnType {
  const nonEmpty = values.filter((v) => !isEmptyValue(v));
  if (nonEmpty.length === 0) return "empty";
  const sample = nonEmpty.slice(0, MAX_TYPE_SAMPLE);
  let numCount = 0;
  let dateCount = 0;

  for (const v of sample) {
    if (toNumber(v) !== null) {
      numCount++;
      continue;
    }
    if (toDate(v) !== null) {
      dateCount++;
    }
  }

  if (numCount / sample.length >= 0.8) return "number";
  if (dateCount / sample.length >= 0.8) return "date";
  return "text";
}

function buildColumnInfo(headers: string[], rows: Row[]): ColumnInfo[] {
  return headers.map((name) => {
    const values = rows.map((r) => r[name]);
    const type = detectColumnType(values);
    const missing = values.filter(isEmptyValue).length;
    const unique = new Set(
      values.filter((v) => !isEmptyValue(v)).map((v) => (v instanceof Date ? v.getTime() : String(v).trim()))
    ).size;
    return { name, type, missing, unique };
  });
}

function computeNumericStats(values: CellValue[]): NumericStats | null {
  const nums = values.map(toNumber).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / nums.length,
    median,
    sum,
    count: nums.length,
    range: sorted[sorted.length - 1] - sorted[0],
  };
}

function computeTextStats(values: CellValue[], totalRows: number): TextStats {
  const nonEmpty = values.filter((v) => !isEmptyValue(v)).map((v) => String(v).trim());
  const counts = new Map<string, number>();
  for (const v of nonEmpty) counts.set(v, (counts.get(v) ?? 0) + 1);

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([value, count]) => ({
      value,
      count,
      pct: totalRows > 0 ? Math.round((count / totalRows) * 100) : 0,
    }));
  return { unique: counts.size, top };
}

function computeDateStats(values: CellValue[]): DateStats | null {
  const dates = values.map(toDate).filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const rangeDays = Math.max(0, Math.round((latest.getTime() - earliest.getTime()) / 86400000));
  return { earliest, latest, rangeDays };
}

function rowKey(row: Row, headers: string[]): string {
  return headers
    .map((h) => {
      const v = row[h];
      return v instanceof Date ? v.toISOString() : String(v ?? "").trim();
    })
    .join("\u0001");
}

function matchesFilter(value: CellValue, rule: FilterRule, columnType: ColumnType): boolean {
  const empty = isEmptyValue(value);
  if (rule.operator === "empty") return empty;
  if (rule.operator === "notEmpty") return !empty;
  if (empty) return false;

  if (columnType === "number") {
    const n = toNumber(value);
    const target = toNumber(rule.value);
    if (n === null || target === null) return false;
    switch (rule.operator) {
      case "equals":
        return n === target;
      case "notEquals":
        return n !== target;
      case "gt":
        return n > target;
      case "lt":
        return n < target;
      case "between": {
        const target2 = toNumber(rule.value2);
        return target2 !== null && n >= target && n <= target2;
      }
      case "contains":
        return String(n).includes(rule.value);
      default:
        return true;
    }
  }

  if (columnType === "date") {
    const d = toDate(value);
    if (!d) return false;
    const target = rule.value ? new Date(rule.value).getTime() : NaN;
    const target2 = rule.value2 ? new Date(rule.value2).getTime() : NaN;
    switch (rule.operator) {
      case "equals":
        return !isNaN(target) && d.getTime() === target;
      case "notEquals":
        return !isNaN(target) && d.getTime() !== target;
      case "gt":
        return !isNaN(target) && d.getTime() > target;
      case "lt":
        return !isNaN(target) && d.getTime() < target;
      case "between":
        return !isNaN(target) && !isNaN(target2) && d.getTime() >= target && d.getTime() <= target2;
      case "contains":
        return d.toISOString().includes(rule.value);
      default:
        return true;
    }
  }

  const s = String(value).toLowerCase();
  const rv = rule.value.trim().toLowerCase();
  switch (rule.operator) {
    case "contains":
      return s.includes(rv);
    case "equals":
      return s === rv;
    case "notEquals":
      return s !== rv;
    case "gt":
      return s > rv;
    case "lt":
      return s < rv;
    case "between":
      return s >= rv && s <= rule.value2.trim().toLowerCase();
    default:
      return true;
  }
}

function rowsToCsv(headers: string[], rows: Row[]): string {
  const escape = (v: CellValue) => {
    if (isEmptyValue(v)) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}

export default function CsvExcelAnalyzer() {
  const { showSupportPrompt } = useSupportPrompt();

  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  const [headers, setHeaders] = useState<string[]>([]);
  const [originalRows, setOriginalRows] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [typeOverrides, setTypeOverrides] = useState<Map<string, ColumnType>>(new Map());

  const [status, setStatus] = useState<"idle" | "parsing" | "analyzing" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  // Explorer State
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: null });
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(new Map());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [highlightIssues, setHighlightIssues] = useState(true);
  const [rawView, setRawView] = useState(false);

  // Statistics filter
  const [statsTypeFilter, setStatsTypeFilter] = useState<"all" | "number" | "text" | "date">("all");
  const [statsSearch, setStatsSearch] = useState("");

  // Insights filter tab
  const [activeInsightFilter, setActiveInsightFilter] = useState<InsightCategory>("all");

  // Chart State
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartX, setChartX] = useState<string>("");
  const [chartY, setChartY] = useState<string>("");
  const [chartAgg, setChartAgg] = useState<Aggregation>("sum");
  const [histBins, setHistBins] = useState(10);
  const chartRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  // Load Data
  const applyParsedData = (newHeaders: string[], newRows: Row[]) => {
    setStatus("analyzing");
    setTimeout(() => {
      setHeaders(newHeaders);
      setOriginalRows(newRows);
      setRows(newRows);
      setTypeOverrides(new Map());
      setFilters([]);
      setSearch("");
      setSortConfig({ column: null, direction: null });
      setHiddenColumns(new Set());
      setColumnWidths(new Map());
      setPage(1);
      setChartX("");
      setChartY("");
      setActiveTab("dashboard");
      setStatus("ready");
      toast.success(`Loaded ${newRows.length.toLocaleString()} rows and ${newHeaders.length} columns`);
    }, 150);
  };

  const reset = () => {
    setRawFiles([]);
    setFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet("");
    setHeaders([]);
    setOriginalRows([]);
    setRows([]);
    setTypeOverrides(new Map());
    setStatus("idle");
    setErrorMsg(null);
    setActiveTab("dashboard");
    setSearch("");
    setFilters([]);
    setSortConfig({ column: null, direction: null });
    setHiddenColumns(new Set());
  };

  const handleFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) {
      reset();
      return;
    }
    if (f.size > LARGE_FILE_WARN_BYTES) {
      toast.info("Processing large file locally...");
    }
    setRawFiles(files);
    setFile(f);
    setStatus("parsing");
    setErrorMsg(null);

    try {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (ext === ".csv") {
        Papa.parse<Record<string, string>>(f, {
          header: true,
          skipEmptyLines: "greedy",
          worker: true,
          complete: (res) => {
            const h = res.meta.fields ?? [];
            if (h.length === 0) {
              setStatus("error");
              setErrorMsg("No valid columns detected in this CSV.");
              return;
            }
            const r: Row[] = (res.data as Record<string, string>[]).map((rowObj) => {
              const row: Row = {};
              for (const header of h) {
                const val = rowObj[header];
                row[header] = val === undefined || val === "" ? null : val;
              }
              return row;
            });
            applyParsedData(h, r);
          },
          error: (err) => {
            setStatus("error");
            setErrorMsg(err.message);
          },
        });
      } else if (ext === ".xlsx" || ext === ".xls") {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        if (wb.SheetNames.length === 0) throw new Error("Workbook has no sheets.");
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        const firstSheet = wb.SheetNames[0];
        setSelectedSheet(firstSheet);

        const ws = wb.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json<Record<string, CellValue>>(ws, { defval: null, raw: true });
        const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
        const h: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
          h.push(cell ? String(cell.v) : `Column ${c - range.s.c + 1}`);
        }
        const r: Row[] = json.map((item) => {
          const row: Row = {};
          for (const header of h) row[header] = item[header] ?? null;
          return row;
        });
        applyParsedData(h, r);
      } else {
        throw new Error("Please upload a .csv, .xlsx, or .xls file.");
      }
    } catch (e) {
      setStatus("error");
      const msg = e instanceof Error ? e.message : "Error reading file.";
      setErrorMsg(msg);
      toast.error(msg);
    }
  };

  const handleSheetChange = (sheet: string) => {
    if (!workbook || sheet === selectedSheet) return;
    setSelectedSheet(sheet);
    setStatus("parsing");
    try {
      const ws = workbook.Sheets[sheet];
      const json = XLSX.utils.sheet_to_json<Record<string, CellValue>>(ws, { defval: null, raw: true });
      const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
      const h: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
        h.push(cell ? String(cell.v) : `Column ${c - range.s.c + 1}`);
      }
      const r: Row[] = json.map((item) => {
        const row: Row = {};
        for (const header of h) row[header] = item[header] ?? null;
        return row;
      });
      applyParsedData(h, r);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Could not load sheet.");
    }
  };

  // Derived Column Info & Duplicate Hash
  const columnInfo = useMemo<ColumnInfo[]>(() => {
    const base = buildColumnInfo(headers, rows);
    return base.map((c) => (typeOverrides.has(c.name) ? { ...c, type: typeOverrides.get(c.name)! } : c));
  }, [headers, rows, typeOverrides]);

  const columnTypeMap = useMemo(() => new Map(columnInfo.map((c) => [c.name, c.type])), [columnInfo]);

  const { duplicateRowKeys, redundantCount } = useMemo(() => {
    const seen = new Set<string>();
    const dupKeys = new Set<string>();
    let redundant = 0;
    for (const r of rows) {
      const k = rowKey(r, headers);
      if (seen.has(k)) {
        dupKeys.add(k);
        redundant++;
      } else {
        seen.add(k);
      }
    }
    return { duplicateRowKeys: dupKeys, redundantCount: redundant };
  }, [rows, headers]);

  const dashboardStats = useMemo(() => {
    const totalRows = rows.length;
    const totalColumns = headers.length;
    const missingValues = columnInfo.reduce((s, c) => s + c.missing, 0);
    const totalUnique = columnInfo.reduce((s, c) => s + c.unique, 0);
    const numericColumns = columnInfo.filter((c) => c.type === "number").length;
    const textColumns = columnInfo.filter((c) => c.type === "text").length;
    const dateColumns = columnInfo.filter((c) => c.type === "date").length;
    const emptyColumns = columnInfo.filter((c) => c.type === "empty").length;
    const totalCells = totalRows * totalColumns;
    const completeness = totalCells === 0 ? 100 : Math.round(((totalCells - missingValues) / totalCells) * 100);

    return {
      totalRows,
      totalColumns,
      missingValues,
      duplicateRows: redundantCount,
      totalUnique,
      numericColumns,
      textColumns,
      dateColumns,
      emptyColumns,
      completeness,
    };
  }, [rows, headers, columnInfo, redundantCount]);

  const columnStats = useMemo(() => {
    const map = new Map<string, { numeric?: NumericStats; text?: TextStats; date?: DateStats }>();
    for (const c of columnInfo) {
      const values = rows.map((r) => r[c.name]);
      if (c.type === "number") map.set(c.name, { numeric: computeNumericStats(values) ?? undefined });
      else if (c.type === "date") map.set(c.name, { date: computeDateStats(values) ?? undefined });
      else if (c.type === "text") map.set(c.name, { text: computeTextStats(values, rows.length) });
    }
    return map;
  }, [rows, columnInfo]);

  // Modular Insights
  const structuredInsights = useMemo<FormattedInsight[]>(() => {
    const list: FormattedInsight[] = [];
    const numericCols = columnInfo.filter((c) => c.type === "number");
    const textCols = columnInfo.filter((c) => c.type === "text");
    const dateCols = columnInfo.filter((c) => c.type === "date");

    if (redundantCount > 0) {
      list.push({
        id: "health-dupes",
        category: "health",
        title: "Duplicate Records Found",
        description: `There are ${redundantCount} identical duplicate rows. You can prune these to keep the counts clean.`,
        metric: `${redundantCount} rows`,
        action: { label: "Clean in Clean Tab", tab: "clean" },
      });
    }

    for (const c of columnInfo) {
      if (c.missing > 0) {
        const pct = Math.round((c.missing / rows.length) * 100);
        if (pct >= 10) {
          list.push({
            id: `health-missing-${c.name}`,
            category: "health",
            title: `High Missing Data in "${c.name}"`,
            description: `${c.missing} cells (${pct}% of the column) are blank. Consider filling with mean/mode or dropping empty rows.`,
            metric: `${c.missing} blanks`,
            action: { label: "Fix Values", tab: "clean" },
          });
        }
      }
    }

    for (const c of numericCols) {
      const stats = columnStats.get(c.name)?.numeric;
      if (!stats) continue;
      if (stats.range > 0) {
        list.push({
          id: `peaks-${c.name}`,
          category: "peaks",
          title: `Peak & Spread for "${c.name}"`,
          description: `Highest value reaches ${formatNum(stats.max)} while lowest is ${formatNum(stats.min)}. Half of all entries sit below the median of ${formatNum(stats.median)}.`,
          metric: `Max ${formatNum(stats.max)}`,
          subMetric: `Median: ${formatNum(stats.median)}`,
        });
      }
    }

    for (const c of textCols) {
      const stats = columnStats.get(c.name)?.text;
      if (!stats || stats.top.length === 0) continue;
      const top = stats.top[0];
      if (top.pct >= 25 && stats.unique > 1) {
        list.push({
          id: `cat-${c.name}`,
          category: "categories",
          title: `Top Segment in "${c.name}"`,
          description: `"${top.value || "(Blank)"}" leads the column with ${top.count} entries across ${stats.unique} unique categories.`,
          metric: `${top.pct}% share`,
          subMetric: `${top.count} entries`,
        });
      }
    }

    for (const c of dateCols) {
      const stats = columnStats.get(c.name)?.date;
      if (!stats) continue;
      list.push({
        id: `timeline-${c.name}`,
        category: "timeline",
        title: `Active Timeline ("${c.name}")`,
        description: `Data points span ${stats.rangeDays} calendar days from ${formatDate(stats.earliest)} to ${formatDate(stats.latest)}.`,
        metric: `${stats.rangeDays} Days`,
      });
    }

    return list;
  }, [columnInfo, columnStats, rows, redundantCount]);

  const filteredInsights = useMemo(() => {
    if (activeInsightFilter === "all") return structuredInsights;
    return structuredInsights.filter((item) => item.category === activeInsightFilter);
  }, [structuredInsights, activeInsightFilter]);

  // Filtering & Sorting
  const filteredRows = useMemo(() => {
    let result = rows;
    if (filters.length > 0) {
      result = result.filter((row) =>
        filters.every((f) => matchesFilter(row[f.column], f, columnTypeMap.get(f.column) ?? "text"))
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((row) =>
        headers.some((h) => !isEmptyValue(row[h]) && String(row[h]).toLowerCase().includes(q))
      );
    }
    return result;
  }, [rows, filters, search, headers, columnTypeMap]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.column || !sortConfig.direction) return filteredRows;
    const col = sortConfig.column;
    const type = columnTypeMap.get(col) ?? "text";
    const dir = sortConfig.direction === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      const aEmpty = isEmptyValue(av);
      const bEmpty = isEmptyValue(bv);
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (type === "number") return ((toNumber(av) ?? 0) - (toNumber(bv) ?? 0)) * dir;
      if (type === "date") return ((toDate(av)?.getTime() ?? 0) - (toDate(bv)?.getTime() ?? 0)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredRows, sortConfig, columnTypeMap]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const visibleHeaders = useMemo(() => headers.filter((h) => !hiddenColumns.has(h)), [headers, hiddenColumns]);

  const toggleSort = (col: string) => {
    setSortConfig((prev) => {
      if (prev.column !== col) return { column: col, direction: "asc" };
      if (prev.direction === "asc") return { column: col, direction: "desc" };
      return { column: null, direction: null };
    });
  };

  const addFilter = () => {
    const firstCol = headers[0];
    if (!firstCol) return;
    setFilters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), column: firstCol, operator: "contains", value: "", value2: "" },
    ]);
    setShowFilterPanel(true);
  };

  const updateFilter = (id: string, patch: Partial<FilterRule>) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  // Resize column handling
  const handleResizeMove = (e: MouseEvent) => {
    const r = resizingRef.current;
    if (!r) return;
    const delta = e.clientX - r.startX;
    const next = Math.max(75, r.startWidth + delta);
    setColumnWidths((prev) => new Map(prev).set(r.col, next));
  };

  const stopResize = () => {
    resizingRef.current = null;
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", stopResize);
  };

  const startResize = (col: string, e: React.MouseEvent) => {
    const startWidth = columnWidths.get(col) ?? 150;
    resizingRef.current = { col, startX: e.clientX, startWidth };
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", stopResize);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  // Data Cleaning Handlers
  const removeDuplicateRows = () => {
    const seen = new Set<string>();
    const cleaned: Row[] = [];
    for (const row of rows) {
      const key = rowKey(row, headers);
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(row);
      }
    }
    const removedCount = rows.length - cleaned.length;
    setRows(cleaned);
    setPage(1);
    toast.success(`Removed ${removedCount} duplicate row${removedCount === 1 ? "" : "s"}`);
  };

  const removeEmptyRows = () => {
    const cleaned = rows.filter((row) => headers.some((h) => !isEmptyValue(row[h])));
    const removedCount = rows.length - cleaned.length;
    setRows(cleaned);
    setPage(1);
    toast.success(`Removed ${removedCount} blank row${removedCount === 1 ? "" : "s"}`);
  };

  const removeEmptyColumnsAction = () => {
    const emptyCols = columnInfo.filter((c) => c.type === "empty").map((c) => c.name);
    if (emptyCols.length === 0) {
      toast.info("No empty columns found");
      return;
    }
    setHeaders((prev) => prev.filter((h) => !emptyCols.includes(h)));
    setRows((prev) =>
      prev.map((row) => {
        const next = { ...row };
        emptyCols.forEach((c) => delete next[c]);
        return next;
      })
    );
    toast.success(`Removed ${emptyCols.length} empty column${emptyCols.length === 1 ? "" : "s"}`);
  };

  const trimWhitespaceAction = () => {
    setRows((prev) =>
      prev.map((row) => {
        const updated: Row = { ...row };
        for (const h of headers) {
          const v = updated[h];
          if (typeof v === "string") updated[h] = v.trim();
        }
        return updated;
      })
    );
    toast.success("Whitespace trimmed from all text fields");
  };

  const fillMissing = (col: string, strategy: "zero" | "mean" | "mode") => {
    const type = columnTypeMap.get(col) ?? "text";
    let fillVal: CellValue = "";
    if (strategy === "zero") fillVal = 0;
    else if (strategy === "mean" && type === "number") fillVal = columnStats.get(col)?.numeric?.avg ?? 0;
    else if (strategy === "mode") fillVal = columnStats.get(col)?.text?.top[0]?.value ?? "";

    setRows((prev) =>
      prev.map((r) => (isEmptyValue(r[col]) ? { ...r, [col]: fillVal } : r))
    );
    toast.success(`Filled missing cells in "${col}"`);
  };

  const dropRowsWithMissing = (col: string) => {
    const initialCount = rows.length;
    const cleaned = rows.filter((r) => !isEmptyValue(r[col]));
    setRows(cleaned);
    setPage(1);
    toast.success(`Removed ${initialCount - cleaned.length} rows missing "${col}"`);
  };

  // True Native Styled OpenXML XLSX Export (Full Colors + Zero Warning Banner)
  const handleExportExplorerData = () => {
    if (highlightIssues) {
      const wb = XLSX.utils.book_new();
      const sheetData: (string | number | boolean | null)[][] = [visibleHeaders];

      for (const row of sortedRows) {
        const rowCells = visibleHeaders.map((h) => {
          const val = row[h];
          if (isEmptyValue(val)) return "(Empty)";
          if (val instanceof Date) return formatDate(val);
          return val;
        });
        sheetData.push(rowCells);
      }

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Apply cell background colors directly into OpenXML styles
      // Header styling
      for (let c = 0; c < visibleHeaders.length; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: "1E293B" } },
            font: { bold: true, color: { rgb: "FFFFFF" } },
            alignment: { vertical: "center" },
          };
        }
      }

      // Row styling: Amber for duplicates, Rose for empty cells
      for (let r = 0; r < sortedRows.length; r++) {
        const row = sortedRows[r];
        const isDup = duplicateRowKeys.has(rowKey(row, headers));

        for (let c = 0; c < visibleHeaders.length; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: r + 1, c });
          if (!ws[cellRef]) continue;

          const val = row[visibleHeaders[c]];
          const empty = isEmptyValue(val);

          if (empty) {
            // Soft Rose with Bold Red text
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "FFE4E6" } },
              font: { bold: true, color: { rgb: "BE123C" } },
            };
          } else if (isDup) {
            // Soft Amber for duplicate rows
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "FEF3C7" } },
            };
          }
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, "Highlighted_Data");

      const excelBytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(blob, "highlighted-dataset.xlsx");
      toast.success("Downloaded styled Excel table with highlights");
    } else {
      const csv = rowsToCsv(visibleHeaders, sortedRows);
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "filtered-dataset.csv");
      toast.success("Filtered CSV downloaded");
    }
    showSupportPrompt();
  };

  const exportCleaned = () => {
    const csv = rowsToCsv(headers, rows);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "cleaned-dataset.csv");
    toast.success("Cleaned CSV downloaded");
    showSupportPrompt();
  };

  const exportSummary = () => {
    const lines: string[] = [
      "Dataset Analysis Summary",
      `File,${file?.name ?? "dataset"}`,
      `Total Rows,${dashboardStats.totalRows}`,
      `Total Columns,${dashboardStats.totalColumns}`,
      `Completeness,${dashboardStats.completeness}%`,
      "",
      "Column,Type,Missing,Unique",
      ...columnInfo.map((c) => `"${c.name}",${c.type},${c.missing},${c.unique}`),
      "",
      "Key Observations",
      ...structuredInsights.map((ins) => `"${ins.title} - ${ins.description.replace(/"/g, '""')}"`),
    ];
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "dataset-summary.csv");
    toast.success("Analysis summary downloaded");
  };

  const exportChartImage = async () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("Chart preview not available");
      return;
    }
    try {
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 380;
      const svgStr = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();

      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej();
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;
        downloadBlob(blob, "data-chart.png");
        toast.success("Chart exported as PNG");
      }, "image/png");
    } catch {
      toast.error("Could not export chart image");
    }
  };

  // Chart setup
  const numericColumns = useMemo(() => columnInfo.filter((c) => c.type === "number").map((c) => c.name), [columnInfo]);
  const textColumns = useMemo(() => columnInfo.filter((c) => c.type === "text").map((c) => c.name), [columnInfo]);
  const dateColumns = useMemo(() => columnInfo.filter((c) => c.type === "date").map((c) => c.name), [columnInfo]);
  const categoricalColumns = useMemo(() => [...textColumns, ...dateColumns], [textColumns, dateColumns]);

  useEffect(() => {
    if (!headers.length) return;
    setChartX((prev) => prev || categoricalColumns[0] || numericColumns[0] || headers[0]);
    setChartY((prev) => prev || numericColumns[0] || "");
  }, [headers, categoricalColumns, numericColumns]);

  const aggregatedChartData = useMemo(() => {
    if (!chartX || (chartType !== "bar" && chartType !== "line" && chartType !== "pie")) return [];
    const groups = new Map<string, number[]>();
    for (const row of sortedRows) {
      const raw = row[chartX];
      const key = isEmptyValue(raw) ? "(Blank)" : raw instanceof Date ? formatDate(raw) : String(raw);
      const arr = groups.get(key) ?? [];
      if (chartAgg === "count") {
        arr.push(1);
      } else {
        const y = chartY ? toNumber(row[chartY]) : null;
        if (y !== null) arr.push(y);
      }
      groups.set(key, arr);
    }
    const entries = [...groups.entries()].map(([name, vals]) => {
      let value = 0;
      if (chartAgg === "count") value = vals.length;
      else if (chartAgg === "sum") value = vals.reduce((a, b) => a + b, 0);
      else value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { name, value };
    });
    entries.sort((a, b) => b.value - a.value);
    return entries.slice(0, MAX_CHART_CATEGORIES);
  }, [sortedRows, chartX, chartY, chartAgg, chartType]);

  const scatterData = useMemo(() => {
    if (chartType !== "scatter" || !chartX || !chartY) return [];
    return sortedRows
      .map((r) => ({ x: toNumber(r[chartX]), y: toNumber(r[chartY]) }))
      .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null)
      .slice(0, MAX_SCATTER_POINTS);
  }, [sortedRows, chartX, chartY, chartType]);

  const histogramData = useMemo(() => {
    if (chartType !== "histogram" || !chartX) return [];
    const values = sortedRows.map((r) => toNumber(r[chartX])).filter((n): n is number => n !== null);
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bins = Math.max(2, histBins);
    const step = (max - min) / bins || 1;
    const buckets = Array.from({ length: bins }, (_, i) => ({
      name: `${formatNum(min + i * step)} - ${formatNum(min + (i + 1) * step)}`,
      value: 0,
    }));
    for (const v of values) {
      let idx = Math.floor((v - min) / step);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      buckets[idx].value++;
    }
    return buckets;
  }, [sortedRows, chartX, histBins, chartType]);

  const displayedStatsColumns = useMemo(() => {
    return columnInfo.filter((c) => {
      if (statsTypeFilter !== "all" && c.type !== statsTypeFilter) return false;
      if (statsSearch.trim() && !c.name.toLowerCase().includes(statsSearch.trim().toLowerCase())) return false;
      return true;
    });
  }, [columnInfo, statsTypeFilter, statsSearch]);

  const missingColumns = columnInfo.filter((c) => c.missing > 0);

  return (
    <div className="w-full space-y-6">
      <FileDrop
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        multiple={false}
        files={rawFiles}
        onFiles={handleFiles}
        hint="Upload a CSV or Excel file to analyze locally in your browser"
      />

      {status === "parsing" && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background p-8 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <p className="text-sm font-semibold">Reading dataset...</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-foreground bg-background p-6 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          <p className="text-sm font-semibold">{errorMsg ?? "Unable to read dataset."}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-4 py-1 text-xs font-semibold hover:opacity-90"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {file && (status === "ready" || status === "analyzing") && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)} • {dashboardStats.totalRows.toLocaleString()} rows • {dashboardStats.totalColumns} columns
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 self-start sm:self-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      )}

      {sheetNames.length > 1 && status !== "parsing" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Sheets:</span>
          {sheetNames.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSheetChange(s)}
              className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                selectedSheet === s ? "bg-foreground text-background" : "bg-background hover:opacity-90"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {status === "ready" && (
        <>
          {/* Navigation Tabs */}
          <div className="flex gap-2 overflow-x-auto border-b-2 border-foreground pb-2">
            {(
              [
                { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                { id: "explorer", label: "Data Explorer", icon: Table2 },
                { id: "statistics", label: "Statistics", icon: Hash },
                { id: "insights", label: "Insights", icon: Lightbulb },
                { id: "charts", label: "Visuals", icon: BarChart3 },
                { id: "clean", label: "Clean Data", icon: Wand2 },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === id ? "bg-foreground text-background" : "bg-background hover:opacity-90"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* TAB 1: Dashboard */}
          {activeTab === "dashboard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="flex flex-col gap-1 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">Rows</span>
                  <span className="text-xl font-black">{dashboardStats.totalRows.toLocaleString()}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">Columns</span>
                  <span className="text-xl font-black">{dashboardStats.totalColumns}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">Missing Cells</span>
                  <span className={`text-xl font-black ${dashboardStats.missingValues > 0 ? "text-rose-600" : ""}`}>
                    {dashboardStats.missingValues.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">Duplicate Rows</span>
                  <span className={`text-xl font-black ${dashboardStats.duplicateRows > 0 ? "text-amber-600" : ""}`}>
                    {dashboardStats.duplicateRows.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">Quality Score</span>
                  <span className="text-xl font-black">{dashboardStats.completeness}%</span>
                </div>
              </div>

              <div className="rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
                <p className="mb-3 text-sm font-bold">Column Type Directory</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {columnInfo.map((c) => (
                    <div key={c.name} className="flex items-center justify-between rounded-lg border-2 border-foreground px-3 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        {c.type === "number" ? <Hash className="h-3.5 w-3.5 shrink-0" /> : c.type === "date" ? <CalendarDays className="h-3.5 w-3.5 shrink-0" /> : <TypeIcon className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate font-semibold" title={c.name}>{c.name}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {c.missing > 0 ? `${c.missing} blank` : `${c.unique} unique`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Explorer with Colors and Zero Warning */}
          {activeTab === "explorer" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search visible data..."
                    className="w-full rounded-xl border-2 border-foreground bg-background py-1.5 pl-8 pr-3 text-xs focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilterPanel((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold ${
                    showFilterPanel ? "bg-foreground text-background" : "bg-background hover:opacity-90"
                  }`}
                >
                  <FilterIcon className="h-3.5 w-3.5" /> Filter {filters.length > 0 && `(${filters.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowColumnMenu((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold ${
                    showColumnMenu ? "bg-foreground text-background" : "bg-background hover:opacity-90"
                  }`}
                >
                  <ListFilter className="h-3.5 w-3.5" /> Columns
                </button>
                <label className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${highlightIssues ? "bg-amber-100/80" : "bg-background"}`}>
                  <input
                    type="checkbox"
                    checked={highlightIssues}
                    onChange={(e) => setHighlightIssues(e.target.checked)}
                    className="h-3.5 w-3.5 accent-foreground"
                  />
                  Highlight dupes / blanks
                </label>
                <button
                  type="button"
                  onClick={handleExportExplorerData}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground text-background px-3.5 py-1.5 text-xs font-semibold hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" /> {highlightIssues ? "Export Highlighted Table" : "Export CSV"}
                </button>
              </div>

              {showColumnMenu && (
                <div className="flex flex-wrap gap-2 rounded-xl border-2 border-foreground bg-background p-3 text-xs">
                  {headers.map((h) => (
                    <label key={h} className="inline-flex items-center gap-1.5 rounded-full border border-foreground px-2.5 py-1">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(h)}
                        onChange={() => {
                          setHiddenColumns((prev) => {
                            const next = new Set(prev);
                            if (next.has(h)) next.delete(h);
                            else next.add(h);
                            return next;
                          });
                        }}
                        className="h-3 w-3 accent-foreground"
                      />
                      {h}
                    </label>
                  ))}
                </div>
              )}

              {showFilterPanel && (
                <div className="space-y-2 rounded-xl border-2 border-foreground bg-background p-3">
                  {filters.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <select
                        value={f.column}
                        onChange={(e) => updateFilter(f.id, { column: e.target.value })}
                        className="rounded-lg border-2 border-foreground bg-background px-2 py-1 font-semibold"
                      >
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.operator}
                        onChange={(e) => updateFilter(f.id, { operator: e.target.value as FilterOperator })}
                        className="rounded-lg border-2 border-foreground bg-background px-2 py-1 font-semibold"
                      >
                        <option value="contains">Contains</option>
                        <option value="equals">Equals</option>
                        <option value="notEquals">Not equal</option>
                        <option value="gt">Greater than</option>
                        <option value="lt">Less than</option>
                        <option value="between">Between</option>
                        <option value="empty">Is Empty</option>
                        <option value="notEmpty">Not Empty</option>
                      </select>
                      {!["empty", "notEmpty"].includes(f.operator) && (
                        <input
                          value={f.value}
                          onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                          placeholder="Value"
                          className="w-28 rounded-lg border-2 border-foreground bg-background px-2 py-1"
                        />
                      )}
                      {f.operator === "between" && (
                        <input
                          value={f.value2}
                          onChange={(e) => updateFilter(f.id, { value2: e.target.value })}
                          placeholder="And..."
                          className="w-28 rounded-lg border-2 border-foreground bg-background px-2 py-1"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFilter(f.id)}
                        className="ml-auto rounded-full border border-foreground p-1 hover:opacity-80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addFilter}
                    className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-foreground px-3 py-1 text-xs font-semibold hover:opacity-90"
                  >
                    <Plus className="h-3 w-3" /> Add Condition
                  </button>
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border-2 border-foreground" style={{ maxHeight: 480 }}>
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-foreground text-background">
                    <tr>
                      {visibleHeaders.map((h) => (
                        <th
                          key={h}
                          style={{ width: columnWidths.get(h) ?? 150, minWidth: columnWidths.get(h) ?? 150 }}
                          className="relative select-none border-r border-background/20 px-3 py-2 text-left font-bold"
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(h)}
                            className="inline-flex max-w-full items-center gap-1 truncate"
                          >
                            <span className="truncate">{h}</span>
                            {sortConfig.column === h ? (
                              sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                          <span
                            onMouseDown={(e) => startResize(h, e)}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-background/40"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, i) => {
                      const isDup = highlightIssues && duplicateRowKeys.has(rowKey(row, headers));

                      return (
                        <tr
                          key={i}
                          className={`border-t border-foreground/10 transition-colors ${
                            isDup
                              ? "bg-amber-100/90 font-medium border-l-4 border-l-amber-600 shadow-[inset_0_0_0_1px_rgba(217,119,6,0.3)]"
                              : i % 2 === 1
                              ? "bg-muted/30"
                              : ""
                          }`}
                        >
                          {visibleHeaders.map((h) => {
                            const v = row[h];
                            const empty = isEmptyValue(v);
                            return (
                              <td
                                key={h}
                                style={{ width: columnWidths.get(h) ?? 150, minWidth: columnWidths.get(h) ?? 150 }}
                                className={`truncate border-r border-foreground/10 px-3 py-1.5 ${
                                  highlightIssues && empty
                                    ? "bg-rose-100/90 text-rose-700 font-bold italic shadow-[inset_0_0_0_1px_rgba(225,29,72,0.3)]"
                                    : ""
                                }`}
                              >
                                {empty ? (
                                  highlightIssues ? (
                                    <span className="inline-block rounded bg-rose-200/80 px-1.5 py-0.5 text-[10px] uppercase font-bold text-rose-800">
                                      (Empty)
                                    </span>
                                  ) : (
                                    "—"
                                  )
                                ) : v instanceof Date ? (
                                  rawView ? (
                                    v.toISOString()
                                  ) : (
                                    formatDate(v)
                                  )
                                ) : (
                                  String(v)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {pagedRows.length === 0 && (
                      <tr>
                        <td colSpan={visibleHeaders.length || 1} className="p-8 text-center text-muted-foreground">
                          No matching records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <span>
                  Showing {sortedRows.length.toLocaleString()} row{sortedRows.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border-2 border-foreground bg-background px-2 py-1"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={page <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground disabled:opacity-30"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1">
                    {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground disabled:opacity-30"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Statistics */}
          {activeTab === "statistics" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-full border-2 border-foreground p-0.5 text-xs font-semibold">
                  {(["all", "number", "text", "date"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStatsTypeFilter(t)}
                      className={`rounded-full px-3 py-1 capitalize transition-colors ${
                        statsTypeFilter === t ? "bg-foreground text-background" : "hover:opacity-80"
                      }`}
                    >
                      {t === "all" ? "All Columns" : t === "number" ? "Numbers" : t === "text" ? "Categories" : "Dates"}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-[200px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={statsSearch}
                    onChange={(e) => setStatsSearch(e.target.value)}
                    placeholder="Find column metrics..."
                    className="w-full rounded-full border-2 border-foreground bg-background py-1 pl-8 pr-3 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {displayedStatsColumns.map((c) => {
                  const stats = columnStats.get(c.name);
                  return (
                    <div
                      key={c.name}
                      className="flex flex-col justify-between rounded-xl border-2 border-foreground bg-background p-3.5 shadow-[3px_3px_0_0_var(--color-foreground)]"
                    >
                      <div>
                        <div className="mb-2.5 flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {c.type === "number" ? <Hash className="h-3.5 w-3.5 shrink-0" /> : c.type === "date" ? <CalendarDays className="h-3.5 w-3.5 shrink-0" /> : <TypeIcon className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate text-xs font-bold" title={c.name}>
                              {c.name}
                            </span>
                          </div>
                          <span className="rounded-full border border-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            {c.type}
                          </span>
                        </div>

                        {c.type === "number" && stats?.numeric && (
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            <div className="rounded border border-foreground/30 p-1.5">
                              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Min / Max</span>
                              <span className="font-bold">{formatNum(stats.numeric.min)} → {formatNum(stats.numeric.max)}</span>
                            </div>
                            <div className="rounded border border-foreground/30 p-1.5">
                              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Average</span>
                              <span className="font-bold">{formatNum(stats.numeric.avg)}</span>
                            </div>
                            <div className="rounded border border-foreground/30 p-1.5">
                              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Median</span>
                              <span className="font-bold">{formatNum(stats.numeric.median)}</span>
                            </div>
                            <div className="rounded border border-foreground/30 p-1.5">
                              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Total Sum</span>
                              <span className="font-bold">{formatNum(stats.numeric.sum)}</span>
                            </div>
                          </div>
                        )}

                        {c.type === "date" && stats?.date && (
                          <div className="space-y-1.5 text-xs">
                            <div className="rounded border border-foreground/30 p-1.5">
                              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Span</span>
                              <span className="font-bold">{stats.date.rangeDays} Days ({formatDate(stats.date.earliest)} to {formatDate(stats.date.latest)})</span>
                            </div>
                          </div>
                        )}

                        {c.type === "text" && stats?.text && (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold mb-1">
                              <span>Top Frequencies</span>
                              <span>{stats.text.unique.toLocaleString()} distinct</span>
                            </div>
                            {stats.text.top.map((t) => (
                              <div key={t.value} className="space-y-0.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="truncate max-w-[140px] font-medium" title={t.value}>{t.value || "(Blank)"}</span>
                                  <span className="text-muted-foreground">{t.count} ({t.pct}%)</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-foreground" style={{ width: `${t.pct}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {c.type === "empty" && (
                          <p className="text-xs text-muted-foreground italic">Entire column is empty.</p>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-foreground/10 pt-2 text-[11px] text-muted-foreground">
                        <span>{rows.length - c.missing} populated</span>
                        <span>{c.missing > 0 ? `${c.missing} blank (${Math.round((c.missing / rows.length) * 100)}%)` : "100% complete"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: Interactive Insights */}
          {activeTab === "insights" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-foreground/10 pb-3">
                {(
                  [
                    { id: "all", label: "All Insights", count: structuredInsights.length },
                    { id: "health", label: "Data Quality & Health", count: structuredInsights.filter((i) => i.category === "health").length },
                    { id: "peaks", label: "Peaks & Milestones", count: structuredInsights.filter((i) => i.category === "peaks").length },
                    { id: "categories", label: "Dominant Segments", count: structuredInsights.filter((i) => i.category === "categories").length },
                    { id: "timeline", label: "Timeline", count: structuredInsights.filter((i) => i.category === "timeline").length },
                  ] as const
                ).map(({ id, label, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveInsightFilter(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold transition-colors ${
                      activeInsightFilter === id ? "bg-foreground text-background" : "bg-background hover:opacity-80"
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeInsightFilter === id ? "bg-background text-foreground" : "bg-muted"}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredInsights.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {item.category === "health" ? (
                            <ShieldAlert className="h-4 w-4 text-rose-600" />
                          ) : item.category === "peaks" ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : item.category === "categories" ? (
                            <Layers className="h-4 w-4 text-blue-600" />
                          ) : (
                            <CalendarDays className="h-4 w-4 text-indigo-600" />
                          )}
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            {item.category}
                          </span>
                        </div>
                        {item.metric && (
                          <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">
                            {item.metric}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold leading-snug">{item.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-foreground/10 pt-3">
                      <span className="text-[11px] font-semibold text-muted-foreground">{item.subMetric ?? ""}</span>
                      {item.action && (
                        <button
                          type="button"
                          onClick={() => setActiveTab(item.action!.tab)}
                          className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
                        >
                          {item.action.label} <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {filteredInsights.length === 0 && (
                  <div className="col-span-full rounded-xl border-2 border-foreground bg-background p-8 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
                    <Sparkles className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-semibold">No insights found in this section.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Charts */}
          {activeTab === "charts" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-full border-2 border-foreground p-0.5">
                  {(
                    [
                      { t: "bar" as ChartType, Icon: BarChart3 },
                      { t: "line" as ChartType, Icon: LineChartIcon },
                      { t: "pie" as ChartType, Icon: PieChartIcon },
                      { t: "scatter" as ChartType, Icon: ScatterChartIcon },
                      { t: "histogram" as ChartType, Icon: Layers },
                    ] as const
                  ).map(({ t, Icon }) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setChartType(t)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                        chartType === t ? "bg-foreground text-background" : "hover:opacity-80"
                      }`}
                    >
                      <Icon className="h-3 w-3" /> {t}
                    </button>
                  ))}
                </div>

                <select
                  value={chartX}
                  onChange={(e) => setChartX(e.target.value)}
                  className="rounded-lg border-2 border-foreground bg-background px-2 py-1 text-xs font-semibold"
                >
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      X: {h}
                    </option>
                  ))}
                </select>

                {chartType !== "histogram" && chartType !== "pie" && (
                  <select
                    value={chartY}
                    onChange={(e) => setChartY(e.target.value)}
                    className="rounded-lg border-2 border-foreground bg-background px-2 py-1 text-xs font-semibold"
                  >
                    <option value="">Count</option>
                    {numericColumns.map((h) => (
                      <option key={h} value={h}>
                        Y: {h}
                      </option>
                    ))}
                  </select>
                )}

                {["bar", "line", "pie"].includes(chartType) && (
                  <select
                    value={chartAgg}
                    onChange={(e) => setChartAgg(e.target.value as Aggregation)}
                    className="rounded-lg border-2 border-foreground bg-background px-2 py-1 text-xs font-semibold"
                  >
                    <option value="sum">Sum</option>
                    <option value="avg">Average</option>
                    <option value="count">Count</option>
                  </select>
                )}

                <button
                  type="button"
                  onClick={exportChartImage}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" /> PNG
                </button>
              </div>

              <div
                ref={chartRef}
                className="rounded-xl border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
                style={{ height: 360 }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "bar" ? (
                    <BarChart data={aggregatedChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : chartType === "line" ? (
                    <LineChart data={aggregatedChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                    </LineChart>
                  ) : chartType === "pie" ? (
                    <PieChart>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Pie data={aggregatedChartData} dataKey="value" nameKey="name" outerRadius={110}>
                        {aggregatedChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  ) : chartType === "scatter" ? (
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="x" name={chartX} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="y" name={chartY} tick={{ fontSize: 11 }} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={scatterData} fill={CHART_COLORS[0]} />
                    </ScatterChart>
                  ) : (
                    <BarChart data={histogramData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 6: Data Cleaning */}
          {activeTab === "clean" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <div>
                    <p className="text-xs font-bold">Prune Duplicates</p>
                    <p className="text-[11px] text-muted-foreground">{redundantCount} redundant rows found</p>
                  </div>
                  <button
                    type="button"
                    onClick={removeDuplicateRows}
                    disabled={redundantCount === 0}
                    className="rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold disabled:opacity-40 hover:opacity-90"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <div>
                    <p className="text-xs font-bold">Remove Empty Rows</p>
                    <p className="text-[11px] text-muted-foreground">Drops rows where every cell is blank</p>
                  </div>
                  <button
                    type="button"
                    onClick={removeEmptyRows}
                    className="rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold hover:opacity-90"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <div>
                    <p className="text-xs font-bold">Remove Empty Columns</p>
                    <p className="text-[11px] text-muted-foreground">{dashboardStats.emptyColumns} completely empty columns</p>
                  </div>
                  <button
                    type="button"
                    onClick={removeEmptyColumnsAction}
                    disabled={dashboardStats.emptyColumns === 0}
                    className="rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold disabled:opacity-40 hover:opacity-90"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <div>
                    <p className="text-xs font-bold">Trim Whitespace</p>
                    <p className="text-[11px] text-muted-foreground">Strips stray leading/trailing spaces</p>
                  </div>
                  <button
                    type="button"
                    onClick={trimWhitespaceAction}
                    className="rounded-full border-2 border-foreground px-3 py-1 text-xs font-semibold hover:opacity-90"
                  >
                    Trim
                  </button>
                </div>
              </div>

              {missingColumns.length > 0 && (
                <div className="rounded-xl border-2 border-foreground bg-background p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <p className="mb-2 text-xs font-bold">Handle Missing Column Values</p>
                  <div className="space-y-2">
                    {missingColumns.map((c) => (
                      <div key={c.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground p-2 text-xs">
                        <div>
                          <span className="font-semibold">{c.name}</span>
                          <span className="ml-2 text-muted-foreground">({c.missing} blanks)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {c.type === "number" && (
                            <button
                              type="button"
                              onClick={() => fillMissing(c.name, "mean")}
                              className="rounded-full border border-foreground px-2 py-0.5 font-medium hover:opacity-80"
                            >
                              Fill with Mean
                            </button>
                          )}
                          {c.type === "text" && (
                            <button
                              type="button"
                              onClick={() => fillMissing(c.name, "mode")}
                              className="rounded-full border border-foreground px-2 py-0.5 font-medium hover:opacity-80"
                            >
                              Fill with Mode
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => fillMissing(c.name, "zero")}
                            className="rounded-full border border-foreground px-2 py-0.5 font-medium hover:opacity-80"
                          >
                            Fill with 0
                          </button>
                          <button
                            type="button"
                            onClick={() => dropRowsWithMissing(c.name)}
                            className="rounded-full border border-foreground px-2 py-0.5 font-medium hover:opacity-80 text-rose-600"
                          >
                            Drop Blank Rows
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={exportCleaned}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground text-background px-4 py-1.5 text-xs font-semibold hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" /> Download Cleaned CSV
                </button>
                <button
                  type="button"
                  onClick={exportSummary}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-4 py-1.5 text-xs font-semibold hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" /> Export Summary
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows(originalRows);
                    setTypeOverrides(new Map());
                    toast.success("Restored original uploaded dataset");
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Revert All
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
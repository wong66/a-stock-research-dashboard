/**
 * AstockPeg page types and helpers.
 */

/* ---------- Types ---------- */

export interface LiveStock {
  ticker: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  peTtm: number;
  pb: number;
  marketCap: number;
  turnover: number;
  pe26e: number;
  cagr: number;
  peg: number;
  digestYears: number;
  sectorKey: string;
}

export interface QuotesData {
  timestamp: string;
  watchlist: LiveStock[];
}

export interface AnalysisRecord {
  id: string;
  ticker: string;
  name: string;
  date: string;
  status: "collecting" | "analyzing" | "completed" | "failed";
  conclusion?: string;
  pegRating?: string;
  error?: string;
  report?: string | null;
}

export interface SectorStock {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  peTtm: number;
  pb: number;
  marketCap: number;
  peg: number | null;
}

export interface SectorData {
  timestamp: string;
  stocks: SectorStock[];
  stats: {
    count: number;
    avgPe: number;
    medianPe: number;
    totalMarketCap: number;
  };
}

export interface NewsItem {
  category: "stock" | "market" | "announcement";
  ticker?: string;
  [key: string]: unknown;
}

export interface NewsData {
  collected_at: string;
  stock_news: NewsItem[];
  market_news: NewsItem[];
  announcements: NewsItem[];
  error?: string;
}

/* ---------- Helpers ---------- */

export function changeColor(v: number): string {
  if (v > 0) return "text-danger";
  if (v < 0) return "text-success";
  return "text-muted-foreground";
}

export function pegColor(peg: number): string {
  if (peg < 1) return "text-success";
  if (peg < 1.5) return "text-warning";
  return "text-danger";
}

export function statusLabel(s: AnalysisRecord["status"]): { text: string; className: string } {
  switch (s) {
    case "collecting": return { text: "数据采集中...", className: "text-warning" };
    case "analyzing": return { text: "AI 分析中...", className: "text-primary" };
    case "completed": return { text: "已完成", className: "text-success" };
    case "failed": return { text: "失败", className: "text-danger" };
  }
}

export function pegRatingBadge(rating?: string): { text: string; className: string } | null {
  if (!rating) return null;
  const r = rating.toLowerCase();
  if (r.includes("低估") || r.includes("undervalued")) return { text: rating, className: "bg-success/10 text-success border-success/30" };
  if (r.includes("合理") || r.includes("fair")) return { text: rating, className: "bg-primary/10 text-primary border-primary/30" };
  if (r.includes("高估") || r.includes("overvalued")) return { text: rating, className: "bg-danger/10 text-danger border-danger/30" };
  return { text: rating, className: "bg-muted text-muted-foreground border-border" };
}

/* ---------- News helpers ---------- */

export function getTitle(item: NewsItem): string {
  return String(item.title ?? item.headline ?? item.name ?? "无标题");
}

export function getTime(item: NewsItem): string {
  return String(item.time ?? item.published_at ?? item.date ?? "");
}

export function getSource(item: NewsItem): string {
  return String(item.source ?? item.media ?? "");
}

export function getUrl(item: NewsItem): string | null {
  return (item.url ?? item.link ?? null) as string | null;
}

export function sortByTime(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => getTime(b).localeCompare(getTime(a)));
}

/* ---------- Sort types (shared across tabs) ---------- */

export type SortField = "name" | "ticker" | "price" | "changePct" | "peTtm" | "pb" | "marketCap" | "peg" | "vsSectorAvg" | null;
export type SortOrder = "asc" | "desc" | null;

/* ---------- API base ---------- */

export const PEG_API = "/peg-api";

/* ---------- Tab types ---------- */

export type TabKey = "dashboard" | "analysis" | "sector" | "news";

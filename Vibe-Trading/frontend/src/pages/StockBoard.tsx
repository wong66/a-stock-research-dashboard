import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  TrendingUp, TrendingDown, RefreshCw, Plus, X, Search, BarChart3,
  AlertCircle, Activity, DollarSign, Calculator,
} from "lucide-react";
import { Skeleton } from "@/components/common/Skeleton";
import { cn } from "@/lib/utils";
import {
  api, type StockQuote, type StockSearchResult,
  type StockFundamentalRow, type StockSegment,
  type StockConsensusResponse, type StockReportItem,
} from "@/lib/api";
import { toast } from "sonner";
import {
  calcGrowth, revenueAndCashSeries, profitAndCashSeries, netCashRatio,
  marginSeries, costMarginSeries, expenseRatioSeries, fiveYearGrowth, nYearGrowth, buildBalanceStructure,
  arToRevenueSeries, apToRevenueSeries, calcValuation, topSegments,
  revenueMcapSeries, pePsSeries,
  num, pct, pctRaw,
  type Quote,
} from "@/lib/stock-analytics";
import {
  RevenueProfitChart, DualAxisChart, DonutChart, ExpenseStackedChart,
  BalanceStructureChart, ArRevenueChart, ApRevenueChart, MarginTrendChart,
  RevenueMcapChart, MultiLineChart, CostMarginChart, CagrBarChart,
  PeTrendChart, PsTrendChart,
} from "@/components/charts/StockDashboardCharts";
import { changeColor, yoyColorClass, fmtPrice } from "@/utils/stockBoard";
import { SectionHeader, MetricCard } from "@/components/stockBoard";

// ── Storage ──────────────────────────────────────────────────────────

const STORAGE_KEY = "vibe_trading_stock_board_watchlist";

interface WatchlistItem { code: string; market: "A" | "US"; addedAt: number; }

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveWatchlist(items: WatchlistItem[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────────
// 辅助函数已提取到 @/utils/stockBoard.ts
// 此处保留原有的 loadWatchlist/saveWatchlist 函数

// ── Search dialog ────────────────────────────────────────────────────

function SearchDialog({
  open, onClose, onAdd, existingCodes,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: WatchlistItem) => void;
  existingCodes: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.searchStocks(q);
      setResults(res.results || []);
    } catch {
      toast.error("搜索失败，请稍后重试");
      setResults([]);
    } finally { setSearching(false); }
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") doSearch();
    if (e.key === "Escape") { setQuery(""); setResults([]); setSearched(false); onClose(); }
  };
  const resetAndClose = () => { setQuery(""); setResults([]); setSearched(false); onClose(); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={resetAndClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">添加个股</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border bg-background focus-within:border-primary transition-colors">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="代码或名称，如 600519 / 茅台 / AAPL"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <button
            onClick={doSearch} disabled={searching || !query.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {searching ? "搜索中…" : "搜索"}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {searching ? (
            <div className="space-y-2 py-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
          ) : searched && results.length === 0 ? (
            <p className="text-sm text-muted-foreground/70 text-center py-6">未找到匹配的股票</p>
          ) : results.map((r) => {
            const exists = existingCodes.has(r.code);
            return (
              <div
                key={`${r.market}:${r.code}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  exists ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60 cursor-pointer",
                )}
                onClick={() => {
                  if (exists) return;
                  onAdd({ code: r.code, market: r.market, addedAt: Date.now() });
                  toast.success(`已添加 ${r.name}（${r.code}）`);
                  resetAndClose();
                }}
              >
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  r.market === "A" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
                )}>{r.market}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{r.code}</p>
                </div>
                {exists ? <span className="text-xs text-muted-foreground">已添加</span> : <Plus className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground/60">支持 A 股代码/名称、美股代码（AAPL、MSFT 等）</p>
      </div>
    </div>
  );
}

// ── Stock row in watchlist ───────────────────────────────────────────

function StockRow({
  item, data, loading, active, onSelect, onRemove,
}: {
  item: WatchlistItem;
  data?: StockQuote;
  loading: boolean;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card">
        <Skeleton className="h-5 w-8 rounded" />
        <Skeleton className="h-4 w-20" />
        <div className="flex-1" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }
  const hasData = data && !data.error;
  const pct = data?.change_pct ?? 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-card hover:shadow-sm transition-all group cursor-pointer min-w-0",
        active ? "border-primary ring-1 ring-primary/40 bg-primary/5" : "hover:border-border/80",
      )}
      onClick={onSelect}
    >
      <span className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 self-start mt-1",
        item.market === "A" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
      )}>{item.market}股</span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-medium truncate leading-tight" title={hasData ? data!.name : item.code}>
          {hasData ? data!.name : item.code}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground leading-tight">{item.code}</span>
      </div>
      {hasData ? (
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <span className="text-sm font-semibold tabular-nums leading-tight">{fmtPrice(data!.price)}</span>
          <span className={cn("text-[11px] font-mono font-semibold tabular-nums leading-tight flex items-center gap-0.5", changeColor(pct))}>
            {pct > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : pct < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : null}
            {pct > 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        </div>
      ) : data?.error ? (
        <span className="text-xs text-danger/70 shrink-0">获取失败</span>
      ) : <span className="text-xs text-muted-foreground shrink-0">—</span>}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="p-1 text-muted-foreground hover:text-danger rounded opacity-0 group-hover:opacity-100 transition-all shrink-0 self-start mt-0.5"
        title="移除"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Stock detail panel (8 sections) ──────────────────────────────────

function StockDetailPanel({
  item, quote,
}: { item: WatchlistItem; quote: StockQuote | null; }) {
  const [periods, setPeriods] = useState<StockFundamentalRow[]>([]);
  const [segments, setSegments] = useState<{
    periods: string[];
    current: string;
    by_industry: StockSegment[];
    by_product: StockSegment[];
    by_region: StockSegment[];
    by_region_series?: { period: string; name: string; value: number }[];
  }>({ periods: [], current: "", by_industry: [], by_product: [], by_region: [] });
  const [segPeriod, setSegPeriod] = useState<string>("");
  const [mcapHistory, setMcapHistory] = useState<{ month: string; close: number; mcap_yi: number }[]>([]);
  const [bsPeriodIdx, setBsPeriodIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"industry" | "product">("product");
  const [consensus, setConsensus] = useState<StockConsensusResponse | null>(null);
  const [reports, setReports] = useState<StockReportItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    setMcapHistory([]); setConsensus(null); setReports([]);
    const price = quote?.price ?? 0;
    Promise.all([
      api.getStockFundamentals(item.code, item.market, segPeriod || undefined)
        .then(res => {
          if (cancelled) return null;
          if (res.error) setErr(res.error);
          setPeriods(res.periods || []);
          const sg = res.segments || { periods: [], current: "", by_industry: [], by_product: [], by_region: [], by_region_series: [] };
          setSegments(sg);
          if (!segPeriod && sg.current) setSegPeriod(sg.current);
          return res;
        })
        .catch(e => { if (!cancelled) setErr(e?.message || "财务数据获取失败"); return null; }),
      api.getStockMcapHistory(item.code, item.market)
        .then(res => {
          if (cancelled) return null;
          console.log("[mcap]", item.code, "months:", res.months?.length, "first:", res.months?.[0]);
          setMcapHistory(res.months || []);
          return res;
        })
        .catch(e => { if (!cancelled) { console.warn("[mcap] failed", item.code, e?.message); setMcapHistory([]); } return null; }),
      api.getStockConsensus(item.code, price)
        .then(res => { if (!cancelled) setConsensus(res); return res; })
        .catch(() => null),
      api.getStockReports(item.code)
        .then(res => { if (!cancelled) setReports(res.reports || []); return res; })
        .catch(() => null),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.code, item.market, segPeriod]);

  // Map StockQuote -> Quote (with mcap 亿)
  const mappedQuote: Quote | null = useMemo(() => {
    if (!quote || quote.error) return null;
    return {
      code: quote.code, name: quote.name, price: quote.price, change_amt: (quote as any).change_amt ?? 0,
      change_pct: quote.change_pct, source: quote.source,
      mcap: (quote as any).mcap, pe_ttm: (quote as any).pe_ttm, pb: (quote as any).pb,
    };
  }, [quote]);

  // 按地区趋势（多期 × 多个地区）→ [{name, data[]}]，x 轴 = periods（升序，旧→新）
  // 注意：必须放在所有早返回之前，否则 loading 状态变化时 hook 数量不一致
  const regionSeries = useMemo(() => {
    const raw = segments.by_region_series || [];
    if (!raw.length) return { periods: [] as string[], series: [] as { name: string; data: (number | null)[] }[] };
    const periodsAsc = Array.from(new Set(raw.map(r => r.period))).sort();
    const totals = new Map<string, number>();
    for (const r of raw) totals.set(r.name, (totals.get(r.name) || 0) + r.value);
    const topNames = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n]) => n);
    const lookup = new Map<string, number>();
    for (const r of raw) lookup.set(`${r.period}|${r.name}`, r.value);
    const series = topNames.map(name => ({
      name,
      data: periodsAsc.map(p => lookup.get(`${p}|${name}`) ?? null),
    }));
    return { periods: periodsAsc, series };
  }, [segments.by_region_series]);

  // ── derived analytics（memoized — 避免每次 render 重算 12+ 函数）──
  const _growth = useMemo(() => periods.length ? calcGrowth(periods, mappedQuote) : ({ ttm: { revenue: 0, net_profit: 0, deducted_profit: 0 }, ttmYoY: {}, reportYoY: {} }) as ReturnType<typeof calcGrowth>, [periods, mappedQuote]);
  const _revCash = useMemo(() => periods.length ? revenueAndCashSeries(periods) : { dates: [] as string[], revenue: [] as number[], salesCash: [] as number[] }, [periods]);
  const _profitCash = useMemo(() => periods.length ? profitAndCashSeries(periods) : { dates: [] as string[], netProfit: [] as number[], deducted: [] as number[], opCash: [] as number[] }, [periods]);
  const _ncRatio = useMemo(() => periods.length ? netCashRatio(periods) : { ratio: null as number | null, ratio2: null as number | null }, [periods]);
  const _margin = useMemo(() => periods.length ? marginSeries(periods) : { dates: [] as string[], gross: [] as number[], net: [] as number[], roe: [] as number[] }, [periods]);
  const _costMargin = useMemo(() => periods.length ? costMarginSeries(periods) : { dates: [] as string[], revenue: [] as (number|null)[], cost: [] as (number|null)[], margin: [] as number[] }, [periods]);
  const _expense = useMemo(() => periods.length ? expenseRatioSeries(periods) : { dates: [] as string[], rd: [] as number[], sell: [] as number[], admin: [] as number[], revenue: [] as number[], rd_amt: [] as number[], sell_amt: [] as number[], admin_amt: [] as number[] }, [periods]);
  const _fiveYr = useMemo(() => periods.length ? fiveYearGrowth(periods, mcapHistory) : { revenue: null as number | null, profit: null as number | null, marketCap: null as number | null, netAsset: null as number | null, profitLabel: "", mcapSource: "" }, [periods, mcapHistory]);
  const _threeYr = useMemo(() => periods.length ? nYearGrowth(periods, 3, mcapHistory) : { revenue: null as number | null, profit: null as number | null, marketCap: null as number | null, netAsset: null as number | null, profitLabel: "", mcapSource: "" }, [periods, mcapHistory]);

  // ── 资产负债表衍生数据 ──
  const _bsPeriods = useMemo(() => (periods || []).filter(p => (p as any).bs_cash != null || (p as any).bs_ar != null), [periods]);
  const _bsCurrent = _bsPeriods[Math.min(bsPeriodIdx, Math.max(0, _bsPeriods.length - 1))];
  const _bsPrev = _bsPeriods[Math.min(bsPeriodIdx + 1, Math.max(0, _bsPeriods.length - 1))];
  const _bs = useMemo(() => buildBalanceStructure(_bsCurrent), [_bsCurrent]);
  const _bsPrev2 = useMemo(() => buildBalanceStructure(_bsPrev), [_bsPrev]);
  const _bsItems = (_bs.items.length ? _bs : _bsPrev2).items;
  const _balanceStructureItems = useMemo(() => _bsItems.map(it => ({ key: it.name, name: it.name, value: it.value, color: it.color, group: it.isDebt ? ("liab" as const) : ("asset" as const) })), [_bsItems]);

  const _arRev = useMemo(() => periods.length ? arToRevenueSeries(periods) : { dates: [] as string[], ar: [] as number[], arRatio: [] as number[], revenue: [] as number[] }, [periods]);
  const _apRev = useMemo(() => periods.length ? apToRevenueSeries(periods) : { dates: [] as string[], ap: [] as number[], apRatio: [] as number[], revenue: [] as number[] }, [periods]);
  const _pePs = useMemo(() => pePsSeries(periods, mcapHistory), [periods, mcapHistory]);
  const _valuation = useMemo(() => periods.length ? calcValuation(periods, mappedQuote, _pePs.psMean, _pePs.psMean != null && _pePs.psStd != null ? _pePs.psMean + _pePs.psStd : null, _pePs.psMean != null && _pePs.psStd != null ? _pePs.psMean - _pePs.psStd : null, consensus?.consensus_pe ?? null, consensus?.eps_current ?? null) : ({ ps: null, pe: null, peDeducted: null, psAvg: null, psHigh: null, psLow: null, profitGrowth3Y: null, peg3Y: null, pegCurrent: null, fairPrice3Y: null, fairPriceCurrent: null, consensusPE: null, consensusEPS: null, fairPE3Y: null, fairPECurrent: null } as ReturnType<typeof calcValuation>), [periods, mappedQuote, _pePs, consensus]);

  // ── astock-peg 估值法（memoized）──
  const _astockPeg = useMemo(() => {
    let eps: number | null = null;
    let analystCount = 0;
    let epsSource = "" as string;

    // 1) 同花顺一致预期 EPS（最优）
    if (consensus?.eps_current && consensus.eps_current > 0) {
      eps = consensus.eps_current;
      analystCount = consensus.analyst_count ?? 0;
      epsSource = "一致预期";
    }
    // 2) 研报 eps_this_year 均值（≥ 2 家）
    if (!eps && reports.length > 0) {
      const validEps = reports.filter(r => { const v = Number(r.eps_this_year); return !isNaN(v) && v > 0; });
      if (validEps.length >= 2) {
        eps = validEps.reduce((s, r) => s + Number(r.eps_this_year), 0) / validEps.length;
        analystCount = validEps.length;
        epsSource = "研报均值";
      }
    }
    // 3) TTM 实际 EPS = TTM 归母净利润(亿元) / 总股本(亿股) = 元/股（兜底）
    if (!eps) {
      const cur = periods[0];
      const ttmNP = cur?.ttm?.net_profit ?? cur?.net_profit ?? null;  // 亿元
      const price = mappedQuote?.price ?? 0;
      const mcap = mappedQuote?.mcap ?? 0;  // 亿元
      // 总股本(亿股) = 市值(亿元) / 股价(元/股)
      // EPS(元/股) = 净利润(亿元) / 总股本(亿股)  ← 亿元/亿股 = 元/股，单位直接对消
      if (ttmNP != null && ttmNP !== 0 && price > 0 && mcap > 0) {
        const totalShares = mcap / price;  // 亿股
        if (totalShares > 0) {
          eps = ttmNP / totalShares;  // 元/股（亿元 ÷ 亿股 = 元/股）
          epsSource = "TTM 实际";
        }
      }
    }

    if (!eps || !mappedQuote?.price) return null;

    // CAGR：优先用 3 年归母净利 TTM CAGR；若为负或缺失，用扣非口径；仍无则标记为 N/A
    let cagr = _threeYr.profit;
    let cagrLabel = "归母净利";
    if (cagr == null || cagr <= 0) {
      cagr = _valuation.profitGrowth3Y;  // 扣非口径
      cagrLabel = "扣非净利";
    }

    // 如果 CAGR 仍然无效，用当前 PE(TTM) 作为前瞻 PE 的近似，PEG 标记为无法计算
    const hasValidCagr = cagr != null && cagr > 0;
    const forwardPE = hasValidCagr ? (mappedQuote.price / eps) : null;
    const peg = hasValidCagr && forwardPE && cagr ? (forwardPE / (cagr * 100)) : null;
    const fairPrice = hasValidCagr && peg ? (mappedQuote.price / peg) : null;
    const discount = fairPrice ? ((fairPrice - mappedQuote.price) / mappedQuote.price) * 100 : null;
    const rating = !peg ? ("—" as const) :
      peg < 0.5 ? ("极度低估" as const) : peg < 1.0 ? ("低估" as const) :
      peg < 1.5 ? ("合理" as const) : peg < 2.0 ? ("偏贵" as const) : ("高估" as const);

    return {
      forwardPE, peg, fairPrice, eps,
      cagr: cagr ?? 0, rating, discount, analystCount,
      epsSource, cagrLabel, hasValidCagr,
    };
  }, [consensus, reports, periods, mappedQuote, _threeYr, _valuation]);

  // ── 报告期 PEG = 年化PE / (报告期净利同比增速 × 100) ──
  const _reportPeg = useMemo(() => {
    const p = periods[0];
    if (!p?.period || !mappedQuote?.price || mappedQuote.price <= 0) return null;
    const mcap = mappedQuote.mcap ?? 0;
    if (!mcap || mcap <= 0) return null;
    const totalShares = mcap / mappedQuote.price; // 亿股
    if (!totalShares || totalShares <= 0) return null;

    // 年报化系数：Q1=4, H1=2, 9M=4/3, FY=1
    const month = parseInt(p.period.slice(5, 7));
    let factor = 1;
    if (month === 3) factor = 4;      // Q1
    else if (month === 6) factor = 2;  // H1
    else if (month === 9) factor = 4 / 3; // 9M
    else if (month === 12) factor = 1; // FY

    const reportNP = p.net_profit ?? 0;         // 报告期单季/累计净利(亿)
    const annualizedEPS = (reportNP * factor) / totalShares; // 元/股
    if (annualizedEPS <= 0) return null;

    const reportPE = mappedQuote.price / annualizedEPS;
    const reportYoY = _growth.reportYoY.net_profit; // 小数 (0.15 = +15%)
    if (reportYoY == null || reportYoY <= 0) return null;

    const peg = reportPE / (reportYoY * 100);
    return { peg, reportPE, annualizedEPS, factor, reportYoY };
  }, [periods, mappedQuote, _growth.reportYoY.net_profit]);

  const _revMcap = useMemo(() => revenueMcapSeries(periods, mcapHistory), [periods, mcapHistory]);

  const _productTop = useMemo(() => topSegments(segments.by_product, 8), [segments.by_product]);
  const _industryTop = useMemo(() => topSegments(segments.by_industry, 8), [segments.by_industry]);
  const _segData = activeTab === "industry" ? _industryTop : _productTop;

  // ── 各 section 数据驱动分析 ──
  const analyses = useMemo(() => {
    const a: Record<string, string> = {};
    if (!periods.length) return a;
    const growth = _growth, revCash = _revCash, ncRatio = _ncRatio, margin = _margin, expense = _expense, threeYr = _threeYr;
    const balanceStructureItems = _balanceStructureItems, arRev = _arRev, apRev = _apRev, valuation = _valuation, pePs = _pePs;
    const segData = _segData;

    // 一
    { const parts: string[] = [];
      const l = revCash.revenue[revCash.revenue.length-1], f = revCash.revenue[0];
      if (l!=null && f!=null) parts.push(`TTM 营收整体呈${l>=f?"增长":"下降"}态势。`);
      if (growth.ttmYoY?.revenue != null) parts.push(`营收 TTM 同比增长 ${pct(growth.ttmYoY.revenue)}`);
      if (growth.ttmYoY?.deducted_profit != null) { const rY=growth.ttmYoY.revenue??0; parts.push(`扣非净利 TTM 同比增长 ${pct(growth.ttmYoY.deducted_profit)}${growth.ttmYoY.deducted_profit>rY?"，利润增速优于收入增速，盈利质量提升":rY>0&&growth.ttmYoY.deducted_profit<rY?"，利润增速落后收入增速，需关注成本端压力":""}。`); }
      if (growth.reportYoY?.revenue != null && growth.reportYoY?.deducted_profit != null && ((growth.reportYoY.revenue>0)!==(growth.reportYoY.deducted_profit>0))) parts.push(`最新报告期营收同比 ${pct(growth.reportYoY.revenue)}、扣非同比 ${pct(growth.reportYoY.deducted_profit)}，两者方向背离需重点关注。`);
      const mc=mappedQuote?.mcap??0; if(mc>0&&growth.ttm?.revenue>0){const r=mc/growth.ttm.revenue; if(r<2)parts.push(`营收市值比 ${num(r)}，市场对营收定价偏低。`); else if(r>10)parts.push(`营收市值比 ${num(r)}，估值溢价较高。`);}
      if(parts.length)a.section1=parts.join(""); }
    // 二+三
    { const parts: string[] = [];
      if(ncRatio.ratio!=null){if(ncRatio.ratio>=1)parts.push(`净现比(扣非) ${ncRatio.ratio.toFixed(2)}>1，经营现金流覆盖扣非利润，盈利含金量高。`);else if(ncRatio.ratio>=0.5)parts.push(`净现比(扣非) ${ncRatio.ratio.toFixed(2)}，现金流尚可但未完全覆盖利润。`);else parts.push(`净现比(扣非) ${ncRatio.ratio.toFixed(2)}<0.5，经营现金流明显不足，利润含金量存疑。`);}
      const cl=revCash.salesCash[revCash.salesCash.length-1],rl=revCash.revenue[revCash.revenue.length-1]; if(cl!=null&&rl!=null&&rl>0){const r=cl/rl; if(r<0.8)parts.push(`销售商品现金/营收 ${r.toFixed(2)}，回款偏弱。`);}
      if(parts.length)a.section2=parts.join(""); }
    // 四
    { const parts: string[] = []; const t=segData.slice(0,3); const tS=t.reduce((s:number,x:any)=>s+x.value,0); const aS=segData.reduce((s:number,x:any)=>s+x.value,0);
      if(aS>0){const pv=(tS/aS*100).toFixed(0); parts.push(`前三大${activeTab==="product"?"产品":"行业"}合计占 ${pv}%，`); if(Number(pv)>70)parts.push("业务集中度较高，单一品类风险值得关注。");else if(Number(pv)<40)parts.push("业务较为分散。");else parts.push("集中度适中。");}
      if(regionSeries.series.length>0)parts.push(` 地区营收中「${regionSeries.series[0].name}」贡献领先。`);
      if(parts.length)a.section4=parts.join(""); }
    // 五
    { const parts: string[] = []; const lg=margin.gross[margin.gross.length-1],fg=margin.gross[0];
      if(lg!=null&&fg!=null)parts.push(`毛利率 ${lg<fg?"从 "+fg.toFixed(1)+"% 降至 "+lg.toFixed(1)+"%，呈下行趋势":"从 "+fg.toFixed(1)+"% 升至 "+lg.toFixed(1)+"%，呈改善趋势"}。`);
      const lr=margin.roe[margin.roe.length-1]; if(lr!=null){if(lr>20)parts.push(` ROE ${lr.toFixed(1)}%，长期保持 >20%，竞争力突出。`);else if(lr>10)parts.push(` ROE ${lr.toFixed(1)}%，处于中等水平。`);else parts.push(` ROE ${lr.toFixed(1)}%，盈利效率偏低。`);}
      if(parts.length)a.section5=parts.join(""); }
    // 六
    { const parts: string[] = []; const r=expense.rd[expense.rd.length-1],s=expense.sell[expense.sell.length-1],ad=expense.admin[expense.admin.length-1];
      if(r!=null&&s!=null&&ad!=null){const tl=r+s+ad; parts.push(`三费合计占比 ${tl.toFixed(1)}%`); const mf=Math.max(r,s,ad);
        if(mf===r&&r>5)parts.push("，研发投入是主要费用项，技术驱动型特征明显。");else if(mf===s&&s>5)parts.push("，销售费用占比最高，依赖营销驱动增长。");else if(mf===ad)parts.push("，管理费用占比较高。");else parts.push("。");
        const ft=(expense.rd[0]||0)+(expense.sell[0]||0)+(expense.admin[0]||0); if(tl>ft+2)parts.push(" 费用率持续上行，对利润形成侵蚀。");else if(tl<ft-2)parts.push(" 费用率持续下降，规模效应显现。");}
      if(parts.length)a.section6=parts.join(""); }
    // 七
    { const parts: string[] = [];
      if(threeYr.revenue!=null&&threeYr.profit!=null){if(threeYr.profit>threeYr.revenue)parts.push(`近 3 年利润 CAGR(${pctRaw(threeYr.profit*100)}) > 营收 CAGR(${pctRaw(threeYr.revenue*100)})，盈利质量提升。`);else if(threeYr.profit>0)parts.push(`近 3 年利润 CAGR(${pctRaw(threeYr.profit*100)}) < 营收 CAGR(${pctRaw(threeYr.revenue*100)})，增收不增利。`);else parts.push(`近 3 年利润负增长，营收 CAGR ${pctRaw(threeYr.revenue*100)}。`);}
      if(threeYr.marketCap!=null&&threeYr.profit!=null&&threeYr.profit>0){if(threeYr.marketCap>threeYr.profit)parts.push(` 市值增速(${pctRaw(threeYr.marketCap*100)})超过利润增速，存在估值扩张。`);else parts.push(` 市值增速落后利润增速，估值收缩。`);}
      if(parts.length)a.section7=parts.join(""); }
    // 八
    { const as=balanceStructureItems.filter((i:any)=>i.group==="asset"),ls=balanceStructureItems.filter((i:any)=>i.group==="liab");
      const tA=as.reduce((s:number,i:any)=>s+Math.abs(i.value),0),tL=ls.reduce((s:number,i:any)=>s+Math.abs(i.value),0);
      if(tA>0&&tL>0){const r=tL/tA; if(r<0.3)a.section8=`资产负债率 ${(r*100).toFixed(0)}%，财务结构保守，杠杆利用率低。`;else if(r<0.5)a.section8=`资产负债率 ${(r*100).toFixed(0)}%，处于安全区间，财务结构稳健。`;else if(r<0.7)a.section8=`资产负债率 ${(r*100).toFixed(0)}%，杠杆适中，需关注有息负债占比。`;else a.section8=`资产负债率 ${(r*100).toFixed(0)}%，偏高，需警惕偿债压力。`;} }
    // 九
    { const parts: string[] = []; const lAr=arRev.arRatio[arRev.arRatio.length-1],lAp=apRev.apRatio[apRev.apRatio.length-1];
      if(lAr!=null&&lAp!=null){if(lAp>lAr)parts.push("应付占比 > 应收占比，对上下游综合议价能力强。");else parts.push("应收占比 > 应付占比，资金被客户占用更多，产业链地位待提升。");
        const fAr=arRev.arRatio[0],fAp=apRev.apRatio[0]; if(fAr!=null&&lAr>fAr+2)parts.push(" 应收/营收占比持续上升，回款能力在恶化。"); if(fAp!=null&&lAp<fAp-2)parts.push(" 应付/营收占比下降，对供应商话语权减弱。");}
      if(parts.length)a.section9=parts.join(""); }
    // 十
    { const parts: string[] = [];
      if(valuation.peDeducted!=null&&pePs.peMean!=null&&pePs.peStd!=null){
        if(valuation.peDeducted<pePs.peMean-pePs.peStd)parts.push(`当前扣非PE ${num(valuation.peDeducted)} 低于历史低估线(${num(pePs.peMean-pePs.peStd)})，估值处于历史低位。`);
        else if(valuation.peDeducted>pePs.peMean+pePs.peStd)parts.push(`当前扣非PE ${num(valuation.peDeducted)} 高于历史高估线(${num(pePs.peMean+pePs.peStd)})，估值处于历史高位。`);
        else parts.push(`当前扣非PE ${num(valuation.peDeducted)}，在历史均值(${num(pePs.peMean)})附近，估值合理。`);}
      if(valuation.peg3Y!=null){if(valuation.peg3Y<1)parts.push(` 3年PEG ${num(valuation.peg3Y)}<1，相对增速被低估。`);else if(valuation.peg3Y>2)parts.push(` 3年PEG ${num(valuation.peg3Y)}>2，估值相对增速偏高。`);else parts.push(` 3年PEG ${num(valuation.peg3Y)}，估值与增速匹配。`);}
      if(valuation.fairPrice3Y!=null&&mappedQuote?.price){const p=mappedQuote.price,f=valuation.fairPrice3Y; if(f>p)parts.push(` 当前价低于3年合理价 ${num(f)}，存在上行空间。`);else parts.push(` 当前价高于3年合理价 ${num(f)}，已充分反映成长预期。`);}
      if(parts.length)a.section10=parts.join(""); }
    return a;
  }, [periods, _growth, mappedQuote, _ncRatio, _segData, activeTab, regionSeries, _margin, _expense, _threeYr, _balanceStructureItems, _arRev, _apRev, _valuation, _pePs]);

  // JSX 中使用的变量别名
  const growth = _growth, revCash = _revCash, profitCash = _profitCash, ncRatio = _ncRatio;
  const margin = _margin, costMargin = _costMargin, expense = _expense;
  const fiveYr = _fiveYr, threeYr = _threeYr;
  const bsPeriods = _bsPeriods, bsCurrentPeriod = _bsCurrent, bsPrevPeriod = _bsPrev;
  const balanceStructureItems = _balanceStructureItems;
  const arRev = _arRev, apRev = _apRev;
  const pePs = _pePs;
  const valuation = _valuation;
  const astockPeg = _astockPeg;
  const revMcap = _revMcap;
  const segData = _segData;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (err || periods.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <AlertCircle className="h-8 w-8 mx-auto opacity-50 mb-2" />
        {err || "暂无财务数据，请确认股票代码是否正确"}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      {/* ── 一、市值与业绩增长趋势 ─────────────────────────── */}
      <section>
        <SectionHeader icon={BarChart3} title="一、市值与业绩增长趋势" subtitle="经营状况分析 · 业绩规模 TTM" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
          <MetricCard label="营收 TTM (亿)" value={num(growth.ttm.revenue)} sub={growth.ttmYoY.revenue != null ? `TTM 同比 TTM ${pct(growth.ttmYoY.revenue)}` : undefined} subAccent={growth.ttmYoY.revenue != null ? (growth.ttmYoY.revenue > 0 ? "up" : "down") : "neutral"} />
          <MetricCard label="净利润 TTM (亿)" value={num(growth.ttm.net_profit)} sub={growth.ttmYoY.net_profit != null ? `TTM 同比 TTM ${pct(growth.ttmYoY.net_profit)}` : undefined} subAccent={growth.ttmYoY.net_profit != null ? (growth.ttmYoY.net_profit > 0 ? "up" : "down") : "neutral"} />
          <MetricCard label="扣非净利 TTM (亿)" value={num(growth.ttm.deducted_profit)} sub={growth.ttmYoY.deducted_profit != null ? `TTM 同比 TTM ${pct(growth.ttmYoY.deducted_profit)}` : undefined} subAccent={growth.ttmYoY.deducted_profit != null ? (growth.ttmYoY.deducted_profit > 0 ? "up" : "down") : "neutral"} />
          <MetricCard label="当前市值 (亿)" value={num(mappedQuote?.mcap)} sub={mappedQuote?.pe_ttm != null ? `PE(TTM) ${num(mappedQuote.pe_ttm)}` : undefined} />
          <MetricCard label="PE TTM (扣非)" value={valuation.peDeducted != null ? num(valuation.peDeducted) : "—"} sub={valuation.pegCurrent != null ? `PEG TTM ${num(valuation.pegCurrent)}` : undefined} subAccent={valuation.pegCurrent != null ? (valuation.pegCurrent < 1 ? "down" : valuation.pegCurrent <= 2 ? "neutral" : "up") : "neutral"} />
          <MetricCard label="PEG (3年增速)" value={valuation.peg3Y != null ? num(valuation.peg3Y) : "—"} sub={valuation.profitGrowth3Y != null ? `3年扣非增速 ${pctRaw(valuation.profitGrowth3Y * 100)}` : undefined} subAccent={valuation.peg3Y != null ? (valuation.peg3Y < 1 ? "down" : valuation.peg3Y <= 2 ? "neutral" : "up") : "neutral"} />
          <MetricCard label="毛利率 / 净利率" value={periods[0]?.gross_margin != null && periods[0]?.net_margin != null ? `${periods[0].gross_margin.toFixed(1)}% / ${periods[0].net_margin.toFixed(1)}%` : "—"} sub={periods[0]?.period ? `报告期 ${periods[0].period.slice(0, 7)}` : undefined} />
        </div>
        {/* 报告期同比标签行 */}
        {periods[0]?.period && (growth.reportYoY.revenue != null || growth.reportYoY.net_profit != null || growth.reportYoY.deducted_profit != null) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[11px] text-muted-foreground/70 font-medium shrink-0">
              报告期({periods[0].period.slice(0, 7)})同比
            </span>
            <span className="text-muted-foreground/30 text-xs">·</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-muted/50 border-border text-foreground">
              营收{" "}
              {growth.reportYoY.revenue != null ? (
                <span className={growth.reportYoY.revenue > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
                  {pct(growth.reportYoY.revenue)}
                </span>
              ) : "—"}
              {periods[0]?.revenue != null ? ` (${num(periods[0].revenue)}亿)` : ""}
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-muted/50 border-border text-foreground">
              净利{" "}
              {growth.reportYoY.net_profit != null ? (
                <span className={growth.reportYoY.net_profit > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
                  {pct(growth.reportYoY.net_profit)}
                </span>
              ) : "—"}
              {periods[0]?.net_profit != null ? ` (${num(periods[0].net_profit)}亿)` : ""}
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-muted/50 border-border text-foreground">
              扣非{" "}
              {growth.reportYoY.deducted_profit != null ? (
                <span className={growth.reportYoY.deducted_profit > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
                  {pct(growth.reportYoY.deducted_profit)}
                </span>
              ) : "—"}
              {periods[0]?.deducted_profit != null ? ` (${num(periods[0].deducted_profit)}亿)` : ""}
            </span>
            {_reportPeg && (
              <span className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded-md border",
                _reportPeg.peg < 0.5 ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400" :
                _reportPeg.peg < 1.0 ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-950/40 dark:border-green-700 dark:text-green-300" :
                _reportPeg.peg < 1.5 ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400" :
                _reportPeg.peg < 2.0 ? "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400" :
                "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400",
              )}>
                PEG {_reportPeg.peg.toFixed(2)}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
          <div className="rounded-lg border bg-card p-3 flex flex-col">
            <RevenueProfitChart
              dates={revCash.dates}
              revenue={revCash.revenue}
              netProfit={profitCash.netProfit}
            />
          </div>
          <div className="rounded-lg border bg-card p-3 flex flex-col">
            <RevenueMcapChart
              dates={revMcap.dates}
              revenue={revMcap.revenue}
              mcap={revMcap.mcap}
            />
          </div>
        </div>
        {growth.reportYoY.revenue != null && (
          <p className="text-[11px] text-muted-foreground/70 mt-2 flex flex-wrap items-center gap-x-1.5">
            <span>报告期同比 ·</span>
            <span>
              营收{" "}
              <span className={yoyColorClass(growth.reportYoY.revenue)}>
                {pct(growth.reportYoY.revenue)}
              </span>
              {periods[0]?.revenue != null && <span className="text-muted-foreground/60"> ({num(periods[0].revenue)}亿)</span>}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
              净利{" "}
              <span className={yoyColorClass(growth.reportYoY.net_profit)}>
                {pct(growth.reportYoY.net_profit)}
              </span>
              {periods[0]?.net_profit != null && <span className="text-muted-foreground/60"> ({num(periods[0].net_profit)}亿)</span>}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
              扣非{" "}
              <span className={yoyColorClass(growth.reportYoY.deducted_profit)}>
                {pct(growth.reportYoY.deducted_profit)}
              </span>
              {periods[0]?.deducted_profit != null && <span className="text-muted-foreground/60"> ({num(periods[0].deducted_profit)}亿)</span>}
            </span>
          </p>
        )}
        {analyses.section1 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section1}</p>}
      </section>

      {/* ── 二 + 三、营收 & 现金流 / 净利 & 现金流 ─────────── */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 左：营收 & 销售商品现金流 */}
          <div>
            <SectionHeader icon={Activity} title="二、营收 & 销售商品现金流趋势" />
            <div className="rounded-lg border bg-card p-3">
              <DualAxisChart
                dates={revCash.dates}
                series={[
                  { name: "营业收入(亿) TTM", data: revCash.revenue, type: "line", color: "#3b82f6" },
                  { name: "销售商品现金流(亿)", data: revCash.salesCash, type: "line", yAxisIndex: 0, color: "#22c55e" },
                ]}
              />
            </div>
          </div>
          {/* 右：净利 & 现金流 + 净现比 */}
          <div>
            <SectionHeader icon={DollarSign} title="三、净利润 & 现金流净值趋势" subtitle="净现比 = 经营现金流 / 扣非净利" />
            {/* 净现比标签：图上方 */}
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/70">净现比(扣非)</span>
                <span className={cn(
                  "text-[12px] font-bold tabular-nums",
                  ncRatio.ratio != null ? (ncRatio.ratio > 1 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400") : "text-muted-foreground"
                )}>
                  {ncRatio.ratio != null ? ncRatio.ratio.toFixed(2) : "—"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/70">净现比(净利)</span>
                <span className={cn(
                  "text-[12px] font-bold tabular-nums",
                  ncRatio.ratio2 != null ? (ncRatio.ratio2 > 1 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400") : "text-muted-foreground"
                )}>
                  {ncRatio.ratio2 != null ? ncRatio.ratio2.toFixed(2) : "—"}
                </span>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <DualAxisChart
                dates={profitCash.dates}
                series={[
                  { name: "归母净利润(亿)", data: profitCash.netProfit, type: "line", color: "#f59e0b" },
                  { name: "扣非净利润(亿)", data: profitCash.deducted, type: "line", color: "#3b82f6" },
                  { name: "经营性现金流(亿) TTM", data: profitCash.opCash, type: "line", yAxisIndex: 0, color: "#10b981" },
                ]}
              />
            </div>
          </div>
        </div>
        {analyses.section2 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section2}</p>}
      </section>

      {/* ── 四、业务构成 & 按地区营收趋势 ──────────────────── */}
      <section>
        <SectionHeader icon={BarChart3} title="四、业务构成 & 按地区营收趋势" subtitle="按产品 / 按行业 · 多期对比分地区 TTM" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 左：业务构成饼图 */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setActiveTab("product")}
                className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", activeTab === "product" ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground/60 hover:text-muted-foreground")}
              >按产品</button>
              <button
                onClick={() => setActiveTab("industry")}
                className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", activeTab === "industry" ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground/60 hover:text-muted-foreground")}
              >按行业</button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    const idx = segments.periods.indexOf(segPeriod);
                    if (idx >= 0 && idx < segments.periods.length - 1) {
                      setSegPeriod(segments.periods[idx + 1]);
                    }
                  }}
                  disabled={!segments.periods.length || segments.periods.indexOf(segPeriod) >= segments.periods.length - 1}
                  className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  title="上一期"
                >‹ 上一期</button>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  {segPeriod || segments.current || "—"}
                </span>
                <button
                  onClick={() => {
                    const idx = segments.periods.indexOf(segPeriod);
                    if (idx > 0) setSegPeriod(segments.periods[idx - 1]);
                  }}
                  disabled={!segments.periods.length || segments.periods.indexOf(segPeriod) <= 0}
                  className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  title="下一期"
                >下一期 ›</button>
              </div>
            </div>
            {segData.length > 0 ? (
              <DonutChart data={segData} height={220} />
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">暂无业务构成数据</p>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              切换产品/行业查看单期营收构成占比。
            </p>
          </div>
          {/* 右：按地区营收趋势折线 */}
          <div className="rounded-lg border bg-card p-3">
            {regionSeries.series.length > 0 ? (
              <MultiLineChart
                periods={regionSeries.periods}
                series={regionSeries.series}
                height={260}
                yUnit="亿元"
              />
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">暂无按地区数据</p>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Top 6 地区每期主营业务收入 TTM（滚动 12 个月，亿元）；某地区某期无数据则该点留空。
            </p>
          </div>
        </div>
        {analyses.section4 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section4}</p>}
      </section>

      {/* ── 五、毛利率/净利率/ROE + 成本与毛利率分析（并排） ──────── */}
      <section>
        <SectionHeader icon={Activity} title="五、毛利率 & 净利率 & ROE 趋势" subtitle="成本与盈利能力" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 左：成本与毛利率分析 */}
          <div className="rounded-lg border bg-card p-3">
            <CostMarginChart
              dates={costMargin.dates}
              revenue={costMargin.revenue}
              cost={costMargin.cost}
              margin={costMargin.margin}
              height={260}
            />
          </div>
          {/* 右：毛利率 / 净利率 / ROE 折线 + 顶部 3 标签 */}
          <div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="rounded-md border bg-card p-2.5 text-center">
                <p className="text-[11px] text-muted-foreground/60">毛利率</p>
                <p className="text-lg font-bold tabular-nums text-[#ef4444]">
                  {margin.gross.length ? `${margin.gross[margin.gross.length - 1].toFixed(2)}%` : "—"}
                </p>
              </div>
              <div className="rounded-md border bg-card p-2.5 text-center">
                <p className="text-[11px] text-muted-foreground/60">净利率</p>
                <p className="text-lg font-bold tabular-nums text-[#f59e0b]">
                  {margin.net.length ? `${margin.net[margin.net.length - 1].toFixed(2)}%` : "—"}
                </p>
              </div>
              <div className="rounded-md border bg-card p-2.5 text-center">
                <p className="text-[11px] text-muted-foreground/60">ROE（净资产收益率）</p>
                <p className="text-lg font-bold tabular-nums text-[#3b82f6]">
                  {margin.roe.length ? `${margin.roe[margin.roe.length - 1].toFixed(2)}%` : "—"}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <MarginTrendChart dates={margin.dates} gross={margin.gross} net={margin.net} roe={margin.roe} height={260} />
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              ROE 长期 &gt; 20% 说明公司有很强的竞争壁垒；净利率持续为负 + 毛利率走低 → 主业恶化。
            </p>
          </div>
        </div>
        {analyses.section5 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section5}</p>}
      </section>

      {/* ── 六、三费占比 ──────────────────────────────────── */}
      <section>
        <SectionHeader icon={Calculator} title="六、三费占比与业绩对比" subtitle="研发 + 销售 + 管理（TTM）" />
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="rounded-md border bg-card p-2.5 text-center">
            <p className="text-[11px]" style={{ color: "#3b82f6" }}>当前研发费用占比</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: "#3b82f6" }}>
              {expense.rd.length ? `${expense.rd[expense.rd.length - 1].toFixed(2)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 tabular-nums">
              {expense.rd_amt && expense.rd_amt.length ? `${expense.rd_amt[expense.rd_amt.length - 1].toFixed(2)} 亿` : ""}
            </p>
          </div>
          <div className="rounded-md border bg-card p-2.5 text-center">
            <p className="text-[11px]" style={{ color: "#ef4444" }}>销售费用占比</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: "#ef4444" }}>
              {expense.sell.length ? `${expense.sell[expense.sell.length - 1].toFixed(2)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 tabular-nums">
              {expense.sell_amt && expense.sell_amt.length ? `${expense.sell_amt[expense.sell_amt.length - 1].toFixed(2)} 亿` : ""}
            </p>
          </div>
          <div className="rounded-md border bg-card p-2.5 text-center">
            <p className="text-[11px]" style={{ color: "#a855f7" }}>管理费用占比</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: "#a855f7" }}>
              {expense.admin.length ? `${expense.admin[expense.admin.length - 1].toFixed(2)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 tabular-nums">
              {expense.admin_amt && expense.admin_amt.length ? `${expense.admin_amt[expense.admin_amt.length - 1].toFixed(2)} 亿` : ""}
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <ExpenseStackedChart
            dates={expense.dates}
            sell={expense.sell}
            admin={expense.admin}
            rd={expense.rd}
            revenue={expense.revenue}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2">
          蓝色柱=TTM 营收(主轴亿)；红/紫/蓝线=各费用TTM金额(次轴%)。三费占比上行将持续侵蚀利润。
        </p>
        {analyses.section6 && <p className="text-[11px] text-muted-foreground/70 mt-1">{analyses.section6}</p>}
      </section>

      {/* ── 七、近五年 / 近三年综合增长率 ──────────────────── */}
      <section>
        <SectionHeader icon={TrendingUp} title="七、近五年 / 近三年综合增长率 (CAGR)" subtitle="市值 · 营收 · 净利 · 净资产" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* ── 左：5 年部分 ── */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
              近 5 年 CAGR
              {fiveYr.mcapSource ? <span className="text-muted-foreground/50 font-normal ml-1">({fiveYr.mcapSource})</span> : null}
            </p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <MetricCard
                label="市值 CAGR"
                value={fiveYr.marketCap != null ? pctRaw(fiveYr.marketCap * 100) : "—"}
                accent={fiveYr.marketCap != null ? (fiveYr.marketCap > 0 ? "up" : "down") : "neutral"}
              />
              <MetricCard label="营收 CAGR" value={fiveYr.revenue != null ? pctRaw(fiveYr.revenue * 100) : "—"} accent={fiveYr.revenue != null ? (fiveYr.revenue > 0 ? "up" : "down") : "neutral"} />
              <MetricCard label="净利润 CAGR" value={fiveYr.profit != null ? pctRaw(fiveYr.profit * 100) : "—"} sub={fiveYr.profitLabel} accent={fiveYr.profit != null ? (fiveYr.profit > 0 ? "up" : "down") : "neutral"} />
              <MetricCard label="净资产 CAGR" value={fiveYr.netAsset != null ? pctRaw(fiveYr.netAsset * 100) : "—"} accent={fiveYr.netAsset != null ? (fiveYr.netAsset > 0 ? "up" : "down") : "neutral"} />
            </div>
            <div className="rounded-lg border bg-card p-3">
              <CagrBarChart
                subtitle="近五年综合增长率"
                data={[
                  { name: "市值增长率", value: fiveYr.marketCap, color: "#3b82f6" },
                  { name: "营收增长率", value: fiveYr.revenue,  color: "#22c55e" },
                  { name: "利润增长率", value: fiveYr.profit,   color: "#ef4444" },
                  { name: "净资产增长率", value: fiveYr.netAsset, color: "#a16207" },
                ]}
              />
            </div>
          </div>

          {/* ── 右：3 年部分 ── */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
              近 3 年 CAGR
              {threeYr.mcapSource ? <span className="text-muted-foreground/50 font-normal ml-1">({threeYr.mcapSource})</span> : null}
            </p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <MetricCard
                label="市值 CAGR"
                value={threeYr.marketCap != null ? pctRaw(threeYr.marketCap * 100) : "—"}
                accent={threeYr.marketCap != null ? (threeYr.marketCap > 0 ? "up" : "down") : "neutral"}
              />
              <MetricCard label="营收 CAGR" value={threeYr.revenue != null ? pctRaw(threeYr.revenue * 100) : "—"} accent={threeYr.revenue != null ? (threeYr.revenue > 0 ? "up" : "down") : "neutral"} />
              <MetricCard label="净利润 CAGR" value={threeYr.profit != null ? pctRaw(threeYr.profit * 100) : "—"} sub={threeYr.profitLabel} accent={threeYr.profit != null ? (threeYr.profit > 0 ? "up" : "down") : "neutral"} />
              <MetricCard label="净资产 CAGR" value={threeYr.netAsset != null ? pctRaw(threeYr.netAsset * 100) : "—"} accent={threeYr.netAsset != null ? (threeYr.netAsset > 0 ? "up" : "down") : "neutral"} />
            </div>
            <div className="rounded-lg border bg-card p-3">
              <CagrBarChart
                subtitle="近三年综合增长率"
                data={[
                  { name: "市值增长率", value: threeYr.marketCap, color: "#3b82f6" },
                  { name: "营收增长率", value: threeYr.revenue,  color: "#22c55e" },
                  { name: "利润增长率", value: threeYr.profit,   color: "#ef4444" },
                  { name: "净资产增长率", value: threeYr.netAsset, color: "#a16207" },
                ]}
              />
            </div>
          </div>
        </div>
        {analyses.section7 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section7}</p>}
      </section>

      {/* ── 八、资产负债结构 ──────────────────────────────── */}
      <section>
        <SectionHeader icon={BarChart3} title="八、资产负债结构" subtitle="单期资产 / 负债柱形图，可切换报告期" />
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-[11px] text-muted-foreground/70">报告期</span>
            <button
              className="px-2 py-0.5 text-[11px] rounded border bg-background hover:bg-muted/40 disabled:opacity-30"
              onClick={() => setBsPeriodIdx(i => Math.max(0, i - 1))}
              disabled={bsPeriodIdx <= 0}
              title="上一期"
            >← 上一期</button>
            <select
              className="px-2 py-0.5 text-[11px] rounded border bg-background"
              value={bsPeriodIdx}
              onChange={e => setBsPeriodIdx(Number(e.target.value))}
            >
              {bsPeriods.map((p, i) => (
                <option key={p.period} value={i}>{p.period}</option>
              ))}
            </select>
            <button
              className="px-2 py-0.5 text-[11px] rounded border bg-background hover:bg-muted/40 disabled:opacity-30"
              onClick={() => setBsPeriodIdx(i => Math.min(bsPeriods.length - 1, i + 1))}
              disabled={bsPeriodIdx >= bsPeriods.length - 1}
              title="下一期"
            >下一期 →</button>
          </div>
          <BalanceStructureChart
            data={balanceStructureItems}
            period={bsCurrentPeriod?.period || bsPrevPeriod?.period || ""}
            periods={bsPeriods.map(p => p.period)}
            onPeriodChange={(p) => {
              const idx = bsPeriods.findIndex(x => x.period === p);
              if (idx >= 0) setBsPeriodIdx(idx);
            }}
            height={360}
          />
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            资产 = 货币资金/应收/预付/存货/其他流动/长期股权/固定/无形/其他非流动；负债 = 短借/应付/合同/薪酬/其他流动/长借/其他非流动。
            柱顶/柱底为该期绝对金额（亿）。
          </p>
        </div>
        {analyses.section8 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section8}</p>}
      </section>

      {/* ── 九、应收/应付 & 营业收入 ──────────────────────── */}
      <section>
        <SectionHeader icon={Activity} title="九、应收/应付账款 & 营业收入" subtitle="议价能力分析 · 应收/应付占比" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 左：应收账款 & 营收 */}
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">应收账款 & 营业收入</p>
            <ArRevenueChart
              dates={arRev.dates}
              ar={arRev.ar}
              revenue={arRev.revenue}
              arRatio={arRev.arRatio}
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              应收/营收↑ → 客户付款慢，议价力弱，警惕坏账。
            </p>
          </div>
          {/* 右：应付账款 & 营收 */}
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">应付账款 & 营业收入</p>
            <ApRevenueChart
              dates={apRev.dates}
              ap={apRev.ap}
              revenue={apRev.revenue}
              apRatio={apRev.apRatio}
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              应付/营收↑ → 占用上游资金，对供应商话语权强。
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2">
          应付占营收比高说明公司能无偿占用上游供应商资金，产业链地位强；应收 + 应付交叉看可判断对上下游综合话语权。
        </p>
        {analyses.section9 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section9}</p>}
      </section>

      {/* ── 十、估值 (PS / PE / PEG) ──────────────────────── */}
      <section>
        <SectionHeader icon={DollarSign} title="十、估值 (PS / PE / PEG)" subtitle="市值 / 营收 / 净利 / 增速" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <MetricCard label="PS(TTM)" value={valuation.ps != null ? num(valuation.ps) : "—"} accent="neutral" />
          <MetricCard label="PE(TTM)" value={mappedQuote?.pe_ttm != null ? num(mappedQuote.pe_ttm) : "—"} sub={valuation.pe != null ? `扣非前 ${num(valuation.pe)}` : undefined} accent="neutral" />
          <MetricCard label="PE TTM (扣非)" value={valuation.peDeducted != null ? num(valuation.peDeducted) : "— (亏损)"} sub={valuation.pegCurrent != null ? `PEG TTM ${num(valuation.pegCurrent)}` : undefined} subAccent={valuation.pegCurrent != null ? (valuation.pegCurrent < 1 ? "down" : valuation.pegCurrent <= 2 ? "neutral" : "up") : "neutral"} accent="neutral" />
          <MetricCard label="当前合理价" value={valuation.fairPriceCurrent != null ? `¥${num(valuation.fairPriceCurrent)}` : "—"} sub={valuation.fairPECurrent != null ? `合理 PE ${num(valuation.fairPECurrent)}` : undefined} accent="neutral" />
          <MetricCard label="PEG (3年增速)" value={valuation.peg3Y != null ? num(valuation.peg3Y) : "—"} sub={valuation.profitGrowth3Y != null ? `3年扣非增速 ${pctRaw(valuation.profitGrowth3Y * 100)}` : undefined} subAccent={valuation.peg3Y != null ? (valuation.peg3Y < 1 ? "down" : valuation.peg3Y <= 2 ? "neutral" : "up") : "neutral"} accent="neutral" />
          <MetricCard label="3年合理价" value={valuation.fairPrice3Y != null ? `¥${num(valuation.fairPrice3Y)}` : "—"} sub={valuation.fairPE3Y != null ? `合理 PE ${num(valuation.fairPE3Y)}` : undefined} accent="neutral" />
        </div>

        {/* PE / PS 历史趋势图（并排） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg border bg-card p-3">
            {pePs.peMean != null ? (
              <PeTrendChart
                periods={pePs.periods}
                pe={pePs.pe}
                peMean={pePs.peMean}
                peStd={pePs.peStd}
                height={250}
              />
            ) : (
              <div className="flex items-center justify-center text-xs text-muted-foreground py-12">
                暂无足够历史市值数据计算 PE 趋势
              </div>
            )}
          </div>
          <div className="rounded-lg border bg-card p-3">
            {pePs.psMean != null ? (
              <PsTrendChart
                periods={pePs.periods}
                ps={pePs.ps}
                psMean={pePs.psMean}
                psStd={pePs.psStd}
                height={250}
              />
            ) : (
              <div className="flex items-center justify-center text-xs text-muted-foreground py-12">
                暂无足够历史市值数据计算 PS 趋势
              </div>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2">
          高估线 = 均值 + 1 倍标准差；低估线 = 均值 - 1 倍标准差。PE/PS 低于低估线时估值处于历史低位，高于高估线时估值偏高。
          PEG 合理价基于{valuation.consensusPE ? "研报一致预期 PE " + num(valuation.consensusPE) : "扣非净利润增速估算 PE (PEG=1)"}，仅供横向对比。
        </p>
        {analyses.section10 && <p className="text-[11px] text-muted-foreground/70 mt-2">{analyses.section10}</p>}
      </section>

      {/* ── 十一、PEG 估值分析 (astock-peg) ────────────── */}
      <section>
        <SectionHeader icon={Calculator} title="十一、PEG 估值分析" subtitle="同花顺一致预期 · 彼得·林奇 PEG 法" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
          <MetricCard
            label="EPS"
            value={astockPeg ? `¥${num(astockPeg.eps)}` : "—"}
            sub={
              astockPeg?.epsSource === "一致预期" && astockPeg.analystCount > 0 ? `${astockPeg.analystCount} 家机构 · 一致预期` :
              astockPeg?.epsSource === "研报均值" ? `${astockPeg.analystCount} 家研报均值` :
              astockPeg?.epsSource === "TTM 实际" ? "TTM 实际" :
              undefined
            }
          />
          <MetricCard
            label="前瞻 PE"
            value={astockPeg?.hasValidCagr && astockPeg.forwardPE != null ? num(astockPeg.forwardPE) : "—"}
            sub={astockPeg && astockPeg.hasValidCagr ? `${astockPeg.cagrLabel} CAGR ${pctRaw(astockPeg.cagr * 100)}` : undefined}
          />
          <MetricCard
            label="PEG (林奇)"
            value={astockPeg?.peg != null ? num(astockPeg.peg) : (astockPeg && !astockPeg.hasValidCagr ? "N/A" : "—")}
            sub={astockPeg?.rating ?? "—"}
            accent={
              !astockPeg || !astockPeg.peg ? "neutral" :
              astockPeg.peg < 0.5 ? "down" :
              astockPeg.peg < 1.0 ? "down" :
              astockPeg.peg < 1.5 ? "neutral" :
              astockPeg.peg < 2.0 ? "up" : "up"
            }
          />
          <MetricCard
            label="合理股价 (PEG=1)"
            value={astockPeg?.fairPrice != null ? `¥${num(astockPeg.fairPrice)}` : "—"}
            sub={astockPeg?.discount != null ? (astockPeg.discount > 0 ? `折价 ${astockPeg.discount.toFixed(1)}%` : `溢价 ${Math.abs(astockPeg.discount).toFixed(1)}%`) : undefined}
            accent={!astockPeg?.fairPrice || !astockPeg?.discount ? "neutral" : (astockPeg.discount > 0 ? "down" : astockPeg.discount < -5 ? "up" : "neutral")}
          />
          <MetricCard
            label="净利润 CAGR"
            value={astockPeg && astockPeg.cagr > 0 ? pctRaw(astockPeg.cagr * 100) : (astockPeg ? "≤0%" : "—")}
            sub={`近 3 年 TTM (${astockPeg?.cagrLabel ?? "—"})`}
            accent="up"
          />
          <MetricCard
            label="PE 消化年限"
            value={astockPeg?.hasValidCagr && astockPeg.forwardPE && astockPeg.cagr > 0
              ? (() => { const n = Math.log(astockPeg.forwardPE / 30) / Math.log(1 + astockPeg.cagr); return n > 0 ? `${n.toFixed(1)} 年` : "已合理"; })()
              : (astockPeg && !astockPeg.hasValidCagr ? "N/A" : "—")}
            sub="消化至 PE=30"
            accent="neutral"
          />
        </div>
      </section>

      {/* ── 十二、近半年研报 ─────────────────────────── */}
      {reports.length > 0 && (
        <section>
          <SectionHeader icon={Calculator} title="十二、近半年研报" subtitle={`共 ${reports.length} 篇 · 东财 reportapi`} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-2 whitespace-nowrap">日期</th>
                  <th className="text-left py-1.5 pr-2">机构</th>
                  <th className="text-left py-1.5 pr-2">标题</th>
                  <th className="text-center py-1.5 pr-2 whitespace-nowrap">评级</th>
                  <th className="text-right py-1.5 pr-2 whitespace-nowrap">当年 EPS</th>
                  <th className="text-right py-1.5 whitespace-nowrap">明年 EPS</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{r.date}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap max-w-[80px] truncate">{r.org}</td>
                    <td className="py-1.5 pr-2 max-w-[300px] truncate">
                      {r.info_code ? (
                        <a
                          href={`https://data.eastmoney.com/report/stock/detail?code=${r.info_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                          title={r.title}
                        >
                          {r.title}
                        </a>
                      ) : (
                        <span title={r.title}>{r.title}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-center whitespace-nowrap">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px]",
                        r.rating?.includes("买入") || r.rating?.includes("强烈推荐") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        r.rating?.includes("增持") || r.rating?.includes("推荐") ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                        r.rating?.includes("中性") ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" :
                        "bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-500"
                      )}>
                        {r.rating || "—"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{r.eps_this_year != null ? Number(r.eps_this_year).toFixed(2) : "—"}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{r.eps_next_year != null ? Number(r.eps_next_year).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function StockBoard() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => loadWatchlist());
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(() => {
    const list = loadWatchlist();
    return list.length > 0 ? list[0].code : null;
  });

  const codesA = watchlist.filter(w => w.market === "A").map(w => w.code);
  const codesUS = watchlist.filter(w => w.market === "US").map(w => w.code);
  const existingCodes = new Set(watchlist.map(w => w.code));

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await api.getMarketData({ stocks_a: codesA, stocks_us: codesUS });
      setQuotes({ ...res.stocks_a, ...res.stocks_us });
    } catch (e) {
      setError(e instanceof Error ? e.message : "行情数据获取失败");
    } finally { setLoading(false); setRefreshing(false); }
  }, [codesA.join(","), codesUS.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // 单一 effect：初始加载 + 自选列表变更时刷新，消除重复请求
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      // 首次挂载：只请求一次
      mountedRef.current = true;
      fetchData();
    } else {
      // 自选列表变化（增删股票）→ 刷新
      fetchData(true);
    }
  }, [codesA.join(","), codesUS.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = (item: WatchlistItem) => {
    if (existingCodes.has(item.code)) { toast.error("该股票已在看板中"); return; }
    const next = [...watchlist, item];
    setWatchlist(next); saveWatchlist(next);
    setActiveCode(item.code);
    fetchData(true);
  };
  const handleRemove = (code: string) => {
    const next = watchlist.filter(w => w.code !== code);
    setWatchlist(next); saveWatchlist(next);
    if (activeCode === code) setActiveCode(next[0]?.code ?? null);
  };

  const activeItem = watchlist.find(w => w.code === activeCode) ?? null;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left watchlist */}
      <aside className="w-56 border-r bg-card/30 flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">个股看板</h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5">{watchlist.length} 只自选股</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchData(true)} disabled={refreshing}
              className="p-1.5 rounded-md border bg-card hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
              title="刷新行情"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              添加
            </button>
          </div>
        </div>

        {error && (
          <div className="m-3 text-xs text-danger border border-danger/30 rounded p-2 bg-danger/5">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {watchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12 px-4">
              <Search className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm font-medium mb-1">暂无自选股</p>
              <p className="text-xs opacity-60 mb-4 text-center">点击「添加」开始构建你的看板</p>
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" />添加第一只股票
              </button>
            </div>
          ) : (
            <>
              {watchlist.filter(w => w.market === "A").length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 pt-1">
                    A 股 ({watchlist.filter(w => w.market === "A").length})
                  </p>
                  {watchlist.filter(w => w.market === "A").map(item => (
                    <StockRow
                      key={item.code} item={item} data={quotes[item.code]} loading={loading}
                      active={activeCode === item.code} onSelect={() => setActiveCode(item.code)} onRemove={() => handleRemove(item.code)}
                    />
                  ))}
                </div>
              )}
              {watchlist.filter(w => w.market === "US").length > 0 && (
                <div className="space-y-1.5 mt-3">
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 pt-1">
                    美股 ({watchlist.filter(w => w.market === "US").length})
                  </p>
                  {watchlist.filter(w => w.market === "US").map(item => (
                    <StockRow
                      key={item.code} item={item} data={quotes[item.code]} loading={loading}
                      active={activeCode === item.code} onSelect={() => setActiveCode(item.code)} onRemove={() => handleRemove(item.code)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Right detail */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        {activeItem ? (
          <div>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-5 py-3 flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    activeItem.market === "A" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
                  )}>{activeItem.market}股</span>
                  <span className="text-sm font-mono text-muted-foreground">{activeItem.code}</span>
                  <h2 className="text-base font-semibold">{quotes[activeItem.code]?.name || activeItem.code}</h2>
                </div>
                {quotes[activeItem.code] && !quotes[activeItem.code].error && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    现价 <span className="font-semibold text-foreground">{fmtPrice(quotes[activeItem.code].price)}</span>
                    <span className={cn("ml-2 font-mono", changeColor(quotes[activeItem.code].change_pct))}>
                      {quotes[activeItem.code].change_pct > 0 ? "+" : ""}{quotes[activeItem.code].change_pct.toFixed(2)}%
                    </span>
                  </p>
                )}
              </div>
            </div>
            <StockDetailPanel item={activeItem} quote={quotes[activeItem.code] ?? null} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BarChart3 className="h-16 w-16 opacity-20 mb-3" />
            <p className="text-sm">从左侧选择一只股票开始分析</p>
          </div>
        )}
      </main>

      <SearchDialog open={showSearch} onClose={() => setShowSearch(false)} onAdd={handleAdd} existingCodes={existingCodes} />
    </div>
  );
}

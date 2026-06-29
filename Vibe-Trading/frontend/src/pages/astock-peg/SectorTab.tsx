import { useState, memo } from "react";
import { Search, AlertCircle, Loader2, LineChart as LineChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectorStock, SectorData, SortField, SortOrder } from "./types";
import { PEG_API, changeColor, pegColor } from "./types";
import { SortHeader, SectionHeader, StatCard } from "./components";

export const SectorTab = memo(function SectorTab() {
  const [data, setData] = useState<SectorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTickers, setCustomTickers] = useState("");
  const [currentSector, setCurrentSector] = useState("");
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  async function fetchSector(label: string, tickers: string) {
    setLoading(true);
    setError(null);
    setCurrentSector(label);
    try {
      const resp = await fetch(`${PEG_API}/sector?tickers=${tickers}`);
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const json: SectorData = await resp.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCustomSearch() {
    const cleaned = customTickers.replace(/\s+/g, ",").replace(/，/g, ",");
    if (!cleaned) return;
    const parts = cleaned.split(",").filter((t) => t.trim());
    if (parts.length === 1) {
      setLoading(true);
      setError(null);
      setCurrentSector("检测行业中...");
      try {
        const resp = await fetch(`${PEG_API}/sector/detect?ticker=${encodeURIComponent(parts[0].trim())}`);
        const d = await resp.json();
        if (!resp.ok) throw new Error(d.error || "行业检测失败");
        await fetchSector(d.industry, d.tickers.join(","));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "行业检测失败");
        setLoading(false);
      }
      return;
    }
    const codes = parts.filter((t) => /^\d{6}$/.test(t.trim()));
    if (codes.length > 0) {
      fetchSector("自定义板块", codes.join(","));
      return;
    }
    setError("多个输入时请使用6位股票代码，或只输入单个股票代码/名称进行行业检测");
  }

  function handleSort(field: SortField) {
    if (field === sortField) {
      if (sortOrder === "asc") { setSortOrder("desc"); }
      else if (sortOrder === "desc") { setSortField(null); setSortOrder(null); }
      else { setSortOrder("asc"); }
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  function getSortedSectorStocks(raw: SectorStock[] | undefined): SectorStock[] | undefined {
    if (!raw || !sortField || !sortOrder) return raw;
    const sorted = [...raw];
    const avgPe = data?.stats.avgPe ?? 0;
    sorted.sort((a, b) => {
      let vA: number, vB: number;
      switch (sortField) {
        case "name": vA = a.name.localeCompare(b.name); vB = 0; break;
        case "ticker": vA = a.ticker.localeCompare(b.ticker); vB = 0; break;
        case "price": vA = a.price; vB = b.price; break;
        case "changePct": vA = a.changePct; vB = b.changePct; break;
        case "peTtm": vA = a.peTtm; vB = b.peTtm; break;
        case "pb": vA = a.pb; vB = b.pb; break;
        case "marketCap": vA = a.marketCap; vB = b.marketCap; break;
        case "vsSectorAvg": {
          vA = avgPe > 0 ? (a.peTtm - avgPe) / avgPe : 0;
          vB = avgPe > 0 ? (b.peTtm - avgPe) / avgPe : 0;
          break;
        }
        default: return 0;
      }
      if (sortField === "name" || sortField === "ticker") {
        return sortOrder === "asc" ? vA - vB : vB - vA;
      }
      return sortOrder === "asc" ? vA - vB : vB - vA;
    });
    return sorted;
  }

  const sortedStocks = getSortedSectorStocks(data?.stocks);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={LineChartIcon}
        title="板块 PEG 对比"
        subtitle="输入股票代码或名称，自动查找所属行业，查看板块市值前20名的 PE 分布"
      />

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            value={customTickers}
            onChange={(e) => setCustomTickers(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCustomSearch()}
            placeholder="输入股票代码或名称（自动查行业），或多个代码逗号分隔"
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
        </div>
        <button
          onClick={handleCustomSearch}
          disabled={loading || !customTickers.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          查询
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-danger/30 bg-danger/5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">
              {currentSector} — 市值前 {data.stats.count} 名
            </h3>
            <span className="text-xs text-muted-foreground">
              {new Date(data.timestamp).toLocaleTimeString("zh-CN")}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="板块平均 PE" value={`${data.stats.avgPe}x`} />
            <StatCard label="板块中位 PE" value={`${data.stats.medianPe}x`} />
            <StatCard label="覆盖股票数" value={`${data.stats.count}`} />
            <StatCard label="总市值" value={`${data.stats.totalMarketCap.toFixed(0)} 亿`} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-3 py-2.5">#</th>
                  <SortHeader field="name" label="名称" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="ticker" label="代码" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="price" label="现价" align="right" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="changePct" label="涨跌" align="right" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="peTtm" label="PE(TTM)" align="right" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="pb" label="PB" align="right" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="marketCap" label="总市值(亿)" align="right" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader field="vsSectorAvg" label="vs 板块均PE" align="right" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {(sortedStocks ?? data.stocks).map((s, i) => {
                  const vsSector = data.stats.avgPe > 0
                    ? ((s.peTtm - data.stats.avgPe) / data.stats.avgPe) * 100 : 0;
                  return (
                    <tr key={s.ticker} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground">{s.name}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{s.ticker}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{s.price.toFixed(2)}</td>
                      <td className={cn("px-3 py-2.5 text-right font-mono", changeColor(s.changePct))}>
                        {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-mono", pegColor(s.peTtm))}>
                        {s.peTtm.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{s.pb.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{s.marketCap.toFixed(0)}</td>
                      <td className={cn("px-3 py-2.5 text-right font-mono", vsSector > 0 ? "text-danger" : "text-success")}>
                        {vsSector >= 0 ? "+" : ""}{vsSector.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <LineChartIcon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-base text-muted-foreground">输入代码开始分析</p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            输入任意6位股票代码，自动查找所属行业并展示板块 PE 对比
          </p>
        </div>
      )}
    </div>
  );
});

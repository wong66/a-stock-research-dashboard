import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, RefreshCw, Plus, X } from "lucide-react";
import { Skeleton } from "@/components/common/Skeleton";
import { cn } from "@/lib/utils";
import { api, type IndexQuote, type StockQuote } from "@/lib/api";
import { toast } from "sonner";

// ── constants ──────────────────────────────────────────────────────────

const INDICES = [
  // A股 — prefixed to disambiguate index from same-numeric stock
  { code: "sh000001", label: "上证指数" },
  { code: "sh000300", label: "沪深300" },
  { code: "sz399006", label: "创业板指" },
  // 美股
  { code: "IXIC", label: "纳斯达克" },
  { code: "GSPC", label: "标普500" },
  { code: "DJI", label: "道琼斯" },
] as const;

const STORAGE_KEY_A = "vibe_trading_watchlist_a";
const STORAGE_KEY_US = "vibe_trading_watchlist_us";

// ── localStorage helpers ────────────────────────────────────────────────

function loadWatchlist(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWatchlist(key: string, codes: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(codes));
  } catch {
    /* noop — private browsing may block localStorage */
  }
}

// ── colour helpers ──────────────────────────────────────────────────────

/** Chinese convention: red = up, green = down */
function changeColor(v: number): string {
  if (v > 0) return "text-danger";
  if (v < 0) return "text-success";
  return "text-muted-foreground";
}

function changeSign(v: number): string {
  if (v > 0) return "+";
  return "";
}

// ── IndexCard ───────────────────────────────────────────────────────────

function IndexCard({
  label,
  data,
  loading,
}: {
  label: string;
  data?: IndexQuote;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-28 rounded-xl" />;
  }

  if (!data || data.error) {
    return (
      <div className="border border-danger/30 rounded-xl p-4 bg-danger/5 space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-danger/70">
          {data?.error || "加载失败"}
        </p>
      </div>
    );
  }

  const up = data.change_amt > 0;
  const down = data.change_amt < 0;

  return (
    <div className="border rounded-xl p-4 bg-card space-y-1.5">
      <p className="text-xs text-muted-foreground truncate" title={data.name}>
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums">
        {data.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
      <div className={cn("flex items-center gap-1 text-sm font-mono tabular-nums", changeColor(data.change_amt))}>
        {up ? <TrendingUp className="h-3.5 w-3.5" /> : down ? <TrendingDown className="h-3.5 w-3.5" /> : null}
        <span>{changeSign(data.change_amt)}{data.change_amt.toFixed(2)}</span>
        <span className="ml-1">({changeSign(data.change_pct)}{data.change_pct.toFixed(2)}%)</span>
      </div>
    </div>
  );
}

// ── WatchlistColumn ─────────────────────────────────────────────────────

function WatchlistColumn({
  title,
  codes,
  data,
  loading,
  onAdd,
  onRemove,
  adding,
  setAdding,
  placeholder,
}: {
  title: string;
  codes: string[];
  data: Record<string, StockQuote>;
  loading: boolean;
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  adding: boolean;
  setAdding: (v: boolean) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const confirm = () => {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return;
    if (codes.includes(trimmed)) {
      toast.error("该股票已在自选列表中");
      return;
    }
    onAdd(trimmed);
    setInput("");
    setAdding(false);
  };

  return (
    <div className="border rounded-xl p-4 space-y-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </button>
      </div>

      {/* add-input row */}
      {adding && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") {
                setInput("");
                setAdding(false);
              }
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-md border bg-background text-xs outline-none focus:border-primary"
          />
          <button
            onClick={confirm}
            className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium"
          >
            确认
          </button>
          <button
            onClick={() => {
              setInput("");
              setAdding(false);
            }}
            className="px-2 py-1.5 rounded-md border text-xs"
          >
            取消
          </button>
        </div>
      )}

      {/* list */}
      {loading && codes.length > 0 ? (
        <div className="space-y-2">
          {codes.map((c) => (
            <Skeleton key={c} className="h-8 rounded-md" />
          ))}
        </div>
      ) : codes.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 py-4 text-center">
          暂无自选，点击「添加」加入股票
        </p>
      ) : (
        <div className="space-y-1">
          {codes.map((code) => {
            const d = data[code];
            return (
              <div
                key={code}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group transition-colors"
              >
                {/* code badge */}
                <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">
                  {code}
                </span>
                {/* name */}
                <span className="text-xs flex-1 min-w-0 truncate">
                  {d && !d.error ? d.name : code}
                </span>
                {/* price + change */}
                {d && !d.error ? (
                  <>
                    <span className="text-xs font-mono tabular-nums">
                      {d.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-mono tabular-nums min-w-[5rem] text-right",
                        changeColor(d.change_pct),
                      )}
                    >
                      {changeSign(d.change_pct)}
                      {d.change_pct.toFixed(2)}%
                    </span>
                  </>
                ) : d?.error ? (
                  <span className="text-xs text-danger/70">加载失败</span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {/* remove */}
                <button
                  onClick={() => onRemove(code)}
                  className="p-0.5 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  title="移除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Overview page ───────────────────────────────────────────────────────

export function Overview() {
  const [indexData, setIndexData] = useState<Record<string, IndexQuote>>({});
  const [stockAData, setStockAData] = useState<Record<string, StockQuote>>({});
  const [stockUSData, setStockUSData] = useState<Record<string, StockQuote>>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [watchlistA, setWatchlistA] = useState<string[]>(() => loadWatchlist(STORAGE_KEY_A));
  const [watchlistUS, setWatchlistUS] = useState<string[]>(() => loadWatchlist(STORAGE_KEY_US));
  const [addingA, setAddingA] = useState(false);
  const [addingUS, setAddingUS] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const idxCodes = INDICES.map((i) => i.code);
      const res = await api.getMarketData({
        indices: idxCodes,
        stocks_a: watchlistA,
        stocks_us: watchlistUS,
      });
      setIndexData(res.indices);
      setStockAData(res.stocks_a);
      setStockUSData(res.stocks_us);
    } catch (e) {
      setError(e instanceof Error ? e.message : "行情数据获取失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [watchlistA, watchlistUS]);

  // initial load
  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // refresh when watchlist changes
  useEffect(() => {
    if (!loading) {
      fetchData(true);
    }
  }, [watchlistA, watchlistUS]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddA = (code: string) => {
    const next = [...watchlistA, code];
    setWatchlistA(next);
    saveWatchlist(STORAGE_KEY_A, next);
  };
  const handleRemoveA = (code: string) => {
    const next = watchlistA.filter((c) => c !== code);
    setWatchlistA(next);
    saveWatchlist(STORAGE_KEY_A, next);
  };
  const handleAddUS = (code: string) => {
    const next = [...watchlistUS, code];
    setWatchlistUS(next);
    saveWatchlist(STORAGE_KEY_US, next);
  };
  const handleRemoveUS = (code: string) => {
    const next = watchlistUS.filter((c) => c !== code);
    setWatchlistUS(next);
    saveWatchlist(STORAGE_KEY_US, next);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">行情总览</h1>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* global error */}
      {error && (
        <div className="text-sm text-danger border border-danger/30 rounded p-3 bg-danger/5">
          {error}
        </div>
      )}

      {/* Index cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {INDICES.map(({ code, label }) => (
          <IndexCard
            key={code}
            label={label}
            data={indexData[code]}
            loading={loading}
          />
        ))}
      </div>

      {/* Watchlist panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WatchlistColumn
          title="A股自选"
          codes={watchlistA}
          data={stockAData}
          loading={loading}
          onAdd={handleAddA}
          onRemove={handleRemoveA}
          adding={addingA}
          setAdding={setAddingA}
          placeholder="输入6位代码，如 600519"
        />
        <WatchlistColumn
          title="美股自选"
          codes={watchlistUS}
          data={stockUSData}
          loading={loading}
          onAdd={handleAddUS}
          onRemove={handleRemoveUS}
          adding={addingUS}
          setAdding={setAddingUS}
          placeholder="输入代码，如 AAPL.US 或 MSFT.US"
        />
      </div>
    </div>
  );
}

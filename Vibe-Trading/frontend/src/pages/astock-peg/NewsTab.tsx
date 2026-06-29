import { useState, useEffect, useCallback, memo } from "react";
import { RefreshCw, AlertCircle, Loader2, Newspaper, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NewsItem, NewsData } from "./types";
import { PEG_API, getTitle, getTime, getSource, getUrl, sortByTime } from "./types";
import { SectionHeader } from "./components";

// ── News Row ───────────────────────────────────────────────────────────

const NewsRow = memo(function NewsRow({ item, showTicker }: { item: NewsItem; showTicker?: boolean }) {
  const title = getTitle(item);
  const time = getTime(item);
  const source = getSource(item);
  const url = getUrl(item);

  return (
    <div className="px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-baseline gap-2">
        {showTicker && item.ticker && (
          <span className="text-[11px] font-medium text-primary shrink-0">{item.ticker}</span>
        )}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-2 flex-1"
          >
            {title}
          </a>
        ) : (
          <span className="text-sm font-medium text-foreground line-clamp-2 flex-1">{title}</span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1">
        {source && <span className="text-[11px] text-muted-foreground">{source}</span>}
        {time && <span className="text-[11px] text-muted-foreground">{time}</span>}
      </div>
    </div>
  );
});

// ── News Tab ───────────────────────────────────────────────────────────

export const NewsTab = memo(function NewsTab() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${PEG_API}/news`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      const json: NewsData = await resp.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const stockNews = data ? sortByTime(data.stock_news) : [];
  const marketNews = data ? sortByTime(data.market_news) : [];

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Newspaper}
        title="新闻公告"
        subtitle="实时采集个股新闻、市场快讯和公告信息"
      >
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-muted-foreground">
              更新于 {new Date(data.collected_at).toLocaleTimeString("zh-CN")}
            </span>
          )}
          <button
            onClick={fetchNews}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {loading ? "加载中..." : "刷新"}
          </button>
        </div>
      </SectionHeader>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-danger/30 bg-danger/5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-3 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">正在采集新闻数据，可能需要 10-30 秒...</span>
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Stock News */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                个股新闻
                <span className="ml-2 text-muted-foreground font-normal">{stockNews.length}</span>
              </h3>
            </div>
            <div className="divide-y divide-border/60 max-h-[calc(100vh-280px)] overflow-y-auto">
              {stockNews.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无个股新闻</p>
              ) : (
                stockNews.map((item, idx) => <NewsRow key={`stock-${idx}`} item={item} showTicker />)
              )}
            </div>
          </div>

          {/* Market News */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                市场快讯
                <span className="ml-2 text-muted-foreground font-normal">{marketNews.length}</span>
              </h3>
            </div>
            <div className="divide-y divide-border/60 max-h-[calc(100vh-280px)] overflow-y-auto">
              {marketNews.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无市场快讯</p>
              ) : (
                marketNews.map((item, idx) => <NewsRow key={`market-${idx}`} item={item} />)
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

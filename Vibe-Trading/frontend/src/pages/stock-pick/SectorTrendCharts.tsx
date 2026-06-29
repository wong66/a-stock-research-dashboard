/**
 * Sector trend chart components (candlestick + volume + flow).
 */
import { useState, useEffect, useMemo, useRef, memo } from "react";
import { cn } from "@/lib/utils";
import { echarts } from "@/lib/echarts";
import type { KlineItem, TopStock } from "./types";
import { formatMoney, pctColor } from "./helpers";

interface SectorTrendChartsProps {
  klineData: KlineItem[];
  topGain: TopStock[];
  topFlow: TopStock[];
  onStockClick: (code: string) => void;
}

export const SectorTrendCharts = memo(function SectorTrendCharts({
  klineData, topGain, topFlow, onStockClick,
}: SectorTrendChartsProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [listTab, setListTab] = useState<"gain" | "flow">("gain");

  // Filter kline based on period
  const displayKline = useMemo(() => {
    if (period === "day") return klineData;
    // Simulate weekly: take every 5th entry
    return klineData.filter((_, i) => i % 5 === 0);
  }, [klineData, period]);

  useEffect(() => {
    if (!chartRef.current || displayKline.length === 0) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    const dates = displayKline.map(d => d.date);
    const ohlc = displayKline.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = displayKline.map(d => d.volume);
    const flows = displayKline.map(d => d.mainFlow);

    // Calculate MAs
    const calcMA = (n: number) => {
      const result: (number | null)[] = [];
      for (let i = 0; i < displayKline.length; i++) {
        if (i < n - 1) { result.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < n; j++) sum += displayKline[i - j].close;
        result.push(+(sum / n).toFixed(2));
      }
      return result;
    };

    const option = {
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      grid: [
        { left: "8%", right: "8%", top: "6%", height: "48%" },
        { left: "8%", right: "8%", top: "60%", height: "16%" },
        { left: "8%", right: "8%", top: "80%", height: "14%" },
      ],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, axisLabel: { show: false } },
        { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false } },
        { type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 10, rotate: 30 } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, splitLine: { lineStyle: { color: "#e5e7eb", type: "dashed" } } },
        { type: "value", gridIndex: 1, splitLine: { show: false }, axisLabel: { show: false } },
        { type: "value", gridIndex: 2, splitLine: { show: false }, axisLabel: { fontSize: 10 } },
      ],
      series: [
        {
          type: "candlestick", data: ohlc, xAxisIndex: 0, yAxisIndex: 0,
          itemStyle: {
            color: "#ef4444", color0: "#22c55e",
            borderColor: "#ef4444", borderColor0: "#22c55e",
          },
          markLine: { silent: true, symbol: "none", data: [] },
        },
        { type: "line", data: calcMA(5), xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { color: "#f59e0b", width: 1 }, symbol: "none", name: "MA5" },
        { type: "line", data: calcMA(10), xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { color: "#3b82f6", width: 1 }, symbol: "none", name: "MA10" },
        { type: "line", data: calcMA(20), xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { color: "#8b5cf6", width: 1 }, symbol: "none", name: "MA20" },
        {
          type: "bar", data: volumes, xAxisIndex: 1, yAxisIndex: 1,
          itemStyle: {
            color: (params: { dataIndex?: number }) => {
              const idx = params.dataIndex;
              if (idx === undefined) return "#e5e7eb";
              return ohlc[idx]?.[1] >= ohlc[idx]?.[0] ? "#ef4444" : "#22c55e";
            },
          },
        },
        {
          type: "line", data: flows, xAxisIndex: 2, yAxisIndex: 2,
          smooth: true, symbol: "none",
          lineStyle: { color: "#f59e0b", width: 1.5 },
          areaStyle: { color: "rgba(245,158,11,0.1)" },
          name: "主力净流入",
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [displayKline]);

  const listData = listTab === "gain" ? topGain : topFlow;

  return (
    <div className="flex gap-3">
      {/* Chart area */}
      <div className="flex-1 min-w-0 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["day", "week"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "day" ? "日K" : "周K"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            MA5 <span className="text-amber-500 font-bold">●</span>{" "}
            MA10 <span className="text-blue-500 font-bold">●</span>{" "}
            MA20 <span className="text-purple-500 font-bold">●</span>
          </span>
        </div>
        <div ref={chartRef} className="w-full" style={{ height: 400 }} />
      </div>

      {/* Ranking panel */}
      <div className="w-64 shrink-0 rounded-xl border bg-card p-4 flex flex-col">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mb-3">
          {(["gain", "flow"] as const).map(t => (
            <button
              key={t}
              onClick={() => setListTab(t)}
              className={cn(
                "flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                listTab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "gain" ? "涨幅榜 Top5" : "资金流入榜 Top5"}
            </button>
          ))}
        </div>
        <div className="space-y-1 flex-1">
          {listData.map(stock => (
            <button
              key={stock.code}
              onClick={() => onStockClick(stock.code)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                stock.rank <= 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {stock.rank}
              </span>
              <span className="text-sm font-medium truncate flex-1">{stock.name}</span>
              {listTab === "gain" ? (
                <span className={cn("text-xs font-mono font-medium", pctColor(stock.changePct ?? 0))}>
                  {(stock.changePct ?? 0) > 0 ? "+" : ""}{(stock.changePct ?? 0).toFixed(2)}%
                </span>
              ) : (
                <span className={cn("text-xs font-mono", (stock.mainInflow ?? 0) > 0 ? "text-danger" : "text-success")}>
                  {formatMoney(stock.mainInflow ?? 0)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

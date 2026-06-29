/**
 * Sector dashboard cards component.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { SectorDashboardData } from "./types";
import { pctColor } from "./helpers";

interface SectorDashboardProps {
  data: SectorDashboardData | null;
  loading: boolean;
}

export const SectorDashboard = memo(function SectorDashboard({ data, loading }: SectorDashboardProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 h-28 animate-pulse">
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="h-6 w-24 bg-muted rounded mb-2" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "板块当日表现",
      main: (
        <span className={cn("text-2xl font-bold", pctColor(data.changePct))}>
          {data.changePct > 0 ? "+" : ""}{data.changePct.toFixed(2)}%
        </span>
      ),
      sub: (
        <span className={pctColor(data.changeAmt)}>
          {data.changeAmt > 0 ? "+" : ""}{data.changeAmt.toFixed(2)}
        </span>
      ),
    },
    {
      label: "涨跌家数",
      main: (
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="text-danger">{data.limitUpCount}涨停</span>
          <span className="text-danger">{data.upCount}↑</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-success">{data.downCount}↓</span>
          <span className="text-success">{data.limitDownCount}跌停</span>
        </div>
      ),
      sub: <span className="text-muted-foreground text-xs">上涨 {data.upCount} / 下跌 {data.downCount}</span>,
    },
    {
      label: "主力资金流向",
      main: (
        <span className={cn("text-2xl font-bold", data.mainInflow > 0 ? "text-danger" : "text-success")}>
          {data.mainInflow > 0 ? "+" : ""}{data.mainInflow.toFixed(1)}亿
        </span>
      ),
      sub: (
        <span className={pctColor(data.mainInflowMom)}>
          环比 {data.mainInflowMom > 0 ? "+" : ""}{data.mainInflowMom.toFixed(1)}%
        </span>
      ),
    },
    {
      label: "板块成交额",
      main: (
        <span className="text-2xl font-bold text-foreground">
          {data.totalVolume.toFixed(0)}亿
        </span>
      ),
      sub: (
        <span className={pctColor(data.volumeMom)}>
          较昨日 {data.volumeMom > 0 ? "+" : ""}{data.volumeMom.toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <div>{c.main}</div>
          <div>{c.sub}</div>
        </div>
      ))}
    </div>
  );
});

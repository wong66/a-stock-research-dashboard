import { useState } from "react";
import { BarChart3, Activity, LineChart as LineChartIcon, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabKey } from "./astock-peg/types";
import { DashboardTab } from "./astock-peg/DashboardTab";
import { AnalysisTab } from "./astock-peg/AnalysisTab";
import { SectorTab } from "./astock-peg/SectorTab";
import { NewsTab } from "./astock-peg/NewsTab";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "自选行情", icon: BarChart3 },
  { key: "analysis", label: "PEG 分析", icon: Activity },
  { key: "sector", label: "板块对比", icon: LineChartIcon },
  { key: "news", label: "新闻公告", icon: Newspaper },
];

export function AstockPeg() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "analysis" && <AnalysisTab />}
      {tab === "sector" && <SectorTab />}
      {tab === "news" && <NewsTab />}
    </div>
  );
}

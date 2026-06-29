import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTORS } from "./ai-compute/types";
import { IndustryOverview } from "./ai-compute/IndustryOverview";
import { ReportLibrary } from "./ai-compute/ReportLibrary";
import { SectorTemplate } from "./ai-compute/SectorTemplate";

export function AICompute() {
  const [activeTab, setActiveTab] = useState(0);
  const isOverview = activeTab === 0;
  const currentSector = SECTORS[activeTab];
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">AI 算力板块</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted transition-colors text-sm disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* Tab bar */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max">
          {SECTORS.map((sector, idx) => (
            <button
              key={sector.key}
              onClick={() => setActiveTab(idx)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                idx === activeTab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {sector.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isOverview ? (
        <IndustryOverview />
      ) : currentSector.key === "reports" ? (
        <ReportLibrary key={refreshKey} />
      ) : (
        <SectorTemplate label={currentSector.label} sectorKey={currentSector.key} />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, memo } from "react";
import { Calendar, Building2, FileText, Tag, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type IndustryReport } from "@/lib/api";

const REPORT_SECTORS = ["全部", "AI算力", "算力芯片", "HBM", "光模块", "PCB", "交换芯片", "液冷散热", "MLCC", "玻璃基板"] as const;

const SECTOR_COLORS: Record<string, string> = {
  "AI算力": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "算力芯片": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "HBM": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "光模块": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "PCB": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "交换芯片": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  "液冷散热": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "MLCC": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "玻璃基板": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

export const ReportLibrary = memo(function ReportLibrary() {
  const [reports, setReports] = useState<IndustryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("全部");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getIndustryReports("ai-compute");
      if (res.error) {
        setError(res.error);
      } else {
        setReports(res.reports);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "研报数据获取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === "全部"
    ? reports
    : reports.filter((r) => r.sector === filter);

  return (
    <div className="space-y-4">
      {/* sector filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">筛选：</span>
        {REPORT_SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            {s}
            {s !== "全部" && (
              <span className="ml-1 opacity-60">
                {reports.filter((r) => r.sector === s).length}
              </span>
            )}
          </button>
        ))}
        <span className="text-xs text-muted-foreground/60 ml-auto">
          共 {reports.length} 篇
        </span>
      </div>

      {/* error */}
      {error && (
        <div className="text-sm text-danger border border-danger/30 rounded-lg p-3 bg-danger/5">
          {error}
        </div>
      )}

      {/* table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 py-12 text-center">
          {filter === "全部" ? "暂无研报数据" : `暂无「${filter}」方向的研报`}
        </p>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium w-[6rem]">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      日期
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium w-[7rem]">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      机构
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      标题
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium w-[5rem]">
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      环节
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r, i) => (
                  <tr
                    key={`${r.infoCode}-${i}`}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {r.publishDate}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {r.orgSName}
                    </td>
                    <td className="px-4 py-2.5 text-xs min-w-[300px]">
                      <a
                        href={`https://data.eastmoney.com/report/zw_industry.jshtml?infocode=${r.infoCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary transition-colors flex items-start gap-1 group/link"
                      >
                        <span className="flex-1">{r.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-0 group-hover/link:opacity-100 transition-opacity text-muted-foreground" />
                      </a>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full font-medium",
                          SECTOR_COLORS[r.sector] || "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.sector}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* footer */}
      <p className="text-xs text-muted-foreground/50 text-center">
        数据来源：东方财富研报平台，近三个月行业研报
      </p>
    </div>
  );
});

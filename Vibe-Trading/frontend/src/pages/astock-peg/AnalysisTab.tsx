import { useState, useEffect, useCallback, useRef, memo } from "react";
import { TrendingUp, Activity, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnalysisRecord } from "./types";
import { PEG_API, statusLabel, pegRatingBadge } from "./types";
import { SectionHeader } from "./components";

export const AnalysisTab = memo(function AnalysisTab() {
  const [ticker, setTicker] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentReport, setCurrentReport] = useState<AnalysisRecord | null>(null);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const resp = await fetch(`${PEG_API}/analysis`);
      if (resp.ok) {
        const data: AnalysisRecord[] = await resp.json();
        setHistory(data.sort((a, b) => b.date.localeCompare(a.date)));
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${PEG_API}/analysis/${id}`);
      if (!resp.ok) return;
      const data: AnalysisRecord = await resp.json();
      setCurrentReport(data);
      if (data.status === "completed" || data.status === "failed") {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        loadHistory();
      }
    } catch { /* noop */ }
  }, [loadHistory]);

  useEffect(() => {
    if (!currentId) return;
    pollStatus(currentId);
    pollingRef.current = setInterval(() => pollStatus(currentId), 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [currentId, pollStatus]);

  async function handleSubmit() {
    if (!ticker || ticker.length !== 6) return;
    setSubmitting(true);
    setError(null);
    setCurrentReport(null);
    try {
      const resp = await fetch(`${PEG_API}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "提交失败");
      setCurrentId(data.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handleViewHistory(record: AnalysisRecord) {
    setCurrentId(record.id);
    setCurrentReport(null);
  }

  const st = currentReport ? statusLabel(currentReport.status) : null;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Activity}
        title="PEG 个股分析"
        subtitle="输入代码后系统将采集行情+研报+财务数据，AI 生成 PEG 估值分析报告"
      />

      {/* Input */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="输入6位股票代码"
          maxLength={6}
          className="px-4 py-2 text-sm font-mono rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none w-48"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || ticker.length !== 6}
          className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
          {submitting ? "提交中..." : "开始 PEG 分析"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {/* Current report */}
      {currentReport && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-semibold text-foreground">
              {currentReport.name || currentReport.ticker}
              <span className="ml-2 text-xs font-mono text-muted-foreground">{currentReport.ticker}</span>
            </h3>
            <span className={cn("px-2 py-0.5 text-[11px] font-semibold rounded border", st!.className,
              "border-current")}>
              {st!.text}
            </span>
            {currentReport.pegRating && (() => {
              const badge = pegRatingBadge(currentReport.pegRating);
              if (!badge) return null;
              return (
                <span className={cn("px-2 py-0.5 text-[11px] font-semibold rounded border border-current", badge.className)}>
                  PEG: {badge.text}
                </span>
              );
            })()}
          </div>

          {(currentReport.status === "collecting" || currentReport.status === "analyzing") && (
            <div className="flex items-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {currentReport.status === "collecting" ? "正在采集股票数据..." : "AI 正在生成 PEG 分析报告..."}
              </span>
            </div>
          )}

          {currentReport.status === "failed" && (
            <div className="py-4 px-4 rounded-lg border border-danger/30 bg-danger/5 text-sm text-danger">
              分析失败: {currentReport.error || "未知错误"}
            </div>
          )}

          {currentReport.report && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1" />
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出
                </button>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 mb-4 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ 以下内容由 AI 自动生成，仅供学习研究与技术演示，不构成任何投资建议。投资有风险，决策请咨询持牌专业机构。
              </div>
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {currentReport.report}
                </Markdown>
              </article>
            </>
          )}
        </div>
      )}

      {/* History */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">历史分析</h3>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">暂无历史分析记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">日期</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">代码</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">名称</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">PEG评级</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">状态</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">结论</th>
                  <th className="text-center font-medium text-muted-foreground px-4 py-2.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const s = statusLabel(r.status);
                  const badge = pegRatingBadge(r.pegRating);
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.date}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.ticker}</td>
                      <td className="px-4 py-2.5 text-foreground">{r.name || "--"}</td>
                      <td className="px-4 py-2.5">
                        {badge ? <span className={cn("text-xs font-medium", badge.className)}>{badge.text}</span>
                               : <span className="text-xs text-muted-foreground/60">--</span>}
                      </td>
                      <td className="px-4 py-2.5"><span className={s.className}>{s.text}</span></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">{r.conclusion || "--"}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.status === "completed" && (
                          <button
                            onClick={() => handleViewHistory(r)}
                            className="text-primary hover:underline text-xs px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                          >
                            查看
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

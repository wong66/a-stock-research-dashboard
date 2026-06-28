// ── Stock Board 辅助函数 ─────────────────────────────────────────
// 从 StockBoard.tsx 提取的纯函数，用于格式化显示

/**
 * 根据涨跌幅返回对应的 CSS 类名（中国股市：涨红跌绿）
 */
export function changeColor(v: number): string {
  if (v > 0) return "text-danger";
  if (v < 0) return "text-success";
  return "text-muted-foreground";
}

/**
 * 根据 YoY 值返回对应的 CSS 类名（用于增长率显示）
 */
export function yoyColorClass(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground/60";
  if (v > 0) return "text-danger font-medium";
  if (v < 0) return "text-success font-medium";
  return "text-muted-foreground";
}

/**
 * 格式化价格显示（根据价格大小自动调整精度）
 */
export function fmtPrice(p: number): string {
  if (!isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return p.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

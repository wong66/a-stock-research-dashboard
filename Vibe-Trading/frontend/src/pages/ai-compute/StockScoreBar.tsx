import { memo } from "react";

export const StockScoreBar = memo(function StockScoreBar({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  const numeric = typeof value === "number" ? value : 0;
  const pct = Math.max(0, Math.min(100, (numeric / 5) * 100));
  const isPlaceholder = typeof value === "string";

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-muted-foreground w-[4.5rem] shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-muted border overflow-hidden">
        {!isPlaceholder && (
          <div
            className="h-full rounded-full bg-primary/70 transition-all"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/50 w-7 shrink-0 text-right">
        {isPlaceholder ? "—" : `${numeric}/5`}
      </span>
    </div>
  );
});

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortField, SortOrder } from "./types";

// ── Sortable Table Header ───────────────────────────────────────────────

export function SortHeader({
  field, label, align = "left", currentField, currentOrder, onSort,
}: {
  field: SortField;
  label: string;
  align?: "left" | "right" | "center";
  currentField: SortField | null;
  currentOrder: SortOrder | null;
  onSort: (f: SortField) => void;
}) {
  const isActive = currentField === field;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={cn(
        "font-medium text-muted-foreground px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors",
        alignClass,
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && currentOrder === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
        {isActive && currentOrder === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
        {!isActive && <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}

// ── Section Header ─────────────────────────────────────────────────────

export function SectionHeader({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold text-foreground mt-1">{value}</div>
    </div>
  );
}

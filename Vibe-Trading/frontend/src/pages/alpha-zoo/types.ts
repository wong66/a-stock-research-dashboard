/**
 * AlphaZoo page types and constants.
 */

export interface ZooCard {
  id: string;
  title: string;
  description: string;
  approxCount: number;
  accent: string;
}

// IMPORTANT: The Kakushadze 101 zoo must use the author's name as the label.
// The legacy / trademark name is forbidden by a CI grep gate — do not add it.
export const ZOO_CARDS: ZooCard[] = [
  {
    id: "qlib158",
    title: "Qlib 158",
    description:
      "微软 Qlib 完整 158 特征库，覆盖动量、波动率、成交量和滚动统计信号。",
    approxCount: 154,
    accent: "from-sky-500/20 to-sky-500/5",
  },
  {
    id: "alpha101",
    title: "Kakushadze 101 公式化因子",
    description:
      "来自 Kakushadze (2015) 的 101 个公式化因子；短周期截面信号。",
    approxCount: 101,
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    id: "gtja191",
    title: "国泰君安 191",
    description:
      "国泰君安 191 因子；面向 A 股市场优化的技术与微观结构信号。",
    approxCount: 191,
    accent: "from-amber-500/20 to-amber-500/5",
  },
  {
    id: "academic",
    title: "学术异象",
    description:
      "精选学术文献中的长周期异象（价值、动量、质量、低波动等）。",
    approxCount: 6,
    accent: "from-violet-500/20 to-violet-500/5",
  },
];

export const UNIVERSE_OPTIONS = [
  { value: "csi300", label: "沪深 300（A 股）" },
  { value: "sp500", label: "标普 500（美股）" },
  { value: "btc-usdt", label: "BTC-USDT（加密货币）" },
];

export const PAGE_SIZE = 50;

/* ---------- Helpers ---------- */

export function fmtNum(v: unknown, digits = 3): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function parseAlphaIds(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

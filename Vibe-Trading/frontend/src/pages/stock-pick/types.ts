/**
 * StockPick page types and constants.
 */
import {
  Shield, TrendingUp, Gem, Target, Zap, Rocket,
} from "lucide-react";

/* ---------- Types ---------- */

export interface SectorDashboardData {
  changePct: number;
  changeAmt: number;
  upCount: number;
  limitUpCount: number;
  downCount: number;
  limitDownCount: number;
  mainInflow: number;
  mainInflowMom: number;
  totalVolume: number;
  volumeMom: number;
}

export interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  mainFlow: number;
}

export interface TopStock {
  rank: number;
  code: string;
  name: string;
  changePct?: number;
  mainInflow?: number;
}

export interface StockScore {
  mainlineStrength: number;
  productPurity: number;
  fundTrend: number;
  earningsSupport: number;
}

export interface PickStock {
  code: string;
  name: string;
  concepts: string[];
  allConcepts: string[];
  scores: StockScore;
  grade: "A" | "B";
  changePct: number;
  mainInflow: number;
  tags: string[];
  logicLabels: string[];
  scoreDetails: {
    radarData: { name: string; value: number; max: number }[];
    volumeAnalysis: string;
    breakthroughCheck: string;
    fundamentalBrief: string;
  };
}

/* ---------- Constants ---------- */

export const HOT_SECTORS = [
  "半导体", "AI算力", "新能源", "军工", "医药", "消费电子", "机器人", "油气",
];

export const LOGIC_LABELS = [
  { key: "domestic_sub", label: "国产替代", icon: Shield, color: "#3b82f6" },
  { key: "demand_upgrade", label: "需求升级", icon: TrendingUp, color: "#f59e0b" },
  { key: "strategic_revalue", label: "战略重估", icon: Gem, color: "#8b5cf6" },
  { key: "earnings_deliver", label: "业绩兑现", icon: Target, color: "#10b981" },
  { key: "fund_cluster", label: "资金抱团", icon: Zap, color: "#ef4444" },
  { key: "position_structure", label: "位置结构", icon: Rocket, color: "#06b6d4" },
];

export const AUX_FILTERS = [
  { key: "volume_20d", label: "20日量价筛选" },
  { key: "breakout_5d", label: "5日突破筛选" },
  { key: "fundamental", label: "基本面门槛" },
  { key: "exclude_risk", label: "排除风险标的" },
];

export const DEFAULT_THRESHOLDS = {
  mainlineStrength: 70,
  productPurity: 60,
  fundTrend: 60,
  earningsSupport: 50,
};

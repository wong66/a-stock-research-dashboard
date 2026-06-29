/**
 * AICompute page types and sector definitions.
 */

export interface SectorDef {
  key: string;
  label: string;
}

export const SECTORS: SectorDef[] = [
  { key: "overview", label: "总览" },
  { key: "ai_chip", label: "算力芯片" },
  { key: "hbm", label: "HBM" },
  { key: "optical_module", label: "光模块" },
  { key: "pcb", label: "PCB" },
  { key: "switch_chip", label: "交换芯片" },
  { key: "liquid_cooling", label: "液冷散热" },
  { key: "mlcc", label: "MLCC" },
  { key: "glass_substrate", label: "玻璃基板" },
  { key: "reports", label: "研报库" },
];

/* ---------- Score bar data per sector ---------- */

export interface ScoreBarItem {
  company: string;
  ticker: string;
  score: number;
  label: string;
  logic: string;
}

export const SCORE_BAR_DATA: Record<string, ScoreBarItem[]> = {
  ai_chip: [
    { company: "寒武纪", ticker: "688256.SH", score: 95, label: "国产 GPU 龙头", logic: "国产替代" },
    { company: "海光信息", ticker: "688041.SH", score: 90, label: "国产 x86 GPU", logic: "国产替代" },
    { company: "景嘉微", ticker: "300474.SZ", score: 82, label: "军工 GPU", logic: "军民融合" },
    { company: "龙芯中科", ticker: "688047.SH", score: 75, label: "自主指令集", logic: "国产替代" },
    { company: "左江科技", ticker: "300799.SZ", score: 68, label: "DPU 芯片", logic: "新产品线" },
  ],
  hbm: [
    { company: "长电科技", ticker: "600584.SH", score: 92, label: "先进封装龙头", logic: "产能扩张" },
    { company: "通富微电", ticker: "002156.SZ", score: 88, label: "CoWoS 封装", logic: "技术突破" },
    { company: "深科技", ticker: "000021.SZ", score: 78, label: "存储封测", logic: "产能扩张" },
    { company: "华天科技", ticker: "002185.SZ", score: 72, label: "封测龙头", logic: "国产替代" },
  ],
  optical_module: [
    { company: "中际旭创", ticker: "300308.SZ", score: 96, label: "800G 光模块全球龙头", logic: "业绩兑现" },
    { company: "新易盛", ticker: "300502.SZ", score: 90, label: "800G 量产", logic: "业绩兑现" },
    { company: "天孚通信", ticker: "300394.SZ", score: 85, label: "光器件龙头", logic: "产业链受益" },
    { company: "光迅科技", ticker: "002281.SZ", score: 70, label: "光芯片", logic: "国产替代" },
  ],
};

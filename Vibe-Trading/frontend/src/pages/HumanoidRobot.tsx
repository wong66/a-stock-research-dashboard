import { useState, useEffect, useCallback } from "react";
import { ChevronRight, RefreshCw, Bot, Factory, Gem, Wrench, Zap, Gauge, Hand, Drill, Cog, Shield, BarChart3, TrendingUp, FileText, Calendar, Building2, Tag, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type IndustryReport } from "@/lib/api";

// ── sector data ──────────────────────────────────────────────────────────

interface SectorDef {
  key: string;
  label: string;
}

const SECTORS: SectorDef[] = [
  { key: "overview", label: "总览" },
  { key: "harmonic_reducer", label: "谐波减速器" },
  { key: "planetary_roller_screw", label: "行星滚柱丝杠" },
  { key: "frameless_motor", label: "无框力矩电机" },
  { key: "six_axis_sensor", label: "六维力传感器" },
  { key: "dexterous_hand", label: "灵巧手" },
  { key: "ball_screw", label: "滚珠丝杠" },
  { key: "reports", label: "研报库" },
];

// ── StockScoreBar ───────────────────────────────────────────────────────

interface SectorContent {
  positioning: string;        // 环节定位
  intlLandscape: string;       // 国际竞争格局
  domLandscape: string;        // 国内竞争格局
  techBarrier: string;         // 科技壁垒
  capacityBarrier: string;     // 产能壁垒
}

const SECTOR_CONTENT: Record<string, SectorContent> = {
  harmonic_reducer: {
    positioning:
      "旋转关节核心传动部件，负责将电机高速低扭矩转换为低速高扭矩输出，适配小臂腕部等轻载精密场景。" +
      "单台人形机器人用量 10–20 台（特斯拉 Optimus 20 台），占整机 BOM 成本约 8–12%。",
    intlLandscape:
      "日本哈默纳科（Harmonic Drive）全球市占率约 58%，长期垄断高端市场，核心专利布局严密。" +
      "日系（哈默纳科 + Nidec-Shimpo）合计占全球 70% 以上。",
    domLandscape:
      "绿的谐波全球第二（12–15%），国产绝对龙头。中大力德、来福机器人、同川科技等快速追赶。" +
      "2025 年内资国内市占率首次过半。哈默纳科核心专利陆续到期，国产替代窗口明确打开。",
    techBarrier:
      "柔轮精密加工需微米级精度，热处理工艺直接影响寿命与精度保持性。" +
      "从研发到稳定量产需 5–8 年积累。材料（特种钢材 + 精密轴承）纯度与疲劳寿命要求极高。",
    capacityBarrier:
      "自研设备能力决定扩产速度——核心加工设备（高精度磨齿机等）长期依赖进口。" +
      "绿的谐波已实现五轴加工中心、数控系统、检测设备自研突破，产能瓶颈逐步打开。",
  },
  planetary_roller_screw: {
    positioning:
      "线性关节核心传动部件，将旋转运动转换为直线运动，是人形机器人大腿/大臂等高负载关节的不可替代部件。" +
      "价值量占整机 BOM 约 19%，为单一零部件中价值量最高的环节。单台 Optimus 14 根。承载力为滚珠丝杠 3–6 倍，寿命 10–15 倍。",
    intlLandscape:
      "欧洲企业主导全球约 80% 份额：瑞士 Rollvis / GSA、瑞典/德国 Ewellix (Schaeffler)、德国 Bosch Rexroth。" +
      "欧美企业长期垄断高端行星滚柱丝杠市场。",
    domLandscape:
      "国产化率仅约 20%，是人形机器人产业链中替代空间最大的环节。" +
      "恒立液压（定增 15 亿布局）、北特科技（特斯拉链送样）、五洲新春（98 万套产能规划）为第一梯队。" +
      "2026–2028 年为国产替代关键窗口期。",
    techBarrier:
      "内螺纹精密磨削为最大瓶颈——大长径比螺母磨削时砂轮磨杆极易颤振，严重影响精度。" +
      "正向研发设计涉及啮合理论、多体接触力学、材料科学等多学科交叉。",
    capacityBarrier:
      "高端磨床被欧日出口管制，进口难度大、交付周期长。" +
      "国产螺纹磨床精度逐步跟上但核心部件仍有差距。产能规模化释放仍需设备自主突破。",
  },
  frameless_motor: {
    positioning:
      "旋转/线性关节的动力源，取消外壳与轴承仅保留定转子，实现高扭矩密度与紧凑设计。" +
      "单台 Optimus 28 个执行器均搭载无框力矩电机。2026 年全球人形机器人电机市场空间约 39 亿元，2030 年有望达 918 亿元（CAGR 120%）。",
    intlLandscape:
      "Kollmorgen（美，开创者）、TQ RoboDrive（德，DLR 航天技术）、Nidec（日，特斯拉核心供应商）主导高端。" +
      "Maxon（瑞士）、Faulhaber（德）垄断空心杯电机全球 60%+ 份额。",
    domLandscape:
      "雷赛智能（无框 30 万台/年 + 空心杯 12 万台/年产能）、步科股份（第四代 + 一体化方案）、" +
      "汇川技术（伺服国内市占率第一 30.1%）、伟创电气（产品矩阵最完整）。国产价格仅为海外 50–70%，核心参数已追平。",
    techBarrier:
      "市场普遍低估壁垒——'高扭矩密度–低转矩波动–强过载能力'不可能三角。" +
      "灵巧手场景转矩波动需控制在 2% 以内。需在毫米级空间实现多参数极致平衡。空心杯电机核心专利多被海外垄断。",
    capacityBarrier:
      "量产一致性与良品率控制为核心考验。竞争焦点已从技术突破转向成本控制与规模化交付能力。" +
      "国产厂商凭借响应速度与头部整机厂深度协同，正加速蚕食海外份额。",
  },
  six_axis_sensor: {
    positioning:
      "力觉感知核心，同时测量 Fx/Fy/Fz/Mx/My/Mz 六个分量，用于精密力控装配与灵巧操作。" +
      "单台机器人 4–6 颗（腕部 + 踝部）。2030 年全球需求 232 万套（东吴证券），市场空间 328 亿元。产业链价值排序：丝杠 > 六维力 > 无框力矩电机 > 减速器 > 空心杯。",
    intlLandscape:
      "ATI（美，精度标杆）、Schunk（德）、Kistler（瑞士）、FANUC（日）、Bota Systems（瑞士）为海外龙头。" +
      "海外单价约 10 万元/颗，成本高企限制大规模商用。",
    domLandscape:
      "2025 年内资市占率 58.8%，首次反超外资。坤维科技（国内机器人领域 >50%）、宇立仪器（拓展欧美）、" +
      "柯力传感（送样 50 家本体厂）。国产单价约 2.7 万元/颗，性价比优势显著。",
    techBarrier:
      "弹性体结构设计与多维力解耦为最核心难点——维间耦合解耦技术难度极高。" +
      "标定精度、长期漂移/温漂控制、抗电磁干扰、高带宽低时延均为关键挑战。标定设备自研能力本身也是壁垒。",
    capacityBarrier:
      "高成本与可靠性仍是量产瓶颈。冲击工况过载保护与高循环标定一致性要求极高。" +
      "应变片粘贴工艺、封装工艺的良率控制决定产能天花板。从实验室到量产线需工艺体系重构。",
  },
  dexterous_hand: {
    positioning:
      "机器人末端执行器，物理世界交互接口，直接决定机器人的操作能力上限。" +
      "技术路线三足鼎立：直驱（高精度）、连杆（低成本）、腱绳（高自由度仿生）。" +
      "特斯拉 Optimus 三代预计 2026Q1 发布，全球高自由度灵巧手市场灵心巧手市占率超 80%。",
    intlLandscape:
      "Shadow Robot（英）、Schunk（德）为传统海外龙头，但在高自由度灵巧手领域已被中国企业超越。" +
      "整机厂自研：特斯拉 Optimus、智元 OmniHand、宇树 Dex5 各有技术方案。",
    domLandscape:
      "灵心巧手（全球高自由度份额 >80%，月交付破千台，全球最轻量产手 370g）、" +
      "因时机器人（2025 年交付破万台，全栈自研）、帕西尼感知（触觉传感器壁垒，估值破百亿）。兆威机电 ZWHAND B20 直驱方案。",
    techBarrier:
      "触觉感知为最大短板——现有灵巧手'能抓不会摸'。实验室高精度传感器单价高达 10 万元，消费级指尖 BOM 需控制在百元级。" +
      "腱绳材料成本高（钨丝腱绳 160 万次寿命但单套万元+）。'高出力–高精度–轻量化'不可能三角。",
    capacityBarrier:
      "精密装配仍依赖人工，软硬件接口碎片化，缺乏统一测试标准。" +
      "多技术融合（电容/压电/压阻/光学/霍尔）+ 感控一体是量产前提。产业链从'能用'到'会用'再到'会学'的范式跃迁尚未完成。",
  },
  ball_screw: {
    positioning:
      "相对于行星滚柱丝杠，滚珠丝杠承载力与寿命较低但成本更低、技术更成熟，适用于灵巧手微型化和中低负载关节。" +
      "单台机器人灵巧手用量 12–50 根微型滚珠丝杠。2025 年全球人形机器人滚珠丝杠市场约 18.5 亿元。",
    intlLandscape:
      "日本 THK、NSK，中国台湾上银、银泰主导中高端精密丝杠市场，日台合计全球约 60%+。" +
      "欧美在高端机床丝杠领域仍有深厚积累。",
    domLandscape:
      "恒立液压（定增布局年产 10.4 万根标准滚珠丝杠产能）、南方精工（获优必选 Walker S 订单，单机 14 个）、" +
      "江苏雷利（丝杠模组集成方案，成本较行业低 20%）。国产化速度快于行星滚柱丝杠。",
    techBarrier:
      "精密螺纹磨削为核心工艺，大长径比 / 大螺旋角加工难度高。但与行星滚柱丝杠相比，滚珠丝杠技术成熟度更高，" +
      "壁垒相对较低。高端丝杠精度等级（C0–C1 级）仍由日台把控。",
    capacityBarrier:
      "高端磨床进口限制同样存在。规模化下的精度一致性与良品率控制是产能释放关键。" +
      "国产磨床精度逐步跟上，但在超高精度等级仍有差距。",
  },
};

// ── Stock-level data ────────────────────────────────────────────────────

interface StockScoreEntry {
  code: string;
  name: string;
  irreplaceability: number; // 1-5 不可替代性
  valuation: number;         // 1-5 估值吸引力（5=低估值）
  performance: number;       // 1-5 业绩增长
  customer: number;          // 1-5 客户质量
  management: number;        // 1-5 管理层
  overall: string;           // 综合评分
  note: string;              // 备注
}

const SECTOR_STOCKS: Record<string, StockScoreEntry[]> = {
  harmonic_reducer: [
    {
      code: "688017", name: "绿的谐波",
      irreplaceability: 5, valuation: 1, performance: 5, customer: 5, management: 5,
      overall: "★★★★★", note: "谐波全球第二，特斯拉 Optimus 独家供应商，在手订单超48亿",
    },
    {
      code: "002472", name: "双环传动",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 4, management: 4,
      overall: "★★★★", note: "RV+谐波双线布局，汽车齿轮基本盘稳健，特斯拉/比亚迪链",
    },
    {
      code: "002896", name: "中大力德",
      irreplaceability: 4, valuation: 2, performance: 3, customer: 3, management: 3,
      overall: "★★★★", note: "RV+谐波+行星三轮驱动，国产第二梯队领先，优必选/埃斯顿客户",
    },
    {
      code: "688160", name: "步科股份",
      irreplaceability: 3, valuation: 3, performance: 5, customer: 4, management: 4,
      overall: "★★★", note: "无框力矩电机国内龙头，减速器配套补充，小米/优必选深度绑定",
    },
  ],
  planetary_roller_screw: [
    {
      code: "601100", name: "恒立液压",
      irreplaceability: 5, valuation: 5, performance: 4, customer: 5, management: 5,
      overall: "★★★★★", note: "定增15亿布局丝杠，特斯拉最大供应商(份额≥70%)，远期百万套产能",
    },
    {
      code: "603009", name: "北特科技",
      irreplaceability: 4, valuation: 3, performance: 3, customer: 3, management: 3,
      overall: "★★★★", note: "汽车转向齿条工艺同源，行星滚柱丝杠送样特斯拉链，进度领先",
    },
    {
      code: "603667", name: "五洲新春",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 3, management: 4,
      overall: "★★★★", note: "定增98万套行星滚柱丝杠产能规划，规模最大，已入头部机器人供应链",
    },
    {
      code: "300100", name: "双林股份",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★", note: "收购科之鑫掌握螺纹磨床，反向式丝杠突破，特斯拉二级供应链",
    },
  ],
  frameless_motor: [
    {
      code: "002979", name: "雷赛智能",
      irreplaceability: 5, valuation: 2, performance: 5, customer: 5, management: 5,
      overall: "★★★★★", note: "无框电机年产能30万台，灵巧手已批量供应，覆盖80%国内机器人厂商",
    },
    {
      code: "688160", name: "步科股份",
      irreplaceability: 5, valuation: 3, performance: 5, customer: 4, management: 4,
      overall: "★★★★★", note: "无框力矩电机国内龙头，Q1出货+246%，第四代产品+氮化镓驱动",
    },
    {
      code: "300124", name: "汇川技术",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 4, management: 5,
      overall: "★★★★", note: "伺服国内市占率第一(30.1%)，工控龙头平台化布局关节模组",
    },
    {
      code: "688698", name: "伟创电气",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 2, management: 3,
      overall: "★★★", note: "产品矩阵最完整(无框/空心杯/轴向磁通)，多客户送样中",
    },
  ],
  six_axis_sensor: [
    {
      code: "603662", name: "柯力传感",
      irreplaceability: 5, valuation: 3, performance: 4, customer: 4, management: 4,
      overall: "★★★★★", note: "六维力送样超70家，小批量交付，华为/小鹏链，MEMS硅基研发中",
    },
    {
      code: "300007", name: "汉威科技",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★★", note: "气体+力+柔性多传感器平台，品类最全，机器人增量可期",
    },
    {
      code: "002338", name: "奥普光电",
      irreplaceability: 3, valuation: 3, performance: 3, customer: 2, management: 3,
      overall: "★★★", note: "精密光电传感技术积累，编码器+力传感器协同布局",
    },
  ],
  dexterous_hand: [
    {
      code: "003021", name: "兆威机电",
      irreplaceability: 5, valuation: 3, performance: 4, customer: 4, management: 5,
      overall: "★★★★★", note: "灵巧手龙头，ZWHAND B20全驱量产，订单超6亿，苏州10万套产能",
    },
    {
      code: "603728", name: "鸣志电器",
      irreplaceability: 4, valuation: 3, performance: 3, customer: 3, management: 4,
      overall: "★★★★", note: "空心杯电机打破海外垄断，特斯拉送样，国际供应链导入",
    },
    {
      code: "002747", name: "埃斯顿",
      irreplaceability: 4, valuation: 3, performance: 3, customer: 4, management: 4,
      overall: "★★★★", note: "国产工业机器人第一，基本盘稳固，人形机器人整机+部件双布局",
    },
    {
      code: "688017", name: "绿的谐波",
      irreplaceability: 4, valuation: 1, performance: 5, customer: 5, management: 5,
      overall: "★★★★", note: "谐波全球第二延伸至关节总成+灵巧手微型减速器，特斯拉链核心",
    },
  ],
  ball_screw: [
    {
      code: "601100", name: "恒立液压",
      irreplaceability: 5, valuation: 5, performance: 4, customer: 5, management: 5,
      overall: "★★★★★", note: "10.4万根滚珠丝杠产能，远期百万套，特斯拉份额≥70%，300+机床客户",
    },
    {
      code: "002553", name: "南方精工",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★★", note: "微型滚珠丝杠领先，获优必选Walker S独家订单(单机14个)，灵巧手适配",
    },
    {
      code: "300660", name: "江苏雷利",
      irreplaceability: 3, valuation: 5, performance: 3, customer: 2, management: 3,
      overall: "★★★", note: "空心杯+丝杠模组集成方案，成本较行业低20%，傅利叶智能验证通过",
    },
    {
      code: "300580", name: "贝斯特",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 2, management: 3,
      overall: "★★★", note: "行星滚柱+滚珠丝杠双线布局，精密加工技术积累，汽车基本盘支撑",
    },
  ],
};

function StockScoreBar({ value, label }: { value: number | string; label: string }) {
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
}

function SectorTemplate({ label, sectorKey }: { label: string; sectorKey: string }) {
  const content = SECTOR_CONTENT[sectorKey];
  const stocks = SECTOR_STOCKS[sectorKey] || [];

  return (
    <div className="space-y-5">
      {/* ── 1. 环节定位 ── */}
      <div className="border rounded-xl p-4 bg-card space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          环节定位 — {label}
        </h3>
        <p className="text-sm leading-relaxed text-foreground/85">
          {content?.positioning ?? "待补"}
        </p>
      </div>

      {/* ── 2. 竞争格局 (国际 + 国内) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-card space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            国际竞争格局
          </h3>
          <p className="text-sm leading-relaxed text-foreground/80">
            {content?.intlLandscape ?? "待补"}
          </p>
        </div>
        <div className="border rounded-xl p-4 bg-card space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            国内竞争格局
          </h3>
          <p className="text-sm leading-relaxed text-foreground/80">
            {content?.domLandscape ?? "待补"}
          </p>
        </div>
      </div>

      {/* ── 3. 壁垒类型 ── */}
      <div className="border rounded-xl p-4 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Shield className="h-4 w-4" />
          壁垒类型
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border rounded-lg p-3 space-y-1.5 bg-muted/20">
            <span className="text-xs font-semibold text-primary">科技壁垒</span>
            <p className="text-xs leading-relaxed text-foreground/75">
              {content?.techBarrier ?? "待补"}
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1.5 bg-muted/20">
            <span className="text-xs font-semibold text-primary">产能壁垒</span>
            <p className="text-xs leading-relaxed text-foreground/75">
              {content?.capacityBarrier ?? "待补"}
            </p>
          </div>
        </div>
      </div>

      {/* ── 4. 个股评分体系 ── */}
      <div className="border rounded-xl p-4 bg-card space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          个股评分体系
        </h3>
        {stocks.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-4">待补</p>
        ) : (
          <div className="space-y-4">
            {stocks.map((s) => (
              <div key={s.code} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">
                    {s.code}
                  </span>
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">{s.overall}</span>
                </div>
                <div className="space-y-1.5">
                  <StockScoreBar value={s.irreplaceability} label="不可替代性" />
                  <StockScoreBar value={s.valuation} label="估值" />
                  <StockScoreBar value={s.performance} label="业绩" />
                  <StockScoreBar value={s.customer} label="客户" />
                  <StockScoreBar value={s.management} label="管理层" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. 核心标的表格 ── */}
      <div className="border rounded-xl p-4 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          核心标的
        </h3>
        {stocks.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-4">待补</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium w-[4.5rem]">公司</th>
                  <th className="px-3 py-2 text-left font-medium w-[5rem]">不可替代性</th>
                  <th className="px-3 py-2 text-left font-medium w-[4rem]">评分</th>
                  <th className="px-3 py-2 text-left font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.code} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-mono text-muted-foreground">{s.code}</span>
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              i < s.irreplaceability ? "bg-primary/70" : "bg-muted",
                            )}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{s.overall}</td>
                    <td className="px-3 py-2.5 text-muted-foreground leading-relaxed max-w-[320px]">
                      {s.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReportLibrary ────────────────────────────────────────────────────────

const REPORT_SECTORS = ["全部", "机器人", "减速器", "丝杠", "执行器", "灵巧手"] as const;

const SECTOR_COLORS: Record<string, string> = {
  "机器人": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "减速器": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "丝杠": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "执行器": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "灵巧手": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

function ReportLibrary() {
  const [reports, setReports] = useState<IndustryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("全部");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getIndustryReports("robot");
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
}

// ── IndustryOverview (总览 tab) ──────────────────────────────────────────

const CORE_COMPONENTS = [
  { key: "harmonic_reducer", label: "谐波减速器", icon: Cog, desc: "关节传动核心", stat: "日系 CR~70%，国产~15%" },
  { key: "planetary_roller_screw", label: "行星滚柱丝杠", icon: Drill, desc: "线性执行器", stat: "BOM 占比 19%，国产~20%" },
  { key: "frameless_motor", label: "无框力矩电机", icon: Zap, desc: "动力输出", stat: "2030 年市场 918 亿" },
  { key: "six_axis_sensor", label: "六维力传感器", icon: Gauge, desc: "力觉反馈", stat: "国产 58.8% 首超外资" },
  { key: "dexterous_hand", label: "灵巧手", icon: Hand, desc: "末端执行", stat: "中国高自由度 >80%" },
  { key: "ball_screw", label: "滚珠丝杠", icon: Wrench, desc: "精密传动", stat: "日台主导 ~60%+" },
] as const;

function IndustryOverview() {
  return (
    <div className="space-y-5">
      {/* ── 1. 产业链结构图 ── */}
      <div className="border rounded-xl p-5 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          产业链结构图
        </h3>
        <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 py-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 min-w-[120px] justify-center">
            <Factory className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-sm text-muted-foreground/70">上游材料与设备</span>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/40 hidden md:block" />
          <ChevronRight className="h-5 w-5 text-muted-foreground/40 rotate-90 md:rotate-0" />
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border-2 border-primary/40 bg-primary/5 min-w-[200px]">
            {CORE_COMPONENTS.map((c) => (
              <span key={c.key} className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium whitespace-nowrap">
                {c.label}
              </span>
            ))}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/40 hidden md:block" />
          <ChevronRight className="h-5 w-5 text-muted-foreground/40 rotate-90 md:rotate-0" />
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-danger/30 bg-danger/5 min-w-[120px] justify-center">
            <Bot className="h-4 w-4 text-danger/60" />
            <span className="text-sm font-medium text-danger/80">本体机器人</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/60 text-center leading-relaxed">
          上游稀土永磁、特种钢材、精密磨床 → 六大核心零部件 → 特斯拉 Optimus / 优必选 / 宇树 / 智元等整机厂。<br />
          2026 年全球人形机器人产量预计 23.8 万台（华泰），2030 年有望达百万台级别。
        </p>
      </div>

      {/* ── 2. 六大核心环节卡片 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {CORE_COMPONENTS.map(({ key, label, icon: Icon, desc, stat }) => (
          <div key={key} className="border rounded-xl p-4 bg-card space-y-2 text-center hover:border-primary/30 transition-colors">
            <Icon className="h-6 w-6 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-[11px] text-muted-foreground/60">{desc}</p>
            <p className="text-[10px] text-primary/70 font-medium leading-snug">{stat}</p>
          </div>
        ))}
      </div>

      {/* ── 3. 上游材料与设备 ── */}
      <div className="border rounded-xl p-4 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4" />
          上游材料与设备
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 space-y-1 bg-muted/20">
            <div className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">稀土永磁</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              钕铁硼永磁体为无框力矩电机核心材料，中国稀土储量占全球 ~35%，产量 ~70%。金力永磁、中科三环等为头部供应商。
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1 bg-muted/20">
            <div className="flex items-center gap-2">
              <Cog className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">精密磨床</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              丝杠/减速器核心加工设备，长期被欧日出口管制。国产磨床精度逐步追赶，但核心部件仍有差距，是产能释放的关键瓶颈。
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1 bg-muted/20">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">特种材料</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              谐波减速器柔轮用特种钢材、灵巧手腱绳用复合钨丝、触觉传感器 MEMS 芯片等，材料纯度和疲劳寿命直接影响零部件性能。
            </p>
          </div>
        </div>
      </div>

      {/* ── 4. 板块评分总览 + 核心标的池 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            板块评分总览
          </h3>
          <div className="space-y-2">
            {[
              { label: "产业空间", score: 5, note: "2030 年全球千亿级市场" },
              { label: "国产替代进程", score: 4, note: "减速器/传感器突破快，丝杠仍薄弱" },
              { label: "技术壁垒", score: 5, note: "多环节微米/纳米级加工壁垒极高" },
              { label: "量产确定性", score: 4, note: "特斯拉 Optimus 2026H2 量产爬坡" },
              { label: "政策支持", score: 5, note: "十五五重点方向，多地产业基金加持" },
            ].map(({ label, score, note }) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={cn("h-1.5 w-3 rounded-sm", i < score ? "bg-primary/70" : "bg-muted")} />
                  ))}
                </div>
                <span className="text-muted-foreground/70 ml-auto">{note}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Bot className="h-4 w-4" />
            核心标的池
          </h3>
          <div className="space-y-1.5 text-xs">
            {[
              { name: "绿的谐波", code: "688017", why: "谐波全球第二，特斯拉独家供应商" },
              { name: "恒立液压", code: "601100", why: "丝杠龙头，特斯拉最大供应商(份额≥70%)" },
              { name: "兆威机电", code: "003021", why: "灵巧手龙头，订单超6亿，全驱量产" },
              { name: "雷赛智能", code: "002979", why: "无框电机产能30万台，覆盖80%国内厂商" },
              { name: "柯力传感", code: "603662", why: "六维力传感器龙头，送样超70家" },
              { name: "步科股份", code: "688160", why: "无框电机国内龙头，Q1出货+246%" },
            ].map(({ name, code, why }) => (
              <div key={code} className="flex items-center gap-2 py-1 border-b last:border-0">
                <span className="font-mono text-[11px] bg-muted px-1 rounded">{code}</span>
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground/70 ml-auto text-right">{why}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. 整机成本构成 + 量产时间轴 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Drill className="h-4 w-4" />
            整机成本构成
          </h3>
          <div className="space-y-2">
            {[
              { part: "丝杠（行星滚柱+滚珠）", pct: 30, note: "最大单一成本项，降本核心" },
              { part: "无框力矩电机", pct: 20, note: "28 个执行器，单价快速下降" },
              { part: "减速器（谐波+RV）", pct: 15, note: "国产替代后单价降 25-30%" },
              { part: "传感器（力+视觉+IMU）", pct: 15, note: "六维力国产单价 2.7 万 vs 海外 10 万" },
              { part: "灵巧手", pct: 10, note: "微型电机+丝杠+触觉传感器集成" },
              { part: "电池/电控/结构件", pct: 10, note: "相对成熟，规模化降本" },
            ].map(({ part, pct, note }) => (
              <div key={part} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{part}</span>
                  <span className="font-mono font-medium">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct * 2.5}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground/60">{note}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            量产时间轴
          </h3>
          <div className="space-y-3">
            {[
              { time: "2025", event: "特斯拉 Optimus Gen2 工程验证，宇树科创板过会，比亚迪入局" },
              { time: "2026H1", event: "Optimus V3 小规模试产，宇树/智元万台级量产，绿的谐波订单翻倍" },
              { time: "2026H2", event: "特斯拉启动 10 万台级量产，丝杠/电机订单爆发，灵巧手批量交付" },
              { time: "2027-2028", event: "国产丝杠突破内螺纹磨削瓶颈，百万台级别供应链成形，行业出清" },
              { time: "2029-2030", event: "全球百万台量产，千亿级市场，头部集中度提升，国产龙头全球竞争" },
            ].map(({ time, event }) => (
              <div key={time} className="flex gap-3 text-xs">
                <span className="font-mono font-semibold text-primary shrink-0 w-16">{time}</span>
                <span className="text-muted-foreground leading-relaxed">{event}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. 板块结论 ── */}
      <div className="border rounded-xl p-5 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">板块结论</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm leading-relaxed">
          <div className="space-y-2">
            <p className="font-medium text-foreground/90">🟢 核心看多逻辑</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
              <li>2026 年是人形机器人量产元年，特斯拉 Optimus 从工程验证进入 10 万台级量产</li>
              <li>核心零部件占整机成本 50%+，国产替代空间大（丝杠仅 20%，传感器/减速器已突破）</li>
              <li>哈默纳科专利到期、磨床国产化、内资传感器份额反超——三大国产替代催化剂共振</li>
              <li>中国在全球高自由度灵巧手市场占 &gt;80%，整机厂（宇树/智元/优必选）出货量全球领先</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground/90">🔴 核心风险</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
              <li>特斯拉量产进度不及预期（2025 实际仅数百台）→ 全链条需求延后</li>
              <li>行星滚柱丝杠国产化率仅 20%，内螺纹磨削+高端磨床仍是硬瓶颈</li>
              <li>触觉传感器为灵巧手最大短板（实验室 10 万→消费级百元，鸿沟巨大）</li>
              <li>行业估值泡沫——部分标的 PE 超 500 倍，业绩兑现不及预期将大幅回调</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HumanoidRobot() {
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
        <h1 className="text-2xl font-bold tracking-tight">人形机器人板块</h1>
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

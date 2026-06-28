import { useState, useEffect, useCallback } from "react";
import { ChevronRight, RefreshCw, Cpu, Factory, Gem, Drill, Cog, Shield, BarChart3, TrendingUp, FileText, Calendar, Building2, Tag, ExternalLink, Database, CircuitBoard, Fan, Waves, HardDrive, Gauge, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type IndustryReport } from "@/lib/api";

// ── sector data ──────────────────────────────────────────────────────────

interface SectorDef {
  key: string;
  label: string;
}

const SECTORS: SectorDef[] = [
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

// ── StockScoreBar ───────────────────────────────────────────────────────

interface GlobalCompEntry {
  rank: string | number;
  company: string;
  country: string;
  share?: string;
  advantage: string;
  arelation?: string; // A股关联度
}

interface SectorContent {
  positioning: string;        // 环节定位
  intlLandscape: string;       // 国际竞争格局
  domLandscape: string;        // 国内竞争格局
  techBarrier: string;         // 科技壁垒
  capacityBarrier: string;     // 产能壁垒
  globalCompetition: GlobalCompEntry[]; // 全球竞争格局表格
}

const SECTOR_CONTENT: Record<string, SectorContent> = {
  ai_chip: {
    positioning:
      "AI 训练与推理的核心计算单元，直接决定算力基础设施的性能上限。" +
      "GPU 仍为主力（英伟达 H200/B200/Rubin），ASIC 定制芯片（Google TPU/博通/AWS Trainium）份额快速提升，端侧推理芯片为新兴增长极。" +
      "GPU 占 AI 服务器 BOM 成本约 55%，为单机价值量最高的环节。2025 年全球 AI 芯片市场规模约 1100 亿美元，2030 年有望突破 5000 亿美元（CAGR ~35%）。",
    intlLandscape:
      "英伟达全球数据中心 GPU 市占率约 90%，Blackwell 平台 2025H2 规模量产，Rubin 平台 2026 年接力。" +
      "AMD MI350X 系列追赶但生态差距显著。博通/Google/Marvell 在 ASIC 定制路线领先，博通已获多家 Hyperscaler ASIC 订单。" +
      "CUDA 生态锁定为核心护城河——英伟达软件栈积累超 15 年，竞争对手短期内难以复制。",
    domLandscape:
      "华为昇腾 910C、寒武纪思元 590、海光深算三号为国产算力芯片第一阵营。" +
      "字节跳动/腾讯/阿里等互联网巨头开始批量采购国产 GPU（字节与国产 GPU 厂商洽谈大规模采购）。" +
      "燧原科技 IPO 加速，国产 GPU 从'可用'迈向'好用'，但硬件性能与软件生态距英伟达仍有 2-3 代差距。",
    techBarrier:
      "先进制程（5nm/3nm）+ 高性能计算架构设计 + CUDA 生态锁定为三大核心壁垒。" +
      "AI 芯片需同时满足高算力（TFLOPS）、高带宽（HBM 接口）、高能效（TDP/Watt）的'不可能三角'。" +
      "美国 BIS 对华先进制程+EDA 工具出口管制持续收紧，国产芯片在制程节点上受限明显。",
    capacityBarrier:
      "台积电 CoWoS 先进封装产能为核心瓶颈——2025 年月产能约 7 万片，供不应求。" +
      "国产先进封装（长电科技/通富微电）在 2.5D/3D 封装领域快速追赶，但产能和良率仍有差距。" +
      "先进制程晶圆产能被台积电垄断，三星/Intel 代工份额有限，国产先进逻辑制程仍在突破中。",
    globalCompetition: [
      { rank: 1, company: "NVIDIA", country: "美国", share: "~90%", advantage: "数据中心GPU绝对垄断，CUDA生态护城河，Blackwell/Rubin路线图清晰", arelation: "无直接标的" },
      { rank: 2, company: "AMD", country: "美国", share: "~7%", advantage: "MI300X/MI350X系列追赶，ROCm生态逐步完善，性价比优势", arelation: "通富微电(封测合作)" },
      { rank: 3, company: "Intel", country: "美国", share: "<3%", advantage: "Gaudi3加速卡，FPGA+CPU协同优势，OneAPI统一编程", arelation: "无直接标的" },
      { rank: "--", company: "博通(Broadcom)", country: "美国", share: "--", advantage: "ASIC定制芯片龙头(XPU)，获Google/Meta/字节等多家订单", arelation: "无直接标的" },
      { rank: "--", company: "华为海思", country: "中国", share: "--", advantage: "昇腾910C国产最强AI芯片，昇思MindSpore生态构建中", arelation: "间接受益(产业链)" },
    ],
  },
  hbm: {
    positioning:
      "高带宽存储器（High Bandwidth Memory），AI GPU 的'贴身内存'，通过 TSV 硅通孔 3D 堆叠实现 TB/s 级带宽。" +
      "HBM3E 12Hi 已为英伟达 Blackwell 标配，单 GPU 搭载 8 颗 HBM（192GB），HBM4 16Hi 预计 2026 年量产。" +
      "HBM 占 AI 服务器 BOM 成本约 15%，GB300 单机 HBM 价值量约 $15 万+。",
    intlLandscape:
      "SK 海力士全球市占率约 53%（独家供应英伟达 HBM3E），三星约 35%，美光约 12%。" +
      "SK 海力士 HBM4E 12 层已送样，量产节点领先三星/美光 1-2 个季度。" +
      "三强格局稳固——HBM 技术迭代速度极快（每代间隔约 18 个月），后进入者门槛极高。",
    domLandscape:
      "国产 HBM 仍处于早期研发/验证阶段，与海外差距 2-3 代。" +
      "长鑫存储布局 HBM2E/HBM3，但量产节点晚于海外龙头；武汉新芯/福建晋华为潜在追赶力量。" +
      "HBM 国产化是 AI 算力产业链中替代难度最高的环节之一，短期内难以突破。",
    techBarrier:
      "TSV 硅通孔 + 芯片堆叠键合（TCB/HCB）+ 散热管理为三大核心技术壁垒。" +
      "12 层以上堆叠良率控制极难——单颗 HBM 需在 720μm 高度内堆叠 12 颗 DRAM 芯片，层间对准精度要求亚微米级。" +
      "HBM 与 GPU 封装协同设计（CoWoS-S → CoWoS-L），生态深度绑定台积电+SK 海力士。",
    capacityBarrier:
      "SK 海力士 2025 年 HBM 产能已全部售罄，扩产周期 18 个月+，新增产能量产需到 2026H2。" +
      "HBM 制造需专用 DRAM 产线（无法与传统 DRAM 共线），资本开支巨大，单条产线投资超 $100 亿。" +
      "三星/美光加速扩产，但 TSV 设备和 TC Bonder 供应紧张制约产能释放速度。",
    globalCompetition: [
      { rank: 1, company: "SK Hynix", country: "韩国", share: "~70%", advantage: "HBM3E独家量产，NVIDIA核心供应商，技术路线领先1-2季度", arelation: "无直接标的" },
      { rank: 2, company: "Samsung", country: "韩国", share: "~20%", advantage: "垂直整合，自研GPU+HBM协同，8层HBM3E已送样", arelation: "无直接标的" },
      { rank: 3, company: "Micron", country: "美国", share: "~10%", advantage: "HBM3E追赶中，12Hi堆叠良率改善明显", arelation: "无直接标的" },
      { rank: "--", company: "通富微电", country: "中国", share: "--", advantage: "AMD封测主力，CoWoS/2.5D封测产能", arelation: "间接受益" },
      { rank: "--", company: "长川科技", country: "中国", share: "--", advantage: "HBM/AI芯片测试设备国产替代", arelation: "间接受益" },
    ],
  },
  optical_module: {
    positioning:
      "AI 数据中心内部高速互连核心器件，负责 GPU-to-GPU 及交换机间光信号传输。" +
      "800G 为当前主力出货（英伟达 Spectrum-X），1.6T 2025H2 开始送样量产，2026 年规模放量。" +
      "CPO（共封装光学）为下一代技术范式——将光引擎与交换芯片共封装，功耗降低 50%+，2026-2027 年商用化。",
    intlLandscape:
      "中际旭创全球光模块龙头（市占率 ~20%），Coherent（美）、Fabrinet（泰）、Lumentum（美）为第二梯队。" +
      "博通/Marvell 垄断高端 DSP 芯片（占光模块成本 30-40%），为上游核心卡脖子环节。" +
      "CPO 方案主导权在台积电 COUPE + 英伟达/博通，传统光模块厂商面临技术路线切换风险。",
    domLandscape:
      "中国光模块厂商全球市占率超 40%，中际旭创/新易盛/天孚通信为全球第一梯队。" +
      "1.6T 光模块均已送样/量产，光迅科技/华工科技/联特科技为第二梯队快速追赶。" +
      "国产光芯片（源杰科技/长光华芯）在 100G EML 取得突破，但高端 DSP 仍依赖进口。",
    techBarrier:
      "高速 DSP 芯片 + EML 激光器 + 精密耦合封装为三大技术壁垒。" +
      "硅光集成路线之争（硅光 vs InP vs TFLN）——硅光优势在集成度和成本，但光源效率/耦合损耗仍有挑战。" +
      "CPO 封装将光模块产业链重塑——价值量从光模块厂商向封装厂和芯片厂转移。",
    capacityBarrier:
      "高速 EML 激光器芯片产能紧张（Lumentum/三菱/住友主导），国产 100G EML 刚突破量产。" +
      "光模块耦合/测试设备为产能瓶颈——高精度贴片/耦合设备被日本/FiconTEC 等垄断，国产设备精度逐步跟上。" +
      "1.6T 光模块产线需全面升级（从 COB 到硅光耦合），老产线难以复用。",
    globalCompetition: [
      { rank: 1, company: "中际旭创(II-VI)", country: "中国", share: "~20%", advantage: "全球光模块龙头，800G/1.6T领先量产，NVIDIA核心供应商", arelation: "300308 直接标的" },
      { rank: 2, company: "Coherent(II-VI)", country: "美国", share: "~12%", advantage: "III-V族材料+光器件+模块全链条，磷化铟激光器龙头", arelation: "无直接标的" },
      { rank: 3, company: "Fabrinet", country: "泰国", share: "~10%", advantage: "全球最大光模块代工厂，绑定Cisco/Arista/华为等客户", arelation: "无直接标的" },
      { rank: "--", company: "新易盛", country: "中国", share: "--", advantage: "800G主力供应商，1.6T送样领先，北美云厂商份额提升快", arelation: "300502 直接标的" },
      { rank: "--", company: "Lumentum", country: "美国", share: "--", advantage: "高速EML激光器芯片龙头，DSP+光学方案整合能力", arelation: "无直接标的" },
    ],
  },
  pcb: {
    positioning:
      "AI 服务器主板/背板/加速卡载板（UBB/OAM/GPU 模组板），是算力硬件的'骨架'。" +
      "AI 服务器单机 PCB 价值量 $3000-5000（传统服务器 $500-1000），Vera Rubin 机架 PCB 价值量超预期。" +
      "PCB 上游 CCL（覆铜板）占 PCB 成本约 30%，CCL 连续涨价推动 PCB 景气上行。",
    intlLandscape:
      "日本 Ibiden/Shinko、中国台湾欣兴/景硕/南电主导高端 IC 载板（ABF/BT）。" +
      "AI 服务器 PCB 高端市场以中国台湾（臻鼎/健鼎/金像电）和大陆（沪电/深南）为主，日系份额逐步下降。" +
      "mSAP（改良半加成法）工艺为 AI PCB 核心工艺，日台厂商起步早但大陆厂商快速追赶。",
    domLandscape:
      "沪电股份（AI 服务器 PCB 全球领先，英伟达核心供应商）、深南电路（封装基板龙头，FC-BGA 突破）、" +
      "鹏鼎控股（全球最大 PCB 厂商，AI 服务器加速布局）、生益科技（CCL 龙头，直接受益于覆铜板涨价）。" +
      "建滔积层板（全球最大 CCL 厂商）月内两次提价，CCL 供需缺口持续扩大利好上游龙头。",
    techBarrier:
      "高层数（>30 层）+ 高密度互连（HDI）+ 超低损耗材料为三大技术壁垒。" +
      "AI PCB 线宽/线距要求 25/25μm 以下（传统服务器 50/50μm），mSAP 工艺成为标配。" +
      "材料配方（M6/M7/M8 级别覆铜板）决定信号完整性和散热性能，高端 CCL 配方为松下/台光垄断。",
    capacityBarrier:
      "高端 CCL 产能缺口持续扩大——松下 M8 级 CCL 扩产节奏缓慢，国产 M6 级已突破但 M7/M8 仍在追赶。" +
      "AI PCB 大厂扩产由客户买单（英伟达/AMD 预付长单锁定产能），中小 PCB 厂商难以切入。" +
      "mSAP 产线投资门槛高（单条线 $5000 万+），产能爬坡周期 12-18 个月。",
    globalCompetition: [
      { rank: 1, company: "Ibiden(揖斐电)", country: "日本", share: "~15%", advantage: "IC载板全球第一，FC-BGA技术领先，Intel/AMD核心供应商", arelation: "无直接标的" },
      { rank: 2, company: "Unimicron(欣兴电子)", country: "中国台湾", share: "~12%", advantage: "AI服务器PCB龙头，ABF载板+HDI双强，NVIDIA供应链", arelation: "无直接标的" },
      { rank: 3, company: "Shinko(新光电气)", country: "日本", share: "~10%", advantage: "IC封装基板技术领先，FC-CSP/FC-BGA全覆盖", arelation: "无直接标的" },
      { rank: "--", company: "沪电股份", country: "中国", share: "--", advantage: "AI服务器PCB全球领先，高阶HDI+mSAP工艺，英伟达核心供应商", arelation: "002463 直接标的" },
      { rank: "--", company: "深南电路", country: "中国", share: "--", advantage: "封装基板国产龙头，FC-BGA载板突破，广州基地满产", arelation: "002916 直接标的" },
    ],
  },
  switch_chip: {
    positioning:
      "数据中心网络核心芯片，决定 GPU 集群的互连效率和规模上限。" +
      "交换芯片与 GPU 配比或大幅提升（AI 集群规模从万卡向百万卡演进，网络层级增加）。" +
      "英伟达 Spectrum-X（硅光交换机）2026 年量产，标志着交换芯片从'配角'变'主角'。",
    intlLandscape:
      "博通 Tomahawk 5/6 系列垄断高端（51.2Tbps+），为全球最大交换芯片供应商。" +
      "英伟达 Spectrum-X 硅光交换机量产，整合 NVLink + InfiniBand 生态，网络与计算深度融合。" +
      "Marvell/Cisco Silicon One 为第二梯队，交换芯片行业集中度极高（CR3 约 85%）。",
    domLandscape:
      "国产交换芯片份额较低但快速增长。盛科通信（国产以太网交换芯片龙头，TsingMa 系列）、" +
      "华为（数据中心交换机整机全球第一，自研 Solar 系列芯片）、中兴通讯/新华三为国产力量。",
    techBarrier:
      "超大交换容量（51.2Tbps/102.4Tbps）+ 超低时延（<100ns）+ 无损网络为三大技术壁垒。" +
      "高速 SerDes IP（112G/224G）为核心——交换容量由 SerDes 速率和通道数决定，224G SerDes 为下一代标配。" +
      "与 GPU/NPU 生态强绑定——英伟达 NVLink Switch 专用芯片仅适配自家 GPU，博通提供通用方案。",
    capacityBarrier:
      "交换芯片制造需 5nm/3nm 先进制程 + 2.5D 封装（台积电 CoWoS），产能竞争与 GPU 同线。" +
      "硅光交换（CPO for switch）将交换芯片与光引擎共封装，制造复杂度再上一个台阶。" +
      "国产交换芯片在制程和 IP 授权（SerDes）方面受限于海外供应链，需更多时间突破。",
    globalCompetition: [
      { rank: 1, company: "Broadcom(博通)", country: "美国", share: "~65%", advantage: "Tomahawk5/6垄断51.2Tbps+，SerDes IP龙头，ASIC+Switch双轮驱动", arelation: "无直接标的" },
      { rank: 2, company: "NVIDIA", country: "美国", share: "~15%", advantage: "Spectrum-X硅光交换机，InfiniBand+NVLink生态整合，网络计算融合", arelation: "无直接标的" },
      { rank: 3, company: "Marvell", country: "美国", share: "~8%", advantage: "Teralynx系列追赶，5nm制程切换领先，数据中心产品线全", arelation: "无直接标的" },
      { rank: "--", company: "盛科通信", country: "中国", share: "--", advantage: "国产以太网交换芯片唯一上市标的，TsingMa系列25.6T在研", arelation: "688702 直接标的" },
      { rank: "--", company: "华为", country: "中国", share: "--", advantage: "数据中心交换机全球第一，自研Solar系列芯片，全栈方案", arelation: "间接受益" },
    ],
  },
  liquid_cooling: {
    positioning:
      "AI 数据中心散热标配——GPU TDP 突破 1000W（B200 1000W，Rubin 1200W+），传统风冷已无法胜任。" +
      "冷板式液冷为当前主流方案（渗透率 2025 约 25%→2030 有望 >70%），浸没式液冷为下一代。" +
      "英伟达 NVL72/NVL144 机柜级液冷方案成为行业标准，液冷从'可选'变为'必选'。",
    intlLandscape:
      "CoolIT（美，英伟达 NVL 液冷核心供应商）、Rittal（德）、Vertiv（美）为海外龙头。" +
      "Asetek（丹麦）在数据中心冷板液冷领域积累深厚，但中国厂商凭借性价比和快速响应正在反超。" +
      "COMPUTEX 2026 台北大会将液冷散热列为五大焦点之一，全球产业链布局加速。",
    domLandscape:
      "英维克（英伟达 NVL 方案核心供应商，国内液冷龙头，市占率约 30%）、高澜股份（冷板液冷领先）、" +
      "曙光数创（中科曙光旗下，浸没式液冷技术领先，超算领域积累深厚）。" +
      "中国液冷产业全球竞争力强——冷板/CDU/快接头等核心部件均已国产化，成本仅为海外 50-60%。",
    techBarrier:
      "高功率密度散热（>1000W/GPU）+ 漏液防护（零容忍）+ 氟化液环保替代为三大技术壁垒。" +
      "CDU（冷量分配单元）精度控制——需在±0.5°C 范围内精确控温，大规模部署的运维可靠性为核心挑战。" +
      "浸没式液冷的氟化液（3M Novec 替代）环保合规压力大，国产替代方案仍处验证阶段。",
    capacityBarrier:
      "冷板焊接一致性（真空钎焊）+ 氟化液供应链国产化为产能瓶颈。" +
      "液冷快接头（盲插式）国产化率仍低（依赖 Stäubli/Parker），是液冷系统中最易被忽视的卡脖子环节。" +
      "2026-2027 年液冷产能缺口可能扩大——英伟达 NVL 方案起量后，冷板产能需求 10× 级别跳升。",
    globalCompetition: [
      { rank: 1, company: "CoolIT", country: "美国", share: "~20%", advantage: "NVIDIA NVL液冷核心供应商，Direct Contact技术领先，OEM绑定深", arelation: "无直接标的" },
      { rank: 2, company: "Vertiv(维谛)", country: "美国", share: "~15%", advantage: "全球数据中心基础设施龙头，液冷+精密空调全产品线，渠道广", arelation: "无直接标的" },
      { rank: 3, company: "Asetek", country: "丹麦", share: "~10%", advantage: "数据中心冷板液冷专利布局深厚，OEM授权模式成熟", arelation: "无直接标的" },
      { rank: "--", company: "英维克", country: "中国", share: "--", advantage: "NVL方案核心供应商，国内市占率>30%，冷板+CDU+快接头全自研", arelation: "002837 直接标的" },
      { rank: "--", company: "曙光数创", country: "中国", share: "--", advantage: "浸没式液冷国内领先，相变液冷壁垒极高，超算积累>10年", arelation: "872808 直接标的" },
    ],
  },
  mlcc: {
    positioning:
      "多层陶瓷电容（MLCC），电子电路的'大米饭'——单台 AI 服务器 MLCC 用量是传统服务器的 3-5 倍（约 2000-5000 颗）。" +
      "英伟达 VR200（Vera Rubin）拉动 MLCC 价值重估——GPU 模组用超小型/高容量 MLCC 需求激增。" +
      "AI 加剧高端 MLCC 供应紧张，0603/0402 及以上规格库存处于历史低位。",
    intlLandscape:
      "村田制作所（全球 ~35%）、三星电机（~20%）、TDK、太阳诱电——日韩四强垄断高端市场 ~80%。" +
      "日韩厂商扩产保守，优先扩高利润的车规级 MLCC，AI 用高端 MLCC 产能释放缓慢。" +
      "国巨（中国台湾）通过并购 Kemet 成为全球第三，但高端产品占比仍偏低。",
    domLandscape:
      "风华高科（国产 MLCC 龙头，产能全球第五，高端 0201/01005 突破）、三环集团（材料+器件一体化）、" +
      "微容科技（高端 MLCC 黑马，AI 服务器 MLCC 已批量供货，产能爬坡快）。" +
      "国产化率约 15-20%，日韩扩产保守为国产替代创造宝贵窗口期。",
    techBarrier:
      "超小型化（0201→01005→008004）+ 高容量 + 高可靠性为三大技术壁垒。" +
      "陶瓷材料配方（钛酸钡纳米晶）+ 超薄介质层（<1μm）+ 多层叠层（>1000 层）为工艺核心。" +
      "AI MLCC 需同时满足高频低 ESR、高容值、高温稳定性三重要求，工艺难度远超消费电子 MLCC。",
    capacityBarrier:
      "高端 MLCC 扩产周期 18-24 个月（从厂房建设到良率爬坡），资本开支强度大。" +
      "日韩厂商扩产保守（聚焦高利润车规），AI 专用 MLCC 产能缺口预计持续到 2027 年。" +
      "上游陶瓷粉体材料（钛酸钡）国产化率逐步提升，但超高纯/纳米级粉体仍依赖日本化学。",
    globalCompetition: [
      { rank: 1, company: "村田制作所(Murata)", country: "日本", share: "~35%", advantage: "全球MLCC绝对龙头，01005超小型垄断，车规级份额>50%", arelation: "无直接标的" },
      { rank: 2, company: "三星电机(SEMCO)", country: "韩国", share: "~20%", advantage: "车载MLCC+高端消费电子双强，0201/01005量产领先", arelation: "无直接标的" },
      { rank: 3, company: "TDK", country: "日本", share: "~12%", advantage: "高频/高温MLCC技术领先，汽车电子MLCC份额高", arelation: "无直接标的" },
      { rank: "--", company: "风华高科", country: "中国", share: "--", advantage: "国产MLCC龙头，产能全球第五，高端0201/01005突破", arelation: "000636 直接标的" },
      { rank: "--", company: "三环集团", country: "中国", share: "--", advantage: "材料+器件一体化，陶瓷粉体自研自产，成本优势显著", arelation: "300408 直接标的" },
    ],
  },
  glass_substrate: {
    positioning:
      "先进封装新一代核心基板材料，有望替代硅中介层成为 chiplet 互连的下一代平台。" +
      "相比传统有机基板（ABF），玻璃基板具有更低的翘曲、更好的热稳定性、更高的互连密度（TGV 通孔间距可达 <50μm）。" +
      "英特尔率先量产（2026），台积电搭建试点产线，SK 海力士计划三倍扩张产能——三大巨头同步押注。",
    intlLandscape:
      "英特尔（玻璃基板技术最激进，2026 年率先量产，用于自家数据中心 CPU/GPU）、" +
      "台积电（COUPE 硅光 + 玻璃基板双层战略，试点产线已搭建）、" +
      "SK 海力士（三倍扩张玻璃基板产能，重点用于 HBM 封装）、三星（布局相对滞后）。",
    domLandscape:
      "国产玻璃基板仍处于研发/小试阶段，与海外差距 2-3 年。" +
      "京东方/彩虹股份/TCL 科技等面板厂商向封装玻璃基板延伸（显示玻璃与封装玻璃有工艺共通性）。" +
      "东旭光电/旗滨集团等玻璃原片厂商布局 TGV 玻璃通孔技术，设备与工艺为最大瓶颈。",
    techBarrier:
      "玻璃通孔（TGV）+ 高平整度（翘曲 <1mm/m）+ 低表面粗糙度 + 金属化填充为四大核心技术壁垒。" +
      "玻璃基板脆性大、加工难度远超有机基板——TGV 钻孔（激光/刻蚀）+ 孔内金属化填充为良率关键。" +
      "从面板级到封装级的精度跨越是最大挑战（线宽/线距从 μm 级→亚 μm 级）。",
    capacityBarrier:
      "TGV 设备国产化率极低——激光钻孔/等离子刻蚀/TGV 电镀设备被海外供应商垄断。" +
      "玻璃基板产业链尚未成熟——从玻璃原片到 TGV 加工到封装集成的全链条仍在构建中。" +
      "2027-2028 年为玻璃基板从实验室到量产的关键验证期，产能大规模释放需到 2029 年以后。",
    globalCompetition: [
      { rank: 1, company: "Intel(英特尔)", country: "美国", share: "--", advantage: "玻璃基板技术最激进，2026年率先量产用于数据中心CPU/GPU", arelation: "无直接标的" },
      { rank: 2, company: "TSMC(台积电)", country: "中国台湾", share: "--", advantage: "COUPE硅光+玻璃基板双层战略，试点产线已搭建，封装生态整合", arelation: "无直接标的" },
      { rank: 3, company: "SK Hynix", country: "韩国", share: "--", advantage: "三倍扩张玻璃基板产能，重点用于HBM封装，与Intel合作", arelation: "无直接标的" },
      { rank: "--", company: "沃格光电", country: "中国", share: "--", advantage: "TGV玻璃通孔技术领先，玻璃基板封装最纯正A股标的", arelation: "603773 直接标的" },
      { rank: "--", company: "京东方A", country: "中国", share: "--", advantage: "显示面板向封装玻璃基板延伸，工艺共通性强(玻璃加工+金属化)", arelation: "000725 间接受益" },
    ],
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
  ai_chip: [
    {
      code: "688256", name: "寒武纪",
      irreplaceability: 5, valuation: 1, performance: 3, customer: 4, management: 4,
      overall: "★★★★★", note: "国产AI芯片第一股，思元590量产，云端推理+训练全覆盖，互联网大厂批量采购",
    },
    {
      code: "688041", name: "海光信息",
      irreplaceability: 5, valuation: 2, performance: 5, customer: 5, management: 5,
      overall: "★★★★★", note: "国产x86 CPU+GPU双线，深算三号对标英伟达A100，信创+AI双轮驱动，营收增速>50%",
    },
    {
      code: "300474", name: "景嘉微",
      irreplaceability: 3, valuation: 4, performance: 2, customer: 3, management: 3,
      overall: "★★★", note: "国产GPU老兵，JM9系列进入信创体系，AI算力卡处于送样阶段，体量偏小",
    },
    {
      code: "688047", name: "龙芯中科",
      irreplaceability: 4, valuation: 3, performance: 2, customer: 2, management: 4,
      overall: "★★★", note: "自主指令集LoongArch生态，GPU IP自研，信创基本盘稳固但AI芯片布局偏早期",
    },
  ],
  hbm: [
    {
      code: "002156", name: "通富微电",
      irreplaceability: 4, valuation: 3, performance: 4, customer: 4, management: 4,
      overall: "★★★★", note: "HBM封装测试国内领先，AMD核心封测合作伙伴，2.5D/3D先进封装产能快速爬坡",
    },
    {
      code: "600584", name: "长电科技",
      irreplaceability: 5, valuation: 4, performance: 3, customer: 5, management: 4,
      overall: "★★★★", note: "国内封测龙头，XDFOI高密度扇出封装量产，HBM封装设备/工艺储备中",
    },
    {
      code: "000021", name: "深科技",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★", note: "存储封测领先，合肥沛顿存储芯片封测基地投产，HBM间接受益但直接布局有限",
    },
  ],
  optical_module: [
    {
      code: "300308", name: "中际旭创",
      irreplaceability: 5, valuation: 2, performance: 5, customer: 5, management: 5,
      overall: "★★★★★", note: "全球光模块龙头(市占率~20%)，英伟达核心供应商，1.6T光模块全球首批量产，营收连续翻倍",
    },
    {
      code: "300502", name: "新易盛",
      irreplaceability: 4, valuation: 3, performance: 5, customer: 4, management: 4,
      overall: "★★★★★", note: "800G光模块主力供应商，1.6T送样领先，北美云厂商份额快速提升，Q1业绩+200%",
    },
    {
      code: "300394", name: "天孚通信",
      irreplaceability: 4, valuation: 3, performance: 4, customer: 5, management: 5,
      overall: "★★★★", note: "光器件龙头，英伟达光引擎核心供应商，FAU组件全球份额>50%，CPO布局领先",
    },
    {
      code: "002281", name: "光迅科技",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★", note: "央企光模块龙头，光芯片自研(EML/DFB)，国产替代受益，800G放量中",
    },
  ],
  pcb: [
    {
      code: "002463", name: "沪电股份",
      irreplaceability: 5, valuation: 2, performance: 5, customer: 5, management: 5,
      overall: "★★★★★", note: "AI服务器PCB全球领先，英伟达核心供应商，高阶HDI+mSAP工艺壁垒深厚，订单可见度>2年",
    },
    {
      code: "002916", name: "深南电路",
      irreplaceability: 5, valuation: 3, performance: 4, customer: 4, management: 5,
      overall: "★★★★★", note: "封装基板龙头，FC-BGA载板国产突破第一股，ABF载板产能扩张，广州基地满产",
    },
    {
      code: "002938", name: "鹏鼎控股",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 5, management: 4,
      overall: "★★★★", note: "全球最大PCB厂商，苹果基本盘稳健，AI服务器PCB加速扩产，估值性价比突出",
    },
    {
      code: "600183", name: "生益科技",
      irreplaceability: 4, valuation: 3, performance: 4, customer: 4, management: 4,
      overall: "★★★★", note: "CCL(覆铜板)国内龙头，AI服务器高端CCL(M6/M7级)突破，直接受益涨价+国产替代双逻辑",
    },
  ],
  switch_chip: [
    {
      code: "688702", name: "盛科通信",
      irreplaceability: 5, valuation: 2, performance: 3, customer: 3, management: 4,
      overall: "★★★★", note: "国产以太网交换芯片唯一上市标的，TsingMa系列2.4Tbps量产，51.2T在研，稀缺性极高",
    },
    {
      code: "000063", name: "中兴通讯",
      irreplaceability: 4, valuation: 5, performance: 4, customer: 4, management: 4,
      overall: "★★★★", note: "自研交换芯片+AI服务器整机，运营商数据中心交换机份额第一，估值极低(PE<15x)",
    },
    {
      code: "000938", name: "紫光股份",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 4, management: 3,
      overall: "★★★★", note: "新华三交换机国内份额第二，AI数据中心网络方案完善，液冷交换机布局领先",
    },
  ],
  liquid_cooling: [
    {
      code: "002837", name: "英维克",
      irreplaceability: 5, valuation: 2, performance: 5, customer: 5, management: 5,
      overall: "★★★★★", note: "英伟达NVL液冷方案核心供应商，国内数据中心液冷市占率>30%，冷板+CDU全链自研",
    },
    {
      code: "300499", name: "高澜股份",
      irreplaceability: 4, valuation: 3, performance: 4, customer: 4, management: 4,
      overall: "★★★★", note: "冷板液冷领先，华为昇腾液冷核心供应商，电力电子散热技术积累深厚",
    },
    {
      code: "872808", name: "曙光数创",
      irreplaceability: 5, valuation: 3, performance: 3, customer: 4, management: 4,
      overall: "★★★★", note: "中科曙光旗下，浸没式液冷技术国内领先，超算液冷积累>10年，相变液冷壁垒极高",
    },
    {
      code: "603912", name: "佳力图",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★", note: "数据中心精密空调龙头向液冷延伸，CDU+冷板方案完善中，估值有安全边际",
    },
  ],
  mlcc: [
    {
      code: "000636", name: "风华高科",
      irreplaceability: 4, valuation: 3, performance: 3, customer: 4, management: 3,
      overall: "★★★★", note: "国产MLCC龙头(产能全球第五)，高端0201/01005突破，AI服务器MLCC已供货，国产替代首选",
    },
    {
      code: "300408", name: "三环集团",
      irreplaceability: 5, valuation: 3, performance: 4, customer: 5, management: 5,
      overall: "★★★★★", note: "材料+器件一体化，陶瓷粉体自研自产(成本优势显著)，MLCC+PKG基座+光纤陶瓷三线发力",
    },
    {
      code: "300285", name: "国瓷材料",
      irreplaceability: 4, valuation: 4, performance: 3, customer: 3, management: 3,
      overall: "★★★★", note: "MLCC上游陶瓷粉体龙头，钛酸钡粉体国产替代核心标的，受益MLCC扩产周期",
    },
  ],
  glass_substrate: [
    {
      code: "603773", name: "沃格光电",
      irreplaceability: 4, valuation: 2, performance: 2, customer: 2, management: 3,
      overall: "★★★", note: "玻璃基板封装最纯正A股标的，TGV玻璃通孔技术领先，英特尔/台积电产业链验证中",
    },
    {
      code: "000725", name: "京东方A",
      irreplaceability: 3, valuation: 5, performance: 3, customer: 3, management: 4,
      overall: "★★★", note: "显示面板龙头向封装玻璃基板延伸，工艺共通性强(玻璃加工+金属化)，但布局尚早",
    },
    {
      code: "601636", name: "旗滨集团",
      irreplaceability: 3, valuation: 4, performance: 3, customer: 2, management: 3,
      overall: "★★★", note: "玻璃原片龙头，TGV玻璃通孔技术研发中，上游原材料切入路径清晰，估值有安全垫",
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

      {/* ── 6. 全球竞争格局 ── */}
      {content?.globalCompetition && content.globalCompetition.length > 0 && (
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Globe className="h-4 w-4" />
            全球{label}竞争格局
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium w-[3rem]">排名</th>
                  <th className="px-3 py-2 text-left font-medium w-[7rem]">公司</th>
                  <th className="px-3 py-2 text-left font-medium w-[4rem]">国家</th>
                  <th className="px-3 py-2 text-left font-medium w-[4.5rem]">市占率</th>
                  <th className="px-3 py-2 text-left font-medium">核心优势</th>
                  <th className="px-3 py-2 text-left font-medium w-[6rem]">A股关联度</th>
                </tr>
              </thead>
              <tbody>
                {content.globalCompetition.map((entry, idx) => (
                  <tr key={`${entry.company}-${idx}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5">
                      {typeof entry.rank === "number" ? (
                        <span className={cn(
                          "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0",
                          entry.rank === 1 ? "bg-amber-500 text-white" :
                          entry.rank === 2 ? "bg-gray-400 text-white" :
                          entry.rank === 3 ? "bg-orange-700 text-white" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {entry.rank}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{entry.rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{entry.company}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{entry.country}</td>
                    <td className="px-3 py-2.5">
                      {entry.share ? (
                        <span className="font-semibold text-primary">{entry.share}</span>
                      ) : (
                        <span className="text-muted-foreground/50">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground leading-relaxed max-w-[280px]">{entry.advantage}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {entry.arelation ? (
                        <span className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full font-medium",
                          entry.arelation.includes("直接") ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                          entry.arelation.includes("间接") ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {entry.arelation}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
            数据来源：东方财富研报平台 · AI算力板块研报综合整理
          </p>
        </div>
      )}
    </div>
  );
}

// ── ReportLibrary ────────────────────────────────────────────────────────

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

function ReportLibrary() {
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
}

// ── IndustryOverview (总览 tab) ──────────────────────────────────────────

const CORE_COMPONENTS = [
  { key: "ai_chip", label: "算力芯片", icon: Cpu, desc: "AI 训练/推理核心", stat: "英伟达 GPU 市占率 ~90%" },
  { key: "hbm", label: "HBM", icon: Database, desc: "高带宽存储", stat: "SK 海力士 HBM3E 领先" },
  { key: "optical_module", label: "光模块", icon: Waves, desc: "高速互联", stat: "中国厂商全球 >40%" },
  { key: "pcb", label: "PCB", icon: CircuitBoard, desc: "高多层载板", stat: "AI 服务器单机 ASP $3000+" },
  { key: "switch_chip", label: "交换芯片", icon: HardDrive, desc: "数据中心交换", stat: "博通主导 800G/1.6T" },
  { key: "liquid_cooling", label: "液冷散热", icon: Fan, desc: "高功率密度散热", stat: "TDP 突破 1000W+" },
  { key: "mlcc", label: "MLCC", icon: Cog, desc: "被动元器件", stat: "AI 服务器用量 3-5×" },
  { key: "glass_substrate", label: "玻璃基板", icon: Gem, desc: "先进封装基板", stat: "替代硅中介层趋势" },
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
            <span className="text-sm text-muted-foreground/70">上游硅基/化合物材料</span>
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
            <Cpu className="h-4 w-4 text-danger/60" />
            <span className="text-sm font-medium text-danger/80">AI 数据中心</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/60 text-center leading-relaxed">
          上游硅基材料、化合物半导体、封装基板 → 八大核心环节 → 英伟达/AMD/华为/寒武纪等算力整机厂商。<br />
          2025 年全球 AI 算力基础设施支出预计突破 3000 亿美元，2030 年有望冲击万亿美元级别。
        </p>
      </div>

      {/* ── 2. 八大核心环节卡片 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
              <span className="text-sm font-medium">先进制程晶圆</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI 算力芯片依赖 5nm/3nm 先进制程，台积电 CoWoS 封装产能为核心瓶颈。2025 年 CoWoS 月产能预计突破 7 万片。
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1 bg-muted/20">
            <div className="flex items-center gap-2">
              <Cog className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">封装基板与材料</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ABF 载板、玻璃基板、EMIB 等先进封装材料决定芯片互连密度。玻璃基板有望在 2027-2028 年替代硅中介层进入量产。
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1 bg-muted/20">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">光刻与量测设备</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ASML EUV 光刻机、KLA 量测设备为核心卡脖子环节。国产光刻机/量测设备仍处于追赶阶段，是算力产业链最大瓶颈。
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
              { label: "产业空间", score: 5, note: "2030 年全球万亿美元级别市场" },
              { label: "国产替代进程", score: 3, note: "芯片/先进封装受限，光模块/PCB 已突破" },
              { label: "技术壁垒", score: 5, note: "先进制程+封装+互联，壁垒极高" },
              { label: "量产确定性", score: 4, note: "英伟达 Blackwell 2025H2 放量，国产 GPU 追赶" },
              { label: "政策支持", score: 5, note: "新质生产力核心方向，大基金三期加持" },
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
            <Cpu className="h-4 w-4" />
            核心标的池
          </h3>
          <div className="space-y-1.5 text-xs">
            {[
              { name: "寒武纪", code: "688256", why: "国产 AI 芯片龙头，思元系列，云端推理+训练全覆盖" },
              { name: "海光信息", code: "688041", why: "国产 x86 CPU+GPU 双线，深算系列对标英伟达" },
              { name: "中际旭创", code: "300308", why: "全球光模块龙头，800G/1.6T 领先放量" },
              { name: "沪电股份", code: "002463", why: "AI 服务器 PCB 龙头，高阶 HDI 全球领先" },
              { name: "深南电路", code: "002916", why: "封装基板龙头，FC-BGA 载板国产突破" },
              { name: "英维克", code: "002837", why: "液冷散热龙头，英伟达 NVL 方案核心供应商" },
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

      {/* ── 5. 整机成本构成 + 技术路线时间轴 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Drill className="h-4 w-4" />
            AI 服务器成本构成
          </h3>
          <div className="space-y-2">
            {[
              { part: "GPU/算力芯片", pct: 55, note: "最大成本项，英伟达 GPU 垄断定价" },
              { part: "HBM 高带宽存储", pct: 15, note: "HBM3E 12Hi 单价 $2500+，需求紧缺" },
              { part: "光模块/互连", pct: 8, note: "800G→1.6T 升级周期，单机价值量持续提升" },
              { part: "PCB/载板", pct: 6, note: "高多层+高阶 HDI，AI 单机 ASP $3000+" },
              { part: "液冷散热", pct: 8, note: "GPU TDP 突破 1000W，液冷成标配" },
              { part: "电源/MLCC/其他", pct: 8, note: "电源模块+被动元件 3-5× 用量提升" },
            ].map(({ part, pct, note }) => (
              <div key={part} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{part}</span>
                  <span className="font-mono font-medium">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct * 1.5}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground/60">{note}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            技术路线演进
          </h3>
          <div className="space-y-3">
            {[
              { time: "2024", event: "英伟达 H200/B200 发布，HBM3E 量产，1.6T 光模块送样" },
              { time: "2025H1", event: "Blackwell 平台量产，CoWoS-L 封装，液冷渗透率突破 30%" },
              { time: "2025H2", event: "Rubin 平台发布，HBM4 送样，CPO 共封装光学商用化启动" },
              { time: "2026-2027", event: "1.6T 光模块规模放量，玻璃基板进入量产验证，液冷成数据中心标配" },
              { time: "2028-2030", event: "硅光/CPO 大规模商用，HBM4 量产，玻璃基板替代硅中介层，算力成本断崖式下降" },
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
              <li>AI 大模型 Scaling Law 延续，算力需求指数级增长，2025-2030 年全球 AI 算力 Capex CAGR &gt;30%</li>
              <li>英伟达 Blackwell → Rubin 平台迭代加速，配套产业链（光模块/HBM/液冷）同步升级放量</li>
              <li>国产算力芯片（寒武纪/海光/昇腾）生态加速完善，国产替代从 0→1 导入期进入 1→10 爆发期</li>
              <li>光模块/PCB/液冷等环节中国厂商全球份额持续提升，AI 算力是确定性最高的产业趋势</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground/90">🔴 核心风险</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
              <li>美国对华 AI 芯片制裁升级——BIS 出口管制可能进一步收紧先进 GPU/光刻设备供应</li>
              <li>大模型 Scaling Law 触及天花板，算力需求增速放缓，导致产业链库存积压</li>
              <li>HBM/CoWoS 产能高度集中于 SK 海力士 + 台积电，地缘风险不可忽视</li>
              <li>部分环节（如 CPO/玻璃基板）技术路线仍未收敛，押注单一技术路径存在失败风险</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

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

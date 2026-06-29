/**
 * Stock-level score data per sector.
 */

export interface StockScoreEntry {
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

export const SECTOR_STOCKS: Record<string, StockScoreEntry[]> = {
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

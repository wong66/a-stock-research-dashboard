import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  RefreshCw, Search, X, ChevronDown, ChevronUp,
  TrendingUp, Filter, SlidersHorizontal,
  Star, ExternalLink, PanelRightClose, PanelRightOpen,
  Zap, Shield, Gem, Target, Rocket, AlertTriangle,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { echarts } from "@/lib/echarts";

// ── Types ──────────────────────────────────────────────────────────────

interface SectorDashboardData {
  changePct: number;
  changeAmt: number;
  upCount: number;
  limitUpCount: number;
  downCount: number;
  limitDownCount: number;
  mainInflow: number;     // 亿元
  mainInflowMom: number;   // 环比 %
  totalVolume: number;     // 亿元
  volumeMom: number;       // 环比 %
}

interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  mainFlow: number;
}

interface TopStock {
  rank: number;
  code: string;
  name: string;
  changePct?: number;
  mainInflow?: number;
}

interface StockScore {
  mainlineStrength: number;    // 主线强度
  productPurity: number;       // 产品纯度
  fundTrend: number;           // 资金趋势
  earningsSupport: number;     // 业绩/订单支撑
}

interface PickStock {
  code: string;
  name: string;
  concepts: string[];
  allConcepts: string[];
  scores: StockScore;
  grade: "A" | "B";
  changePct: number;
  mainInflow: number;         // 万元
  tags: string[];             // 核心属性标签
  logicLabels: string[];      // 六大逻辑标签
  scoreDetails: {             // 展开详情
    radarData: { name: string; value: number; max: number }[];
    volumeAnalysis: string;
    breakthroughCheck: string;
    fundamentalBrief: string;
  };
}

// ── Constants ───────────────────────────────────────────────────────────

const HOT_SECTORS = [
  "半导体", "AI算力", "新能源", "军工", "医药", "消费电子", "机器人", "油气",
];

const LOGIC_LABELS = [
  { key: "domestic_sub", label: "国产替代", icon: Shield, color: "#3b82f6" },
  { key: "demand_upgrade", label: "需求升级", icon: TrendingUp, color: "#f59e0b" },
  { key: "strategic_revalue", label: "战略重估", icon: Gem, color: "#8b5cf6" },
  { key: "earnings_deliver", label: "业绩兑现", icon: Target, color: "#10b981" },
  { key: "fund_cluster", label: "资金抱团", icon: Zap, color: "#ef4444" },
  { key: "position_structure", label: "位置结构", icon: Rocket, color: "#06b6d4" },
];

const AUX_FILTERS = [
  { key: "volume_20d", label: "20日量价筛选" },
  { key: "breakout_5d", label: "5日突破筛选" },
  { key: "fundamental", label: "基本面门槛" },
  { key: "exclude_risk", label: "排除风险标的" },
];

const DEFAULT_THRESHOLDS = {
  mainlineStrength: 70,
  productPurity: 60,
  fundTrend: 60,
  earningsSupport: 50,
};

// ── Mock / Demo Data ────────────────────────────────────────────────────

function generateMockKline(days: number): KlineItem[] {
  const data: KlineItem[] = [];
  let price = 1000;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const change = (Math.random() - 0.48) * 30;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 15;
    const low = Math.min(open, close) - Math.random() * 15;
    const volume = Math.floor(Math.random() * 5000 + 2000);
    const mainFlow = (Math.random() - 0.45) * 2000;
    data.push({
      date: d.toISOString().slice(0, 10),
      open: +open.toFixed(2),
      close: +close.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      volume,
      mainFlow: +mainFlow.toFixed(0),
    });
    price = close;
  }
  return data;
}

const MOCK_SECTOR_DASHBOARD: Record<string, SectorDashboardData> = {
  "半导体": {
    changePct: 3.25, changeAmt: 28.5, upCount: 86, limitUpCount: 12,
    downCount: 23, limitDownCount: 0, mainInflow: 45.8, mainInflowMom: 23.5,
    totalVolume: 1280, volumeMom: 18.2,
  },
  "AI算力": {
    changePct: -1.52, changeAmt: -15.8, upCount: 34, limitUpCount: 3,
    downCount: 78, limitDownCount: 2, mainInflow: -22.3, mainInflowMom: -15.6,
    totalVolume: 890, volumeMom: -8.5,
  },
  "机器人": {
    changePct: 5.68, changeAmt: 42.1, upCount: 95, limitUpCount: 18,
    downCount: 12, limitDownCount: 0, mainInflow: 68.2, mainInflowMom: 45.3,
    totalVolume: 1560, volumeMom: 32.8,
  },
  "新能源": {
    changePct: 0.85, changeAmt: 6.2, upCount: 55, limitUpCount: 5,
    downCount: 48, limitDownCount: 1, mainInflow: 8.5, mainInflowMom: 5.2,
    totalVolume: 720, volumeMom: 3.1,
  },
  "军工": {
    changePct: 2.15, changeAmt: 18.3, upCount: 72, limitUpCount: 8,
    downCount: 18, limitDownCount: 0, mainInflow: 32.6, mainInflowMom: 18.8,
    totalVolume: 960, volumeMom: 12.5,
  },
  "医药": {
    changePct: -0.68, changeAmt: -5.2, upCount: 42, limitUpCount: 2,
    downCount: 68, limitDownCount: 1, mainInflow: -12.8, mainInflowMom: -8.3,
    totalVolume: 650, volumeMom: -5.2,
  },
  "消费电子": {
    changePct: 1.88, changeAmt: 12.5, upCount: 65, limitUpCount: 6,
    downCount: 32, limitDownCount: 0, mainInflow: 22.4, mainInflowMom: 15.6,
    totalVolume: 780, volumeMom: 10.3,
  },
  "油气": {
    changePct: 1.35, changeAmt: 8.8, upCount: 48, limitUpCount: 4,
    downCount: 28, limitDownCount: 0, mainInflow: 15.2, mainInflowMom: 8.5,
    totalVolume: 580, volumeMom: 5.8,
  },
};

// Sector-specific stock pools
const SECTOR_STOCKS: Record<string, { code: string; name: string; concepts: string[]; fundamentals: string }[]> = {
  "半导体": [
    { code: "002371", name: "北方华创", concepts: ["半导体设备","先进封装"], fundamentals: "半导体设备龙头，国产替代核心标的，28nm以下刻蚀/薄膜设备量产验证通过，订单覆盖18个月产能。" },
    { code: "688012", name: "中微公司", concepts: ["半导体设备","刻蚀"], fundamentals: "等离子体刻蚀设备国内领先，5nm节点验证通过，MOCVD设备全球前三。" },
    { code: "688981", name: "中芯国际", concepts: ["晶圆制造","先进制程"], fundamentals: "大陆晶圆代工龙头，14nm量产，N+1/N+2工艺逐步导入。" },
    { code: "603501", name: "韦尔股份", concepts: ["CIS芯片","图像传感"], fundamentals: "全球CIS三强，车载/安防/手机三线驱动，国产替代空间大。" },
    { code: "002049", name: "紫光国微", concepts: ["特种芯片","FPGA"], fundamentals: "特种IC龙头，军工+信创双轮驱动，FPGA国产替代加速。" },
    { code: "688536", name: "思瑞浦", concepts: ["模拟芯片","信号链"], fundamentals: "信号链模拟芯片领先，产品线持续扩充，工业/汽车级认证齐全。" },
    { code: "300661", name: "圣邦股份", concepts: ["模拟芯片","电源管理"], fundamentals: "国内模拟芯片品类最全，电源/信号链双线，替代TI/ADI空间大。" },
    { code: "603986", name: "兆易创新", concepts: ["存储芯片","MCU"], fundamentals: "NOR Flash全球前三，MCU国产龙头，DRAM布局推进中。" },
    { code: "688256", name: "寒武纪", concepts: ["AI芯片","智能计算"], fundamentals: "AI芯片国产化核心标的，思元系列迭代，算力基建受益。" },
    { code: "300782", name: "卓胜微", concepts: ["射频前端","滤波器"], fundamentals: "射频前端国产替代标杆，分立器件向模组化升级。" },
    { code: "688008", name: "澜起科技", concepts: ["内存接口","DDR5"], fundamentals: "DDR5内存接口芯片全球领先，PCIe Retimer放量。" },
    { code: "600703", name: "三安光电", concepts: ["化合物半导体","MiniLED"], fundamentals: "化合物半导体综合平台，碳化硅/氮化镓产能建设积极推进。" },
    { code: "002916", name: "深南电路", concepts: ["IC载板","PCB"], fundamentals: "高端IC封装基板龙头，ABF载板突破在即，受益先进封装。" },
    { code: "603290", name: "斯达半导", concepts: ["IGBT","功率器件"], fundamentals: "国产IGBT模块龙头，车规级产品已批量供货，市占率持续提升。" },
    { code: "688396", name: "华润微", concepts: ["功率器件","晶圆代工"], fundamentals: "功率半导体IDM龙头，MOSFET/IGBT/SiC全线布局。" },
  ],
  "AI算力": [
    { code: "688256", name: "寒武纪", concepts: ["AI芯片","算力"], fundamentals: "国产AI芯片龙头，思元系列持续迭代，大模型训练推理全覆盖。" },
    { code: "000977", name: "浪潮信息", concepts: ["AI服务器","云计算"], fundamentals: "国内AI服务器市占率第一，JDM模式深入绑定头部互联网客户。" },
    { code: "603019", name: "中科曙光", concepts: ["超算","AI服务器"], fundamentals: "国产超算龙头，海光芯片生态，算力基建主力军。" },
    { code: "300308", name: "中际旭创", concepts: ["光模块","800G"], fundamentals: "全球光模块龙头，800G/1.6T领先量产，AI数据中心最大受益者。" },
    { code: "300502", name: "新易盛", concepts: ["光模块","数通"], fundamentals: "高速光模块核心供应商，400G/800G批量出货，北美云厂主力。" },
    { code: "300394", name: "天孚通信", concepts: ["光器件","光引擎"], fundamentals: "光无源器件全球领先，光引擎切入增量市场。" },
    { code: "002335", name: "科华数据", concepts: ["液冷","数据中心"], fundamentals: "数据中心液冷方案领先，腾讯/字节等核心供应商。" },
    { code: "600602", name: "云赛智联", concepts: ["IDC","算力服务"], fundamentals: "上海国资IDC龙头，算力租赁+数据要素双驱动。" },
    { code: "688111", name: "金山办公", concepts: ["AI应用","SaaS"], fundamentals: "国产办公软件绝对龙头，WPS AI全面接入大模型。" },
    { code: "300033", name: "同花顺", concepts: ["金融AI","大模型"], fundamentals: "金融科技龙头，AI赋能投研/投顾，大模型应用深化。" },
    { code: "002415", name: "海康威视", concepts: ["AI视觉","边缘计算"], fundamentals: "AI视觉全球领先，观澜大模型发布，企业级AI落地标杆。" },
    { code: "002230", name: "科大讯飞", concepts: ["大模型","语音AI"], fundamentals: "星火大模型持续迭代，教育/医疗/汽车场景多点开花。" },
    { code: "688041", name: "海光信息", concepts: ["GPU","算力芯片"], fundamentals: "国产GPU龙头，深算系列对标NVIDIA，信创+AI双驱动。" },
    { code: "300476", name: "胜宏科技", concepts: ["AI PCB","HDI"], fundamentals: "AI服务器PCB核心供应商，高多层板市占率快速提升。" },
    { code: "603893", name: "瑞芯微", concepts: ["端侧AI","SoC"], fundamentals: "端侧AI SoC龙头，智能音箱/平板/机器视觉场景全面覆盖。" },
  ],
  "机器人": [
    { code: "300124", name: "汇川技术", concepts: ["伺服系统","工业机器人"], fundamentals: "国产伺服龙头，人形机器人关节模组核心供应商。" },
    { code: "688017", name: "绿的谐波", concepts: ["谐波减速器","机器人"], fundamentals: "国产谐波减速器龙头，人形机器人关节核心零部件。" },
    { code: "300024", name: "机器人", concepts: ["工业机器人","系统集成"], fundamentals: "中科院系机器人平台，焊接/装配机器人市占率领先。" },
    { code: "002747", name: "埃斯顿", concepts: ["工业机器人","控制器"], fundamentals: "国产工业机器人龙头，自主控制器+伺服系统全覆盖。" },
    { code: "603486", name: "科沃斯", concepts: ["服务机器人","扫地机"], fundamentals: "全球服务机器人龙头，家用+商用双线，AI赋能清洁。" },
    { code: "688165", name: "埃夫特", concepts: ["工业机器人","系统集成"], fundamentals: "科创板机器人第一股，汽车/光伏行业深度布局。" },
    { code: "603728", name: "鸣志电器", concepts: ["步进电机","灵巧手"], fundamentals: "精密电机龙头，空心杯电机切入人形机器人灵巧手。" },
    { code: "002979", name: "雷赛智能", concepts: ["运动控制","控制器"], fundamentals: "运动控制核心供应商，PLC/伺服/步进全线产品。" },
    { code: "300660", name: "江苏雷利", concepts: ["微特电机","机器人关节"], fundamentals: "微特电机龙头，空心杯电机批量供货，人形机器人受益。" },
    { code: "688160", name: "步科股份", concepts: ["低压伺服","协作机器人"], fundamentals: "低压伺服系统领先，协作机器人/AGV场景深度布局。" },
    { code: "301368", name: "丰立智能", concepts: ["精密减速器","传动"], fundamentals: "精密传动件领先，行星减速器量产，谐波研发推进。" },
    { code: "688025", name: "杰普特", concepts: ["机器视觉","激光"], fundamentals: "MOPA激光器龙头，机器视觉检测切入机器人产业链。" },
    { code: "600835", name: "上海机电", concepts: ["电梯","智能制造"], fundamentals: "上海电气工业自动化平台，精密减速器布局人形机器人。" },
    { code: "603416", name: "信捷电气", concepts: ["PLC","控制系统"], fundamentals: "小型PLC国产龙头，控制器+伺服+变频器整体方案。" },
    { code: "300567", name: "精测电子", concepts: ["机器视觉","AOI检测"], fundamentals: "面板检测龙头，机器视觉检测技术延伸至半导体/新能源。" },
  ],
  "新能源": [
    { code: "300750", name: "宁德时代", concepts: ["动力电池","储能"], fundamentals: "全球动力电池龙头，市占率超35%，麒麟电池/凝聚态电池持续创新。" },
    { code: "002594", name: "比亚迪", concepts: ["新能源车","刀片电池"], fundamentals: "新能源车全球销量冠军，垂直一体化+出海战略推进。" },
    { code: "601012", name: "隆基绿能", concepts: ["光伏","硅片"], fundamentals: "光伏硅片/组件双龙头，HBC电池效率持续刷新纪录。" },
    { code: "300274", name: "阳光电源", concepts: ["逆变器","储能"], fundamentals: "全球逆变器/储能系统龙头，海外电站业务高速增长。" },
    { code: "688599", name: "天合光能", concepts: ["光伏组件","分布式"], fundamentals: "大尺寸组件龙头，210mm技术路线行业领跑。" },
    { code: "002129", name: "中环股份", concepts: ["硅片","半导体材料"], fundamentals: "210mm大硅片技术领先，光伏+半导体双赛道。" },
    { code: "300763", name: "锦浪科技", concepts: ["组串逆变器","分布式"], fundamentals: "户用逆变器龙头，海外分布式市场市占率领先。" },
    { code: "688390", name: "固德威", concepts: ["储能逆变器","户用"], fundamentals: "储能逆变器全球领先，海外户用储能爆发收益。" },
    { code: "603806", name: "福斯特", concepts: ["光伏胶膜","封装材料"], fundamentals: "光伏胶膜全球龙头，市占率超50%，POE胶膜受益N型。" },
    { code: "300118", name: "东方日升", concepts: ["光伏组件","HJT"], fundamentals: "HJT电池技术领先，异质结效率持续突破。" },
    { code: "688223", name: "晶科能源", concepts: ["光伏组件","TOPCon"], fundamentals: "TOPCon电池出货量全球第一，技术路线红利持续释放。" },
    { code: "002459", name: "晶澳科技", concepts: ["光伏组件","N型"], fundamentals: "垂直一体化组件龙头，N型产能占比快速提升。" },
    { code: "601615", name: "明阳智能", concepts: ["风电","海上风电"], fundamentals: "海上风电机组龙头，16MW超大机型全球首发。" },
    { code: "300014", name: "亿纬锂能", concepts: ["锂电池","储能"], fundamentals: "大圆柱电池量产先锋，储能电池出货量位居前列。" },
    { code: "688005", name: "容百科技", concepts: ["正极材料","高镍"], fundamentals: "三元正极材料龙头，高镍/超高镍出货量行业第一。" },
  ],
  "军工": [
    { code: "600760", name: "中航沈飞", concepts: ["战斗机","军机"], fundamentals: "军用战斗机总装龙头，J-15/J-16放量，歼-35隐身舰载机列装。" },
    { code: "600893", name: "航发动力", concepts: ["航空发动机","军品"], fundamentals: "军用航空发动机唯一整机平台，WS-10/WZ-10等型号批产。" },
    { code: "002013", name: "中航机电", concepts: ["航空机电","系统"], fundamentals: "军用航空机电系统龙头，飞控/电源/环控系统全覆盖。" },
    { code: "600862", name: "中航高科", concepts: ["航空复材","碳纤维"], fundamentals: "军用航空复合材料龙头，歼-20/运-20核心材料供应商。" },
    { code: "002025", name: "航天电器", concepts: ["军用连接器","宇航"], fundamentals: "军用高端连接器龙头，导弹/卫星/火箭核心配套。" },
    { code: "000733", name: "振华科技", concepts: ["军用电子","芯片"], fundamentals: "军工电子元器件旗舰，IGBT/MLCC/LTCC等品类齐全。" },
    { code: "300034", name: "钢研高纳", concepts: ["高温合金","航空"], fundamentals: "高温合金龙头，航空发动机涡轮叶片核心材料。" },
    { code: "688122", name: "西部超导", concepts: ["超导","航空钛合金"], fundamentals: "高端钛合金/高温合金龙头，航空/舰船材料核心供应商。" },
    { code: "600184", name: "光电股份", concepts: ["军用光电","红外"], fundamentals: "军用光电器件龙头，红外制导/光电侦察系统核心。" },
    { code: "300777", name: "中简科技", concepts: ["碳纤维","军工材料"], fundamentals: "高性能碳纤维龙头，航空航天级ZT7/ZT9系列批量供货。" },
    { code: "002389", name: "航天彩虹", concepts: ["军用无人机","航天"], fundamentals: "军用无人机龙头，彩虹系列出口全球，察打一体。" },
    { code: "600391", name: "航发科技", concepts: ["航空发动机","部件"], fundamentals: "航空发动机叶片/盘环件核心供应商，内贸/外贸双轮。" },
    { code: "688281", name: "华秦科技", concepts: ["隐身材料","特种功能"], fundamentals: "隐身材料绝对龙头，歼-20/歼-35等型号核心配套。" },
    { code: "300114", name: "中航电测", concepts: ["航空测试","MEMS"], fundamentals: "航空测试设备龙头，传感器/MEMS军民用全覆盖。" },
    { code: "300775", name: "三角防务", concepts: ["航空锻件","结构件"], fundamentals: "航空锻件龙头，机身/起落架/发动机盘轴等结构件核心。" },
  ],
  "医药": [
    { code: "600276", name: "恒瑞医药", concepts: ["创新药","抗肿瘤"], fundamentals: "国内创新药龙头，PD-1/ADC/GLP-1管线丰富，国际化推进。" },
    { code: "603259", name: "药明康德", concepts: ["CXO","CRDMO"], fundamentals: "全球CXO龙头，一体化CRDMO平台，新分子布局领先。" },
    { code: "300760", name: "迈瑞医疗", concepts: ["医疗器械","监护"], fundamentals: "国内医疗器械龙头，监护/超声/体外诊断三线发力。" },
    { code: "002007", name: "华兰生物", concepts: ["血液制品","疫苗"], fundamentals: "血液制品龙头，浆站资源稀缺，流感疫苗市占率第一。" },
    { code: "300122", name: "智飞生物", concepts: ["疫苗","代理"], fundamentals: "国内疫苗龙头，代理+自研双轮，HPV疫苗持续放量。" },
    { code: "688029", name: "南微医学", concepts: ["内镜耗材","微创"], fundamentals: "内镜诊疗耗材龙头，海外增长驱动，产品结构升级。" },
    { code: "300759", name: "康龙化成", concepts: ["CXO","药物发现"], fundamentals: "药物发现CXO龙头，实验室服务+CMC+临床全覆盖。" },
    { code: "603392", name: "万泰生物", concepts: ["HPV疫苗","体外诊断"], fundamentals: "国产HPV疫苗唯一，9价HPV疫苗获批在即。" },
    { code: "688180", name: "君实生物", concepts: ["创新药","PD-1"], fundamentals: "PD-1抑制剂出海第一梯队，国际化里程碑突破。" },
    { code: "300896", name: "爱美客", concepts: ["医美","玻尿酸"], fundamentals: "医美注射剂龙头，嗨体/濡白天使等独家产品放量。" },
    { code: "688513", name: "苑东生物", concepts: ["仿制药","创新药"], fundamentals: "特色原料药+制剂一体化，研发管线差异化，CDMO承接。" },
    { code: "688520", name: "神州细胞", concepts: ["重组蛋白","血友病"], fundamentals: "重组凝血因子龙头，血友病长效产品国内独家。" },
    { code: "300685", name: "艾德生物", concepts: ["肿瘤基因检测","伴随诊断"], fundamentals: "肿瘤伴随诊断龙头，检测试剂覆盖肺癌/肠癌等大癌种。" },
    { code: "688202", name: "美迪西", concepts: ["临床前CRO","药物评价"], fundamentals: "临床前CRO领先，一站式药物研发服务平台。" },
    { code: "300347", name: "泰格医药", concepts: ["临床CRO","数统"], fundamentals: "临床CRO龙头，国内临床资源丰富，海外增长可期。" },
  ],
  "消费电子": [
    { code: "002475", name: "立讯精密", concepts: ["精密制造","连接器"], fundamentals: "消费电子精密制造龙头，苹果核心供应商，汽车电子拓展。" },
    { code: "300433", name: "蓝思科技", concepts: ["玻璃盖板","智能穿戴"], fundamentals: "玻璃盖板全球龙头，苹果/特斯拉核心供应商，AR/VR布局。" },
    { code: "002241", name: "歌尔股份", concepts: ["声学","VR/AR"], fundamentals: "声学器件全球龙头，VR/AR整机代工第一，Meta/Pico核心。" },
    { code: "603160", name: "汇顶科技", concepts: ["指纹识别","触控"], fundamentals: "指纹识别芯片龙头，超声波屏下指纹领先，IoT扩展。" },
    { code: "300782", name: "卓胜微", concepts: ["射频前端","SAW滤波器"], fundamentals: "射频前端国产替代标杆，滤波器/PA模组化升级。" },
    { code: "002600", name: "领益智造", concepts: ["精密功能件","散热"], fundamentals: "消费电子精密功能件龙头，散热/磁材/充电器多元化。" },
    { code: "300115", name: "长盈精密", concepts: ["金属结构件","电池盒"], fundamentals: "消费电子金属结构件龙头，新能源电池盒爆发增长。" },
    { code: "603678", name: "火炬电子", concepts: ["被动元器件","MLCC"], fundamentals: "军用MLCC龙头，消费/工业MLCC全系列覆盖。" },
    { code: "300408", name: "三环集团", concepts: ["陶瓷元件","MLCC"], fundamentals: "电子陶瓷龙头，MLCC/陶瓷基板/光纤插芯品类齐全。" },
    { code: "002045", name: "国光电器", concepts: ["电声器件","智能音箱"], fundamentals: "电声器件龙头，智能音箱整机ODM，AI音箱受益。" },
    { code: "300136", name: "信维通信", concepts: ["天线","无线充电"], fundamentals: "射频天线龙头，苹果/华为核心供应商，LCP天线升级。" },
    { code: "300709", name: "精研科技", concepts: ["MIM零件","折叠屏"], fundamentals: "MIM粉末注射成型龙头，折叠屏铰链核心供应商。" },
    { code: "688036", name: "传音控股", concepts: ["手机","非洲市场"], fundamentals: "非洲手机之王，智能机渗透率提升+新市场拓展。" },
    { code: "002056", name: "横店东磁", concepts: ["磁性材料","器件"], fundamentals: "永磁/软磁材料龙头，消费电子+新能源双驱动。" },
    { code: "688533", name: "上声电子", concepts: ["车载音响","扬声器"], fundamentals: "车载扬声器龙头，智能座舱声学方案升级驱动增长。" },
  ],
  "油气": [
    { code: "601857", name: "中国石油", concepts: ["油气开采","炼化"], fundamentals: "国内最大油气生产商，上游资源储量丰富，股息率稳定。" },
    { code: "600028", name: "中国石化", concepts: ["炼油","化工"], fundamentals: "国内最大炼化企业，成品油/化工品全产业链，高股息。" },
    { code: "600938", name: "中国海油", concepts: ["海上油气","勘探"], fundamentals: "国内海上油气绝对龙头，低成本+高分红，深海资源持续发现。" },
    { code: "600583", name: "海油工程", concepts: ["海洋工程","油气服务"], fundamentals: "海上油气工程龙头，深水铺管/安装核心能力。" },
    { code: "601808", name: "中海油服", concepts: ["油田服务","钻井"], fundamentals: "海上油田技术服务龙头，亚太最大海上钻井平台船队。" },
    { code: "603619", name: "中曼石油", concepts: ["钻井工程","海外"], fundamentals: "民营钻井服务龙头，海外中东/非洲市场布局深入。" },
    { code: "002207", name: "准油股份", concepts: ["油田技术服务"], fundamentals: "新疆油田技术服务核心供应商，油服细分领域领先。" },
    { code: "300157", name: "新锦动力", concepts: ["油气装备","压裂"], fundamentals: "油气高端装备龙头，压裂设备/连续油管技术领先。" },
    { code: "002278", name: "神开股份", concepts: ["钻采设备","井控"], fundamentals: "石油钻采设备龙头，防喷器/井口装置市场占有率高。" },
    { code: "300084", name: "海默科技", concepts: ["多相流量计","测井"], fundamentals: "多相计量技术全球领先，深海/页岩油领域核心设备。" },
    { code: "000852", name: "石化机械", concepts: ["钻头","井下工具"], fundamentals: "金刚石钻头国内龙头，页岩气/深井钻探核心工具。" },
    { code: "688377", name: "迪威尔", concepts: ["特种管材","管材"], fundamentals: "油气特种合金管材领先，深海/耐腐蚀管材核心供应商。" },
    { code: "002774", name: "快意电梯", concepts: ["电梯","特种设备"], fundamentals: "电梯行业领先，中东/东南亚等油气富集区工程渗透。" },
    { code: "001332", name: "锡装股份", concepts: ["压力容器","换热器"], fundamentals: "工业换热器领先，炼化/化工行业核心设备供应商。" },
    { code: "688257", name: "新锐股份", concepts: ["硬质合金","钻头"], fundamentals: "硬质合金工具龙头，油田开采钻头/矿用工具双轮。" },
  ],
};

// Default fallback stocks for unknown sectors
const FALLBACK_STOCKS: { code: string; name: string; concepts: string[]; fundamentals: string }[] = [
  { code: "002371", name: "北方华创", concepts: ["高端制造","国产替代"], fundamentals: "高端制造设备龙头，国产替代核心标的。" },
  { code: "600519", name: "贵州茅台", concepts: ["白酒","消费升级"], fundamentals: "白酒行业绝对龙头，品牌壁垒深，现金流充裕。" },
  { code: "300750", name: "宁德时代", concepts: ["锂电池","新能源"], fundamentals: "全球动力电池龙头，市占率超35%。" },
  { code: "000858", name: "五粮液", concepts: ["白酒","高端消费"], fundamentals: "浓香白酒龙头，品牌力/渠道力双强。" },
  { code: "601318", name: "中国平安", concepts: ["保险","金融科技"], fundamentals: "综合金融集团龙头，科技赋能保险主业。" },
  { code: "002594", name: "比亚迪", concepts: ["新能源车","整车"], fundamentals: "新能源车全球冠军，垂直一体化+出海战略。" },
  { code: "601012", name: "隆基绿能", concepts: ["光伏","新能源"], fundamentals: "光伏硅片/组件双龙头，持续技术创新。" },
  { code: "600276", name: "恒瑞医药", concepts: ["创新药","医药"], fundamentals: "国内创新药龙头，研发管线深厚。" },
  { code: "600036", name: "招商银行", concepts: ["银行","零售"], fundamentals: "零售银行之王，财富管理业务行业领先。" },
  { code: "000333", name: "美的集团", concepts: ["家电","智能制造"], fundamentals: "白电龙头，全球化+ToB业务驱动增长。" },
  { code: "600900", name: "长江电力", concepts: ["水电","清洁能源"], fundamentals: "国内最大水电上市公司，现金流稳定。" },
  { code: "601899", name: "紫金矿业", concepts: ["黄金","有色"], fundamentals: "全球矿业巨头，铜/金/锂矿产资源丰富。" },
];

const TAG_POOL = [
  "国产替代", "订单落地", "突破前高", "机构重仓", "北向增持",
  "客户验证通过", "量价齐升", "底部放量", "平台突破", "景气上行",
  "政策催化", "产能释放",
];

function generateMockPickStocks(sector: string): PickStock[] {
  const pool = SECTOR_STOCKS[sector] || FALLBACK_STOCKS;
  const conceptPool = [...new Set(pool.flatMap(s => s.concepts))];

  return pool.map((n, i) => {
    const scores: StockScore = {
      mainlineStrength: 55 + Math.floor(Math.random() * 40),
      productPurity: 45 + Math.floor(Math.random() * 45),
      fundTrend: 50 + Math.floor(Math.random() * 40),
      earningsSupport: 40 + Math.floor(Math.random() * 50),
    };
    const met = [scores.mainlineStrength >= 70, scores.productPurity >= 60, scores.fundTrend >= 60, scores.earningsSupport >= 50].filter(Boolean).length;
    const grade: "A" | "B" = met >= 3 ? "A" : met >= 2 ? "B" : "B";
    const allConcepts = [...new Set([...n.concepts, ...conceptPool.slice(i % conceptPool.length, i % conceptPool.length + 3)])];
    return {
      code: n.code,
      name: n.name,
      concepts: n.concepts.slice(0, 2),
      allConcepts,
      scores,
      grade,
      changePct: +(Math.random() * 10 - 3).toFixed(2),
      mainInflow: +((Math.random() - 0.4) * 5000).toFixed(0),
      tags: [TAG_POOL[i % TAG_POOL.length], TAG_POOL[(i + 3) % TAG_POOL.length], TAG_POOL[(i + 7) % TAG_POOL.length]],
      logicLabels: [
        LOGIC_LABELS[i % LOGIC_LABELS.length].key,
        LOGIC_LABELS[(i + 2) % LOGIC_LABELS.length].key,
      ],
      scoreDetails: {
        radarData: [
          { name: "主线强度", value: scores.mainlineStrength, max: 100 },
          { name: "产品纯度", value: scores.productPurity, max: 100 },
          { name: "资金趋势", value: scores.fundTrend, max: 100 },
          { name: "业绩支撑", value: scores.earningsSupport, max: 100 },
        ],
        volumeAnalysis: `近20日均量较前20日均值放大${(20 + Math.floor(Math.random() * 60))}%，累计涨幅${(5 + Math.random() * 20).toFixed(1)}%，主力资金净流入占流通市值${(0.5 + Math.random() * 2.5).toFixed(1)}%。`,
        breakthroughCheck: `近5日均换手率较前20日均值放大${(30 + Math.floor(Math.random() * 80))}%，股价${Math.random() > 0.3 ? "已突破" : "接近"}近3个月平台高点` + (Math.random() > 0.5 ? "，确认有效突破" : "，待放量确认"),
        fundamentalBrief: n.fundamentals,
      },
    };
  }).filter(s => s.grade === "A" || s.grade === "B");
}

// Sector-specific top stocks
function generateTopStocks(pool: PickStock[]): { gain: TopStock[]; flow: TopStock[] } {
  const sortedByGain = [...pool].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  const sortedByFlow = [...pool].sort((a, b) => b.mainInflow - a.mainInflow).slice(0, 5);
  return {
    gain: sortedByGain.map((s, i) => ({ rank: i + 1, code: s.code, name: s.name, changePct: s.changePct })),
    flow: sortedByFlow.map((s, i) => ({ rank: i + 1, code: s.code, name: s.name, mainInflow: s.mainInflow })),
  };
}

function formatMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return (val / 1e4).toFixed(1) + "万";
  return val.toFixed(0);
}

function pctColor(val: number): string {
  if (val > 0) return "text-danger";
  if (val < 0) return "text-success";
  return "text-muted-foreground";
}

function scoreColor(val: number, threshold: number): string {
  return val >= threshold ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
}

// ── Sub-Component: SectorFilter ─────────────────────────────────────────

function SectorFilter({
  sector, onSectorChange, loading,
}: {
  sector: string;
  onSectorChange: (s: string) => void;
  loading: boolean;
}) {
  const [input, setInput] = useState(sector);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(sector); }, [sector]);

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const confirm = (val: string) => {
    setInput(val);
    setShowDropdown(false);
    if (val.trim()) onSectorChange(val.trim());
  };

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* Input row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => { if (e.key === "Enter") confirm(input); }}
            placeholder="请输入行业 / 概念 / 细分赛道，如：半导体材料、HBM、先进封装"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-card text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
          {input && (
            <button
              onClick={() => { setInput(""); onSectorChange(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => confirm(input)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* Dropdown suggestions */}
      {showDropdown && input && (
        <div className="absolute z-50 mt-1 w-full max-w-xl bg-card border rounded-lg shadow-lg py-1 max-h-48 overflow-auto">
          {HOT_SECTORS.filter(s => s.includes(input)).map(s => (
            <button
              key={s}
              onClick={() => confirm(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
          {input.length >= 2 && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t">
              按 Enter 搜索「{input}」
            </div>
          )}
        </div>
      )}

      {/* Hot sector tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">热门板块：</span>
        {HOT_SECTORS.map(s => (
          <button
            key={s}
            onClick={() => confirm(s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              sector === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sub-Component: SectorDashboard ──────────────────────────────────────

function SectorDashboard({ data, loading }: { data: SectorDashboardData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 h-28 animate-pulse">
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="h-6 w-24 bg-muted rounded mb-2" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "板块当日表现",
      main: (
        <span className={cn("text-2xl font-bold", pctColor(data.changePct))}>
          {data.changePct > 0 ? "+" : ""}{data.changePct.toFixed(2)}%
        </span>
      ),
      sub: (
        <span className={pctColor(data.changeAmt)}>
          {data.changeAmt > 0 ? "+" : ""}{data.changeAmt.toFixed(2)}
        </span>
      ),
    },
    {
      label: "涨跌家数",
      main: (
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="text-danger">{data.limitUpCount}涨停</span>
          <span className="text-danger">{data.upCount}↑</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-success">{data.downCount}↓</span>
          <span className="text-success">{data.limitDownCount}跌停</span>
        </div>
      ),
      sub: <span className="text-muted-foreground text-xs">上涨 {data.upCount} / 下跌 {data.downCount}</span>,
    },
    {
      label: "主力资金流向",
      main: (
        <span className={cn("text-2xl font-bold", data.mainInflow > 0 ? "text-danger" : "text-success")}>
          {data.mainInflow > 0 ? "+" : ""}{data.mainInflow.toFixed(1)}亿
        </span>
      ),
      sub: (
        <span className={pctColor(data.mainInflowMom)}>
          环比 {data.mainInflowMom > 0 ? "+" : ""}{data.mainInflowMom.toFixed(1)}%
        </span>
      ),
    },
    {
      label: "板块成交额",
      main: (
        <span className="text-2xl font-bold text-foreground">
          {data.totalVolume.toFixed(0)}亿
        </span>
      ),
      sub: (
        <span className={pctColor(data.volumeMom)}>
          较昨日 {data.volumeMom > 0 ? "+" : ""}{data.volumeMom.toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <div>{c.main}</div>
          <div>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Sub-Component: SectorTrendCharts ────────────────────────────────────

function SectorTrendCharts({
  klineData, topGain, topFlow, onStockClick,
}: {
  klineData: KlineItem[];
  topGain: TopStock[];
  topFlow: TopStock[];
  onStockClick: (code: string) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [listTab, setListTab] = useState<"gain" | "flow">("gain");

  // Filter kline based on period
  const displayKline = useMemo(() => {
    if (period === "day") return klineData;
    // Simulate weekly: take every 5th entry
    return klineData.filter((_, i) => i % 5 === 0);
  }, [klineData, period]);

  useEffect(() => {
    if (!chartRef.current || displayKline.length === 0) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    const dates = displayKline.map(d => d.date);
    const ohlc = displayKline.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = displayKline.map(d => d.volume);
    const flows = displayKline.map(d => d.mainFlow);

    // Calculate MAs
    const calcMA = (n: number) => {
      const result: (number | null)[] = [];
      for (let i = 0; i < displayKline.length; i++) {
        if (i < n - 1) { result.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < n; j++) sum += displayKline[i - j].close;
        result.push(+(sum / n).toFixed(2));
      }
      return result;
    };

    const option = {
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      grid: [
        { left: "8%", right: "8%", top: "6%", height: "48%" },
        { left: "8%", right: "8%", top: "60%", height: "16%" },
        { left: "8%", right: "8%", top: "80%", height: "14%" },
      ],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, axisLabel: { show: false } },
        { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false } },
        { type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 10, rotate: 30 } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, splitLine: { lineStyle: { color: "#e5e7eb", type: "dashed" } } },
        { type: "value", gridIndex: 1, splitLine: { show: false }, axisLabel: { show: false } },
        { type: "value", gridIndex: 2, splitLine: { show: false }, axisLabel: { fontSize: 10 } },
      ],
      series: [
        {
          type: "candlestick", data: ohlc, xAxisIndex: 0, yAxisIndex: 0,
          itemStyle: {
            color: "#ef4444", color0: "#22c55e",
            borderColor: "#ef4444", borderColor0: "#22c55e",
          },
          markLine: { silent: true, symbol: "none", data: [] },
        },
        { type: "line", data: calcMA(5), xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { color: "#f59e0b", width: 1 }, symbol: "none", name: "MA5" },
        { type: "line", data: calcMA(10), xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { color: "#3b82f6", width: 1 }, symbol: "none", name: "MA10" },
        { type: "line", data: calcMA(20), xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { color: "#8b5cf6", width: 1 }, symbol: "none", name: "MA20" },
        {
          type: "bar", data: volumes, xAxisIndex: 1, yAxisIndex: 1,
          itemStyle: {
            color: (_params: any) => {
              const idx = _params.dataIndex;
              if (idx === undefined) return "#e5e7eb";
              return ohlc[idx]?.[1] >= ohlc[idx]?.[0] ? "#ef4444" : "#22c55e";
            },
          },
        },
        {
          type: "line", data: flows, xAxisIndex: 2, yAxisIndex: 2,
          smooth: true, symbol: "none",
          lineStyle: { color: "#f59e0b", width: 1.5 },
          areaStyle: { color: "rgba(245,158,11,0.1)" },
          name: "主力净流入",
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [displayKline]);

  const listData = listTab === "gain" ? topGain : topFlow;

  return (
    <div className="flex gap-3">
      {/* Chart area */}
      <div className="flex-1 min-w-0 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["day", "week"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "day" ? "日K" : "周K"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            MA5 <span className="text-amber-500 font-bold">●</span>{" "}
            MA10 <span className="text-blue-500 font-bold">●</span>{" "}
            MA20 <span className="text-purple-500 font-bold">●</span>
          </span>
        </div>
        <div ref={chartRef} className="w-full" style={{ height: 400 }} />
      </div>

      {/* Ranking panel */}
      <div className="w-64 shrink-0 rounded-xl border bg-card p-4 flex flex-col">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mb-3">
          {(["gain", "flow"] as const).map(t => (
            <button
              key={t}
              onClick={() => setListTab(t)}
              className={cn(
                "flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                listTab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "gain" ? "涨幅榜 Top5" : "资金流入榜 Top5"}
            </button>
          ))}
        </div>
        <div className="space-y-1 flex-1">
          {listData.map(stock => (
            <button
              key={stock.code}
              onClick={() => onStockClick(stock.code)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                stock.rank <= 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {stock.rank}
              </span>
              <span className="text-sm font-medium truncate flex-1">{stock.name}</span>
              {listTab === "gain" ? (
                <span className={cn("text-xs font-mono font-medium", pctColor(stock.changePct!))}>
                  {stock.changePct! > 0 ? "+" : ""}{stock.changePct!.toFixed(2)}%
                </span>
              ) : (
                <span className={cn("text-xs font-mono", stock.mainInflow! > 0 ? "text-danger" : "text-success")}>
                  {formatMoney(stock.mainInflow!)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sub-Component: PickLogicConfig ──────────────────────────────────────

function PickLogicConfig({
  logicLabels, setLogicLabels,
  thresholds, setThresholds,
  auxFilters, setAuxFilters,
  templateEnabled, setTemplateEnabled,
}: {
  logicLabels: string[];
  setLogicLabels: (v: string[]) => void;
  thresholds: typeof DEFAULT_THRESHOLDS;
  setThresholds: (v: typeof DEFAULT_THRESHOLDS) => void;
  auxFilters: string[];
  setAuxFilters: (v: string[]) => void;
  templateEnabled: boolean;
  setTemplateEnabled: (v: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleLogic = (key: string) => {
    if (logicLabels.includes(key)) {
      if (logicLabels.length > 1) setLogicLabels(logicLabels.filter(k => k !== key));
    } else {
      setLogicLabels([...logicLabels, key]);
    }
  };

  const toggleAux = (key: string) => {
    if (auxFilters.includes(key)) {
      setAuxFilters(auxFilters.filter(k => k !== key));
    } else {
      setAuxFilters([...auxFilters, key]);
    }
  };

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">选股逻辑配置</span>
          <span className="text-xs text-muted-foreground">
            ({logicLabels.length}/{LOGIC_LABELS.length} 逻辑 · {auxFilters.length}/{AUX_FILTERS.length} 筛选)
          </span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 border-t">
          {/* 1. Logic tags */}
          <div className="pt-3">
            <p className="text-xs text-muted-foreground mb-2">六大底层逻辑（多选，至少保留 1 个）</p>
            <div className="flex flex-wrap gap-2">
              {LOGIC_LABELS.map(({ key, label, icon: Icon, color }) => {
                const active = logicLabels.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleLogic(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      active
                        ? "border-current shadow-sm"
                        : "border-border text-muted-foreground hover:border-muted-foreground",
                    )}
                    style={active ? { color, borderColor: color, backgroundColor: `${color}10` } : {}}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Template toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={templateEnabled}
                onChange={(e) => setTemplateEnabled(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary/30"
              />
              <span className="text-sm font-medium">启用短线优选模板</span>
              <span className="text-xs text-muted-foreground">
                （开启后自动套用量化阈值）
              </span>
            </label>
          </div>

          {/* 3. Threshold sliders */}
          {templateEnabled && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {([
                { key: "mainlineStrength" as const, label: "主线强度", threshold: thresholds.mainlineStrength, rec: 70 },
                { key: "productPurity" as const, label: "产品纯度", threshold: thresholds.productPurity, rec: 60 },
                { key: "fundTrend" as const, label: "资金趋势", threshold: thresholds.fundTrend, rec: 60 },
                { key: "earningsSupport" as const, label: "业绩/订单支撑", threshold: thresholds.earningsSupport, rec: 50 },
              ]).map(({ key, label, threshold, rec }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className={cn(
                      "text-xs font-mono font-bold",
                      threshold >= rec ? "text-emerald-600" : "text-orange-500",
                    )}>
                      {threshold} 分
                    </span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={95}
                    value={threshold}
                    onChange={(e) => setThresholds({ ...thresholds, [key]: +e.target.value })}
                    className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Grading hint */}
          {templateEnabled && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
              <span className="font-semibold text-foreground">分级规则：</span>
              满足 ≥3 项为 <span className="text-danger font-semibold">A 级优选</span>，
              满足 2 项为 <span className="text-amber-500 font-semibold">B 级观察</span>，
              ≤1 项 <span className="text-muted-foreground line-through">直接剔除</span>
            </p>
          )}

          {/* 4. Auxiliary filters */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">辅助筛选</p>
            <div className="flex flex-wrap gap-2">
              {AUX_FILTERS.map(({ key, label }) => {
                const active = auxFilters.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleAux(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all",
                      active
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground",
                    )}
                  >
                    <Filter className="h-3 w-3" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-Component: PickResultList ───────────────────────────────────────

function PickResultList({
  stocks, logicLabels, thresholds,
  onStockClick,
}: {
  stocks: PickStock[];
  logicLabels: string[];
  thresholds: typeof DEFAULT_THRESHOLDS;
  onStockClick: (code: string) => void;
}) {
  const [gradeTab, setGradeTab] = useState<"A" | "B">("A");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  // Filter by logic labels
  const filtered = useMemo(() => {
    return stocks.filter(s =>
      s.logicLabels.some(l => logicLabels.includes(l))
    );
  }, [stocks, logicLabels]);

  // Grade groups
  const aStocks = useMemo(() => filtered.filter(s => s.grade === "A"), [filtered]);
  const bStocks = useMemo(() => filtered.filter(s => s.grade === "B"), [filtered]);

  const displayStocks = gradeTab === "A" ? aStocks : bStocks;

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return displayStocks;
    return [...displayStocks].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "name") { va = a.name.charCodeAt(0); vb = b.name.charCodeAt(0); }
      else if (sortKey === "changePct") { va = a.changePct; vb = b.changePct; }
      else if (sortKey === "mainInflow") { va = a.mainInflow; vb = b.mainInflow; }
      else {
        va = (a.scores as any)[sortKey] ?? 0;
        vb = (b.scores as any)[sortKey] ?? 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [displayStocks, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  return (
    <div className="space-y-3">
      {/* Grade tabs */}
      <div className="flex items-center gap-2">
        {(["A", "B"] as const).map(g => {
          const count = g === "A" ? aStocks.length : bStocks.length;
          return (
            <button
              key={g}
              onClick={() => { setGradeTab(g); setExpandedCode(null); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                gradeTab === g
                  ? g === "A"
                    ? "bg-danger/10 border-danger/30 text-danger"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {g === "A" ? "⭐ A 级优选" : "🔍 B 级观察"}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-xs font-bold",
                gradeTab === g ? "bg-background" : "bg-muted",
              )}>
                {count} 只
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {[
                  { key: "name", label: "股票名称", w: "min-w-[140px]" },
                  { key: null, label: "所属概念", w: "min-w-[120px]" },
                  { key: "mainlineStrength", label: "主线强度", w: "min-w-[80px]" },
                  { key: "productPurity", label: "产品纯度", w: "min-w-[80px]" },
                  { key: "fundTrend", label: "资金趋势", w: "min-w-[80px]" },
                  { key: "earningsSupport", label: "业绩支撑", w: "min-w-[80px]" },
                  { key: "changePct", label: "当日涨幅", w: "min-w-[80px]" },
                  { key: "mainInflow", label: "主力资金", w: "min-w-[90px]" },
                  { key: null, label: "核心标签", w: "min-w-[160px]" },
                  { key: null, label: "操作", w: "min-w-[120px]" },
                ].map(col => (
                  <th
                    key={col.key || col.label}
                    className={cn(
                      "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground",
                      col.w,
                      col.key && "cursor-pointer hover:text-foreground select-none",
                    )}
                    onClick={() => col.key && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.key && <SortIcon col={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(stock => (
                <StockRow
                  key={stock.code}
                  stock={stock}
                  thresholds={thresholds}
                  expanded={expandedCode === stock.code}
                  onToggle={() => setExpandedCode(expandedCode === stock.code ? null : stock.code)}
                  onView={() => onStockClick(stock.code)}
                />
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-muted-foreground">
                    当前筛选条件下无匹配标的
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Single Stock Row ────────────────────────────────────────────────────

function StockRow({
  stock, thresholds, expanded, onToggle, onView,
}: {
  stock: PickStock;
  thresholds: typeof DEFAULT_THRESHOLDS;
  expanded: boolean;
  onToggle: () => void;
  onView: () => void;
}) {
  const scoreCells = [
    { val: stock.scores.mainlineStrength, threshold: thresholds.mainlineStrength },
    { val: stock.scores.productPurity, threshold: thresholds.productPurity },
    { val: stock.scores.fundTrend, threshold: thresholds.fundTrend },
    { val: stock.scores.earningsSupport, threshold: thresholds.earningsSupport },
  ];

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <a
            href={`https://stockpage.10jqka.com.cn/${stock.code}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 hover:text-primary transition-colors"
            title="在同花顺打开"
          >
            <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{stock.name}</span>
            <span className="text-xs text-muted-foreground ml-0.5">{stock.code}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
          </a>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {stock.concepts.map((c, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground" title={stock.allConcepts.join("、")}>
                {c}
              </span>
            ))}
          </div>
        </td>
        {scoreCells.map(({ val, threshold }, i) => (
          <td key={i} className={cn("px-3 py-2.5 font-mono text-xs font-medium", scoreColor(val, threshold))}>
            {val}
          </td>
        ))}
        <td className={cn("px-3 py-2.5 font-mono text-xs font-medium", pctColor(stock.changePct))}>
          {stock.changePct > 0 ? "+" : ""}{stock.changePct.toFixed(2)}%
        </td>
        <td className={cn("px-3 py-2.5 font-mono text-xs", stock.mainInflow > 0 ? "text-danger" : "text-success")}>
          {stock.mainInflow > 0 ? "+" : ""}{formatMoney(stock.mainInflow)}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {stock.tags.map((t, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
                {t}
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onView}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-muted hover:bg-muted-foreground/20 transition-colors"
            >
              <Star className="h-3 w-3" />
              加自选
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`https://stockpage.10jqka.com.cn/${stock.code}/`, "_blank", "noopener noreferrer"); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              详情
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={10} className="px-4 py-4 bg-muted/20 border-b">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Radar chart placeholder */}
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs font-semibold mb-2">六维打分雷达</p>
                <div className="flex items-center justify-center h-44">
                  <SimpleRadar data={stock.scoreDetails.radarData} />
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {stock.scoreDetails.radarData.map(d => (
                    <div key={d.name} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-mono font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Volume & breakthrough */}
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div>
                  <p className="text-xs font-semibold">20日量价数据</p>
                  <p className="text-xs text-muted-foreground mt-1">{stock.scoreDetails.volumeAnalysis}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold">5日突破验证</p>
                  <p className="text-xs text-muted-foreground mt-1">{stock.scoreDetails.breakthroughCheck}</p>
                </div>
              </div>

              {/* Fundamental brief */}
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs font-semibold mb-1">基本面核心逻辑</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{stock.scoreDetails.fundamentalBrief}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {stock.logicLabels.map(l => {
                    const info = LOGIC_LABELS.find(ll => ll.key === l);
                    return info ? (
                      <span key={l} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: info.color, backgroundColor: `${info.color}15` }}>
                        {info.label}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Simple SVG Radar ────────────────────────────────────────────────────

function SimpleRadar({ data }: { data: { name: string; value: number; max: number }[] }) {
  const cx = 100, cy = 90, r = 60, sides = data.length;
  const angleSlice = (2 * Math.PI) / sides;

  const getPoint = (i: number, val: number, max: number) => {
    const angle = angleSlice * i - Math.PI / 2;
    const dist = (val / max) * r;
    return `${cx + dist * Math.cos(angle)},${cy + dist * Math.sin(angle)}`;
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = gridLevels.map(level =>
    Array.from({ length: sides }, (_, i) => getPoint(i, level * 100, 100)).join(" ")
  );

  const dataPolygon = data.map((d, i) => getPoint(i, d.value, d.max)).join(" ");

  return (
    <svg viewBox="0 0 200 180" className="w-full h-full max-w-[200px]">
      {/* Grid */}
      {gridPolygons.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
      ))}
      {/* Axes */}
      {data.map((_, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        return (
          <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="#e5e7eb" strokeWidth="0.5" />
        );
      })}
      {/* Data */}
      <polygon points={dataPolygon} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Dots */}
      {data.map((d, i) => {
        const [x, y] = getPoint(i, d.value, d.max).split(",");
        return <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6" />;
      })}
    </svg>
  );
}

// ── Sub-Component: StrategyFloatPanel ───────────────────────────────────

function StrategyFloatPanel() {
  const [collapsed, setCollapsed] = useState(false);

  const tips = [
    {
      title: "当日主线催化",
      content: "优先核查对应赛道是否有政策、产业、技术新利好，无催化的上涨不轻易追高。",
    },
    {
      title: "识别资金龙头",
      content: "不以单日涨幅判定，以「成交额 + 换手率 + 主力资金」三者共振为龙头标准。",
    },
    {
      title: "只做突破确认",
      content: "趋势标的需放量突破平台/前高且站稳再介入，不博弈低位横盘反转。",
    },
    {
      title: "买强不买弱",
      content: "同一主线仅聚焦资金认可度最高的 1-3 只龙头，规避跟风杂毛股。",
    },
  ];

  return (
    <div className={cn(
      "fixed right-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-300",
      collapsed ? "translate-x-[calc(100%-36px)]" : "translate-x-0",
    )}>
      <div className="flex">
        {/* Toggle button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 w-9 h-24 flex items-center justify-center rounded-l-lg border border-r-0 bg-card hover:bg-muted transition-colors"
          title={collapsed ? "展开策略提示" : "收起策略提示"}
        >
          {collapsed ? (
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <PanelRightClose className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Content */}
        {!collapsed && (
          <div className="w-64 rounded-l-lg border bg-card shadow-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-bold">短线实操策略</span>
            </div>
            {tips.map((tip, i) => (
              <div key={i} className={cn(
                "rounded-lg p-2.5 text-xs leading-relaxed",
                i % 2 === 0 ? "bg-muted/50" : "",
              )}>
                <p className="font-semibold text-foreground mb-0.5">{tip.title}</p>
                <p className="text-muted-foreground">{tip.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function StockPick() {
  const [sector, setSector] = useState("半导体");
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<SectorDashboardData | null>(null);
  const [klineData, setKlineData] = useState<KlineItem[]>([]);
  const [stocks, setStocks] = useState<PickStock[]>([]);
  const [topGain, setTopGain] = useState<TopStock[]>([]);
  const [topFlow, setTopFlow] = useState<TopStock[]>([]);

  // Config states
  const [logicLabels, setLogicLabels] = useState<string[]>(LOGIC_LABELS.map(l => l.key));
  const [thresholds, setThresholds] = useState<typeof DEFAULT_THRESHOLDS>({ ...DEFAULT_THRESHOLDS });
  const [auxFilters, setAuxFilters] = useState<string[]>(AUX_FILTERS.map(f => f.key));
  const [templateEnabled, setTemplateEnabled] = useState(true);

  // Handle sector change
  const handleSectorChange = useCallback((s: string) => {
    setSector(s);
    if (!s) {
      setDashboard(null);
      setKlineData([]);
      setStocks([]);
      return;
    }
    setLoading(true);

    // Simulate async data fetch
    setTimeout(() => {
      setDashboard(MOCK_SECTOR_DASHBOARD[s] || {
        changePct: +(Math.random() * 8 - 2).toFixed(2),
        changeAmt: +(Math.random() * 60 - 15).toFixed(1),
        upCount: Math.floor(Math.random() * 60 + 20),
        limitUpCount: Math.floor(Math.random() * 10),
        downCount: Math.floor(Math.random() * 40 + 10),
        limitDownCount: Math.floor(Math.random() * 3),
        mainInflow: +((Math.random() - 0.4) * 100).toFixed(1),
        mainInflowMom: +((Math.random() - 0.3) * 50).toFixed(1),
        totalVolume: Math.floor(Math.random() * 2000 + 300),
        volumeMom: +((Math.random() - 0.3) * 40).toFixed(1),
      });
      setKlineData(generateMockKline(90));
      const newStocks = generateMockPickStocks(s);
      setStocks(newStocks);
      const tops = generateTopStocks(newStocks);
      setTopGain(tops.gain);
      setTopFlow(tops.flow);
      setLoading(false);
    }, 600);
  }, []);

  // Initial load
  useEffect(() => {
    handleSectorChange("半导体");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTHS = (code: string) => {
    window.open(`https://stockpage.10jqka.com.cn/${code}/`, "_blank", "noopener noreferrer");
  };

  const handleStockClick = openTHS;

  return (
    <div className="relative">
      {/* Main content */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Module 1: Sector Filter */}
        <SectorFilter sector={sector} onSectorChange={handleSectorChange} loading={loading} />

        {/* Module 2: Dashboard */}
        <SectorDashboard data={dashboard} loading={loading} />

        {/* Module 3: Trend Charts */}
        {klineData.length > 0 && (
          <SectorTrendCharts
            klineData={klineData}
            topGain={topGain}
            topFlow={topFlow}
            onStockClick={handleStockClick}
          />
        )}

        {/* Module 4: Logic Config */}
        <PickLogicConfig
          logicLabels={logicLabels}
          setLogicLabels={setLogicLabels}
          thresholds={thresholds}
          setThresholds={setThresholds}
          auxFilters={auxFilters}
          setAuxFilters={setAuxFilters}
          templateEnabled={templateEnabled}
          setTemplateEnabled={setTemplateEnabled}
        />

        {/* Module 5: Result List */}
        {stocks.length > 0 && (
          <PickResultList
            stocks={stocks}
            logicLabels={logicLabels}
            thresholds={thresholds}
            onStockClick={handleStockClick}
          />
        )}
      </div>

      {/* Module 6: Floating Strategy Panel */}
      <StrategyFloatPanel />
    </div>
  );
}

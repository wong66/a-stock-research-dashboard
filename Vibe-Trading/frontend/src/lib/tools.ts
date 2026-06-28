/**
 * Single source of truth for tool name → user-facing label.
 */
export const TOOL_LABELS: Record<string, string> = {
  load_skill: "加载策略知识库",
  write_file: "生成代码",
  edit_file: "编辑代码",
  read_file: "读取文件",
  run_backtest: "运行回测",
  bash: "运行命令",
  read_url: "读取网页",
  read_document: "读取文档",
  trading_connections: "列出交易连接器",
  trading_select_connection: "选择交易连接器",
  trading_check: "检查交易连接器",
  trading_account: "读取连接器账户",
  trading_positions: "读取连接器持仓",
  trading_orders: "读取连接器订单",
  trading_quote: "读取连接器报价",
  trading_history: "读取连接器历史",
  compact: "压缩对话摘要",
  create_task: "创建任务",
  update_task: "更新任务",
  spawn_subagent: "生成子智能体",
};

export function localizeToolName(tool: string, fallback?: string): string {
  if (tool in TOOL_LABELS) {
    return TOOL_LABELS[tool];
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return tool;
}

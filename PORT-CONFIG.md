# 端口配置统一说明

## 服务端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Vibe-Trading 前端 (Vite) | **5899** | 开发服务器 |
| Vibe-Trading 后端 (FastAPI) | **8898** | API 服务器 |
| astock-peg (Next.js) | **3000** | PEG 分析服务 |

## 配置文件位置

### 前端配置
- `.env.development.local`: `VITE_API_URL=http://127.0.0.1:8898`
- `vite.config.ts`: `port: 5899`, `apiTarget: http://127.0.0.1:8898`
- Vite 代理配置:
  - `/alpha` → `http://127.0.0.1:8898`
  - `/peg-api/*` → `http://127.0.0.1:3000/api/*`

### 后端配置
- `agent/.env`: `API_PORT=8898`

### Launchd 服务
- `~/Library/LaunchAgents/com.local.vibevite.plist` - 前端服务
- `~/Library/LaunchAgents/com.local.vibebackend.plist` - 后端服务
- `~/Library/LaunchAgents/com.local.astockpeg.plist` - PEG 服务

## 启动脚本

- `~/.local/bin/start-vibe-frontend.sh` - 前端启动脚本
- `~/.local/bin/start-vibe-backend.sh` - 后端启动脚本
- `~/.local/bin/start-astock-peg.sh` - PEG 启动脚本

## 服务管理命令

```bash
# 加载服务（开机自启）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.vibevite.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.vibebackend.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.astockpeg.plist

# 启动服务
launchctl kickstart -k gui/$(id -u)/com.local.vibevite
launchctl kickstart -k gui/$(id -u)/com.local.vibebackend
launchctl kickstart -k gui/$(id -u)/com.local.astockpeg

# 停止服务
launchctl bootout gui/$(id -u)/com.local.vibevite
launchctl bootout gui/$(id -u)/com.local.vibebackend
launchctl bootout gui/$(id -u)/com.local.astockpeg

# 查看服务状态
launchctl list | grep com.local
```

## 日志文件

- 前端: `/tmp/vibe-frontend.log`
- 后端: `/tmp/vibe-backend.log`
- PEG: `/tmp/astock-peg.log`
- Launchd 标准输出: `/tmp/vibe-frontend.out`, `/tmp/vibe-backend.out`, `/tmp/astock-peg.out`
- Launchd 错误输出: `/tmp/vibe-frontend.err`, `/tmp/vibe-backend.err`, `/tmp/astock-peg.err`

## 故障排查

如果遇到端口被占用：
```bash
# 查找占用端口的进程
lsof -ti:5899  # 前端
lsof -ti:8898  # 后端
lsof -ti:3000  # PEG

# 杀掉进程
kill -9 $(lsof -ti:5899)
kill -9 $(lsof -ti:8898)
kill -9 $(lsof -ti:3000)
```

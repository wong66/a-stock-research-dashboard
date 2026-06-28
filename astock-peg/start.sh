#!/bin/bash
cd /Users/wangzhiping/Claude/大A投研看板/astock-peg/web

# 先杀掉旧进程
kill $(lsof -ti :3000) 2>/dev/null

echo "🚀 启动 astock-peg PEG 估值看板..."
echo "   地址: http://localhost:3000"
echo "   按 Ctrl+C 停止服务"
echo ""

exec /Users/wangzhiping/.workbuddy/binaries/node/versions/22.22.2/bin/npm run dev

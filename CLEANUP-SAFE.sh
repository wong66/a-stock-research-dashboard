#!/bin/bash
# 安全清理脚本 - 只删除可以完全恢复的文件
# 不会影响 Vibe-Trading 的运行和代码

echo "🧹 开始安全清理大A投研看板文件夹..."
echo "⚠️  只会删除可以完全恢复的文件（node_modules, 缓存等）"
echo ""

TOTAL_SAVED=0

# 1. 删除前端 node_modules (275MB) - 可通过 npm install 恢复
if [ -d "/Users/wangzhiping/Claude/大A投研看板/Vibe-Trading/frontend/node_modules" ]; then
    SIZE=$(du -sm "/Users/wangzhiping/Claude/大A投研看板/Vibe-Trading/frontend/node_modules" | cut -f1)
    echo "📦 删除 Vibe-Trading/frontend/node_modules (${SIZE}MB)..."
    rm -rf "/Users/wangzhiping/Claude/大A投研看板/Vibe-Trading/frontend/node_modules"
    TOTAL_SAVED=$((TOTAL_SAVED + SIZE))
    echo "  ✅ 已删除，需要时可运行: cd Vibe-Trading/frontend && npm install"
else
    echo "  ⏭️  Vibe-Trading/frontend/node_modules 不存在，跳过"
fi
echo ""

# 2. 删除 astock-peg node_modules (525MB) - 可通过 npm install 恢复
if [ -d "/Users/wangzhiping/Claude/大A投研看板/astock-peg/web/node_modules" ]; then
    SIZE=$(du -sm "/Users/wangzhiping/Claude/大A投研看板/astock-peg/web/node_modules" | cut -f1)
    echo "📦 删除 astock-peg/web/node_modules (${SIZE}MB)..."
    rm -rf "/Users/wangzhiping/Claude/大A投研看板/astock-peg/web/node_modules"
    TOTAL_SAVED=$((TOTAL_SAVED + SIZE))
    echo "  ✅ 已删除，需要时可运行: cd astock-peg/web && npm install"
else
    echo "  ⏭️  astock-peg/web/node_modules 不存在，跳过"
fi
echo ""

# 3. 删除 Python 缓存文件 - 会自动重新生成
echo "🐍 删除 Python __pycache__ 和 .egg-info..."
find "/Users/wangzhiping/Claude/大A投研看板" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find "/Users/wangzhiping/Claude/大A投研看板" -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null
find "/Users/wangzhiping/Claude/大A投研看板" -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null
echo "  ✅ 已删除 Python 缓存"
echo ""

# 4. 删除 .DS_Store 文件
echo "🗑️  删除 .DS_Store 文件..."
find "/Users/wangzhiping/Claude/大A投研看板" -name ".DS_Store" -delete 2>/dev/null
echo "  ✅ 已删除所有 .DS_Store"
echo ""

# 5. 删除前端构建产物（如果有）- 可重新构建
if [ -d "/Users/wangzhiping/Claude/大A投研看板/Vibe-Trading/frontend/dist" ]; then
    SIZE=$(du -sm "/Users/wangzhiping/Claude/大A投研看板/Vibe-Trading/frontend/dist" | cut -f1)
    echo "🏗️  删除前端构建产物 dist/ (${SIZE}MB)..."
    rm -rf "/Users/wangzhiping/Claude/大A投研看板/Vibe-Trading/frontend/dist"
    TOTAL_SAVED=$((TOTAL_SAVED + SIZE))
    echo "  ✅ 已删除，需要时可运行: cd Vibe-Trading/frontend && npm run build"
else
    echo "  ⏭️  前端 dist/ 不存在，跳过"
fi
echo ""

echo "========================================="
echo "✅ 清理完成！"
echo "💾 释放空间约: ${TOTAL_SAVED}MB"
echo ""
echo "📝 恢复依赖命令："
echo "  Vibe-Trading 前端: cd Vibe-Trading/frontend && npm install"
echo "  astock-peg: cd astock-peg/web && npm install"
echo ""
echo "⚠️  注意："
echo "  1. 删除 node_modules 后，需要重新安装依赖才能运行"
echo "  2. 所有源代码、配置文件、.env 都已保留"
echo "  3. 如果服务正在运行，删除 node_modules 不会影响运行中的服务"

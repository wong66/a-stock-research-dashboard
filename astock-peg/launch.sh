#!/bin/bash
# astock-peg launcher for launchd
# This script is called by launchd to start the Next.js dev server

export PATH="/Users/wangzhiping/.workbuddy/binaries/node/versions/22.22.2/bin:/opt/anaconda3/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/wangzhiping"

LOG="/tmp/astock-peg.log"

# Kill any existing process on port 3000
lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null

echo "=== astock-peg starting at $(date) ===" >> "$LOG"

cd /Users/wangzhiping/Claude/大A投研看板/astock-peg/web
exec /Users/wangzhiping/.workbuddy/binaries/node/versions/22.22.2/bin/npm run dev >> "$LOG" 2>&1

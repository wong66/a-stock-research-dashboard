import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import { getPythonBin } from "@/lib/python";

interface DetectResult {
  industry: string;
  tickers: string[];
  error?: string;
}

const SCRIPTS_DIR = path.join(process.cwd(), "..", "scripts");
const IS_PURE_DIGIT = /^\d{6}$/;

/** 调用 resolve_ticker.py 将名称解析为 6 位代码 */
function resolveTicker(query: string): Promise<{ code: string; name: string }> {
  return new Promise((resolve, reject) => {
    const script = path.join(SCRIPTS_DIR, "resolve_ticker.py");
    execFile(getPythonBin(), [script, query], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        const result = JSON.parse(stdout);
        if (result.error) return reject(new Error(result.error));
        resolve(result);
      } catch {
        reject(new Error("解析返回格式异常"));
      }
    });
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("ticker");

  if (!raw || !raw.trim()) {
    return NextResponse.json(
      { error: "请输入股票代码或名称" },
      { status: 400 },
    );
  }

  let ticker = raw.trim();

  // 如果不是纯 6 位数字，尝试通过 resolve_ticker.py 解析名称
  if (!IS_PURE_DIGIT.test(ticker)) {
    try {
      const resolved = await resolveTicker(ticker);
      ticker = resolved.code;
    } catch (e: unknown) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "股票名称解析失败" },
        { status: 400 },
      );
    }
  }

  const script = path.join(SCRIPTS_DIR, "detect_sector.py");

  try {
    const result = await new Promise<DetectResult>((resolve, reject) => {
      execFile(
        getPythonBin(),
        [script, ticker],
        { timeout: 20000, env: { ...process.env, NO_PROXY: "*" } },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error("解析行业数据失败"));
          }
        },
      );
    });

    if (!result.tickers || result.tickers.length === 0) {
      return NextResponse.json(
        { error: "未找到该股票的行业信息" },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "行业检测失败" },
      { status: 500 },
    );
  }
}

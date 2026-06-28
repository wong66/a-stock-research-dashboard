import { useEffect, useRef, useState, useCallback } from "react";
import { echarts } from "@/lib/echarts";

/**
 * 通用 ECharts hook：IntersectionObserver 懒加载 + 自动 resize/dispose
 *
 * 解决问题：
 *  - 页面同时渲染 10+ 图表时，所有 echarts.init 在首帧同时执行 → 卡顿
 *  - 使用 IntersectionObserver 延迟初始化，仅当图表进入可视区域才创建实例
 *  - 关键修复：setOption 是 ready-aware 的稳定引用 + 缓存机制双保险
 *    - 数据在图表可见前就绪 → 缓存最新 option，初始化后立即重放
 *    - 数据到达后图表才初始化 → 初始化完成后重放缓存
 *
 * 用法：
 * ```tsx
 * function MyChart({ dates, data }) {
 *   const { ref, setOption } = useECharts();
 *   useEffect(() => {
 *     setOption({ xAxis: { data: dates }, series: [{ data }] });
 *   }, [setOption, dates, data]);
 *   return <div ref={ref} style={{ height: 200 }} />;
 * }
 * ```
 */
export function useECharts(options?: { rootMargin?: string; threshold?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [visible, setVisible] = useState(false);
  // 实例是否已经就绪（init 完成）— 用 state 触发依赖此值的 setOption 重建
  const [ready, setReady] = useState(false);
  // 缓存最后一次 setOption 调用：图表可见前数据已就绪时，等实例初始化后重放
  const pendingOptionRef = useRef<{ option: any; notMerge?: boolean } | null>(null);

  // ── IntersectionObserver：延迟到可见时才 init ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect(); // 一旦可见就不再观察
        }
      },
      { rootMargin: options?.rootMargin ?? "200px", threshold: options?.threshold ?? 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options?.rootMargin, options?.threshold]);

  // ── 可见后初始化 ECharts 实例 ──
  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const inst = echarts.init(containerRef.current);
    instanceRef.current = inst;

    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(containerRef.current);
    roRef.current = ro;

    // 触发 setOption 的重建（ready: false → true），让调用方的 useEffect 重跑
    setReady(true);

    // 如果之前已有缓存的 option，立即重放
    if (pendingOptionRef.current) {
      const { option, notMerge } = pendingOptionRef.current;
      pendingOptionRef.current = null;
      inst.setOption(option, notMerge);
    }

    return () => {
      ro.disconnect();
      inst.dispose();
      instanceRef.current = null;
      setReady(false);
    };
  }, [visible]);

  // 返回会随 ready 变化而变化的 setOption 引用：
  //  - ready=false：缓存 option，等待实例初始化后重放
  //  - ready=true：直接调用实例的 setOption
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setOption = useCallback(
    (option: any, notMerge?: boolean) => {
      const inst = instanceRef.current;
      if (inst) {
        inst.setOption(option, notMerge);
      } else {
        // 图表还未初始化，先缓存最新调用
        pendingOptionRef.current = { option, notMerge };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready], // 依赖 ready，确保实例就绪后 setOption 引用更新，触发调用方 useEffect 重跑
  );

  return { ref: containerRef, setOption, visible };
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";

type Phase = "static" | "enter" | "exit";

interface Layer {
  id: string;
  node: ReactNode;
  phase: Phase;
}

/**
 * 页面堆叠（设置 ↔ 关于 的左右滑动动画）：
 * - 正向进入（settings → about）：设置页保持在下方常驻，关于页在
 *   translateX(-100%) → 0 滑入覆盖（从左向右滑入）。
 * - 返回（about → settings）：关于页 0 → 100% 向右滑出消失，设置页露出。
 * - 设置页与关于页在整个切换过程中都保持挂载（状态不丢、配置不改）；
 *   其它页面切换走直切（无动画）。
 * - 节点按 id 缓存，复用同一 React 元素避免重挂载。
 * - 容器 relative overflow-hidden：滑动裁剪在内容区内；自定义背景在更底层，
 *   全程固定不动。
 */
export function PageStack({
  page,
  renderPage,
}: {
  page: string;
  renderPage: (id: string) => ReactNode;
}) {
  // 缓存非设置页节点（设置页每次返回时重新渲染，保证独立页面的全新状态）
  const nodeCache = useRef<Map<string, ReactNode>>(new Map());
  const getNode = (id: string) => {
    if (id === "settings") return renderPage(id);
    if (!nodeCache.current.has(id)) nodeCache.current.set(id, renderPage(id));
    return nodeCache.current.get(id)!;
  };

  const [layers, setLayers] = useState<Layer[]>([{ id: page, node: getNode(page), phase: "static" }]);
  const prevRef = useRef<string>(page);

  useEffect(() => {
    if (page === prevRef.current) return;
    const from = prevRef.current;
    const to = page;
    prevRef.current = page;

    const isAboutPair =
      (from === "settings" && to === "about") ||
      (from === "about" && to === "settings");

    if (!isAboutPair) {
      // 其它页面：直切
      setLayers([{ id: to, node: getNode(to), phase: "static" }]);
      return;
    }

    if (from === "settings" && to === "about") {
      // 正向：设置页保留为底层常驻（进入动画期间可见），关于页 enter 滑入
      setLayers([
        { id: "settings", node: getNode("settings"), phase: "static" },
        { id: "about", node: getNode("about"), phase: "enter" },
      ]);
    } else {
      // 返回：重新挂载设置页为底层，关于页 exit 滑出
      setLayers([
        { id: "settings", node: getNode("settings"), phase: "static" },
        { id: "about", node: getNode("about"), phase: "exit" },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // enter 完成：about 归位 static，并移除底层设置页 —— about 成为唯一独立顶级页面
  // （不再叠在设置页上层；设置页仅作为入场动画的过渡背景短暂可见）
  const onEntered = (id: string) =>
    setLayers((ls) => ls.filter((l) => l.id === id).map((l) => ({ ...l, phase: "static" })));

  // exit 完成：移除滑出的 about 层，仅剩设置页
  const onExited = (id: string) =>
    setLayers((ls) => ls.filter((l) => l.id !== id));

  return (
    <div className="relative h-full w-full overflow-hidden">
      {layers.map((layer) => (
        <SlideLayer
          key={layer.id}
          phase={layer.phase}
          onEntered={layer.phase === "enter" ? () => onEntered(layer.id) : undefined}
          onExited={layer.phase === "exit" ? () => onExited(layer.id) : undefined}
        >
          {layer.node}
        </SlideLayer>
      ))}
    </div>
  );
}

function SlideLayer({
  phase,
  onEntered,
  onExited,
  children,
}: {
  phase: Phase;
  onEntered?: () => void;
  onExited?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  // GSAP 驱动滑动：enter 从 -100% → 0，exit 0 → 100%，static 无动画
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    doneRef.current = false;
    if (phase === "static") {
      gsap.set(el, { x: 0 });
      return;
    }
    const fromX = phase === "enter" ? "-100%" : "0%";
    const toX = phase === "enter" ? "0%" : "100%";
    gsap.fromTo(
      el,
      { x: fromX },
      {
        x: toX,
        duration: 0.32,
        ease: phase === "enter" ? "power2.out" : "power2.in",
        overwrite: "auto",
        onComplete: () => {
          if (doneRef.current) return;
          doneRef.current = true;
          if (phase === "enter" && onEntered) onEntered();
          else if (phase === "exit" && onExited) onExited();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div ref={ref} data-page-layer={phase} className="absolute inset-0 will-change-transform">
      {children}
    </div>
  );
}

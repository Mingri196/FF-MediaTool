import type { ThemeMode } from "@/types";

/** 强调色预设色板（用户可自选任意色，这些是常用推荐色） */
export const ACCENT_PRESETS: { name: string; color: string; dark?: boolean }[] = [
  { name: "Indigo", color: "#4f46e5" },
  { name: "Blue", color: "#2563eb" },
  { name: "Cyan", color: "#0891b2" },
  { name: "Green", color: "#16a34a" },
  { name: "Amber", color: "#d97706" },
  { name: "Orange", color: "#ea580c" },
  { name: "Pink", color: "#db2777" },
  { name: "Purple", color: "#7c3aed" },
  { name: "Red", color: "#dc2626" },
  { name: "Slate", color: "#475569" },
];

/** 计算 hex 颜色的相对亮度（WCAG），用于决定前景色是白/黑 */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 把强调色写到 CSS 变量上（按钮、选中态、焦点环等跟随变色），保持主题可读性 */
export function applyAccent(accent: string): void {
  const root = document.documentElement;
  const l = luminance(accent);
  const fg = l > 0.55 ? "#18181b" : "#ffffff"; // 亮色强调用深字，暗色强调用白字
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--sidebar-primary", accent);
  root.style.setProperty("--sidebar-primary-foreground", fg);
}

/** 根据模式切换 `.dark` class；跟随系统时监听系统偏好变化 */
export function applyThemeMode(mode: ThemeMode): () => void {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    const dark = mode === "dark" || (mode === "system" && media.matches);
    root.classList.toggle("dark", dark);
  };
  sync();
  if (mode === "system") {
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }
  return () => {};
}
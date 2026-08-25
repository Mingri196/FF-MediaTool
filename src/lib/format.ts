/** 毫秒 → "HH:MM:SS" / "MM:SS"（用于已处理时长、ETA 展示） */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/** 文件大小字节 → 可读字符串 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 取路径中的文件名 */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** 替换扩展名 */
export function replaceExt(path: string, newExt: string): string {
  const dot = path.lastIndexOf(".");
  const slash = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}.${newExt}`;
}

/** 从文件路径推导输出路径：同目录 原名_out.新扩展 */
export function deriveOutputPath(input: string, newExt: string): string {
  return replaceExt(input, `_out.${newExt}`);
}

/** 清洗 Windows 长路径前缀 \\?\ */
export function normalizePath(p: string): string {
  return p.replace(/^\\\\?\\/, "");
}
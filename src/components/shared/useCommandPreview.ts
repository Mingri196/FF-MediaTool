import { useCallback, useEffect, useRef, useState } from "react";

/** 解析用户编辑的命令字符串 → 参数数组（支持引号与转义） */
export function tokenizeArgs(cmd: string): string[] {
  const args: string[] = [];
  let cur = "";
  let inS = false;
  let inD = false;
  let esc = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (esc) {
      cur += ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      const next = cmd[i + 1] ?? "";
      // 反斜杠仅在转义引号/反斜杠/空白时生效，其余保留原样
      // （Windows 路径 D:\a\b.mp4 中的单反斜杠不被吞掉）
      if (next === '"' || next === "'" || next === "\\" || next === " " || next === "\t") {
        esc = true;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" && !inD) {
      inS = !inS;
      continue;
    }
    if (ch === '"' && !inS) {
      inD = !inD;
      continue;
    }
    if ((ch === " " || ch === "\t") && !inS && !inD) {
      if (cur) {
        args.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) args.push(cur);
  return args;
}

/** 用户编辑的命令可能以 `ffmpeg` / `-y` 开头，剥掉可执行名与 ffmpeg 常用前缀 */
export function normalizeUserArgs(cmd: string): string[] {
  let args = tokenizeArgs(cmd.trim());
  if (args[0] === "ffmpeg" || args[0] === "ffmpeg.exe") args = args.slice(1);
  return args;
}

export interface UseCommandPreviewResult {
  /** textarea 当前文本（自动生成或用户编辑） */
  text: string;
  /** 用户是否手动编辑过 */
  dirty: boolean;
  /** 覆盖确认弹窗是否打开 */
  overwriteOpen: boolean;
  /** 待确认覆盖的新命令（弹窗正文用） */
  pendingText: string;
  /** 更新文本（用户编辑时调用） */
  setText: (v: string) => void;
  /** 确认覆盖 */
  confirmOverwrite: () => void;
  /** 取消覆盖（保留用户内容） */
  cancelOverwrite: () => void;
  /** 解析当前文本为参数数组（执行时用；优先用户编辑） */
  getArgs: () => string[];
}

/**
 * 命令预览状态管理（四模块共用）：
 * - autoArgs 由页面按当前 UI 参数自动生成；当它变化且用户已手动编辑过 → 弹覆盖确认
 * - 用户确认 → 用新命令覆盖；取消 → 保留用户内容
 * - 执行时 getArgs() 优先返回用户编辑的命令
 */
export function useCommandPreview(autoArgs: string[] | null): UseCommandPreviewResult {
  const [text, setTextState] = useState(() => (autoArgs ? autoArgs.join(" ") : ""));
  const [dirty, setDirty] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [pendingText, setPendingText] = useState("");

  // 记录上一次 autoArgs 是否已同步到 text（用于首次与自动更新）
  const lastAutoRef = useRef<string>(autoArgs ? autoArgs.join(" ") : "");
  const dirtyRef = useRef(false);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // autoArgs 变化 → 若用户已编辑则弹确认，否则直接刷新文本
  useEffect(() => {
    if (!autoArgs) return;
    const auto = autoArgs.join(" ");
    if (auto === lastAutoRef.current) return;
    lastAutoRef.current = auto;
    if (dirtyRef.current) {
      setPendingText(auto);
      setOverwriteOpen(true);
    } else {
      setTextState(auto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoArgs]);

  const setText = useCallback((v: string) => {
    dirtyRef.current = true;
    setDirty(true);
    setTextState(v);
  }, []);

  const confirmOverwrite = useCallback(() => {
    setTextState(pendingText);
    lastAutoRef.current = pendingText;
    dirtyRef.current = false;
    setDirty(false);
    setOverwriteOpen(false);
  }, [pendingText]);

  const cancelOverwrite = useCallback(() => {
    setOverwriteOpen(false);
  }, []);

  const getArgs = useCallback((): string[] => {
    // 用户编辑过 → 解析用户命令；否则返回 autoArgs
    if (dirtyRef.current) {
      const parsed = normalizeUserArgs(textRef.current);
      if (parsed.length > 0) return parsed;
    }
    return autoArgs ?? [];
  }, [autoArgs]);

  return {
    text,
    dirty,
    overwriteOpen,
    pendingText,
    setText,
    confirmOverwrite,
    cancelOverwrite,
    getArgs,
  };
}
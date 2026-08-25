/**
 * FFmpeg 常见错误 → 人类可读修复建议（PRD 6.3 错误高亮 + 修复建议）。
 * 纯函数，无外部依赖。
 */

export interface FfmpegErrorSuggestion {
  pattern: RegExp;
  severity: "error" | "warning";
  message: string;
  suggestion: string;
}

const ERROR_PATTERNS: FfmpegErrorSuggestion[] = [
  { pattern: /No such file or directory/i, severity: "error", message: "输入文件路径错误", suggestion: "请检查输入文件是否存在、路径是否正确" },
  { pattern: /Invalid encoder type/i, severity: "error", message: "编码器类型无效", suggestion: "所选编码器不支持当前参数，请检查编码器名称" },
  { pattern: /Unknown encoder/i, severity: "error", message: "未知编码器", suggestion: "当前 FFmpeg 未编译该编码器，请检查编码器名称或更换为软编码" },
  { pattern: /Encoder not found/i, severity: "error", message: "编码器未找到", suggestion: "FFmpeg 未包含该编码器，请确认编码器名称正确" },
  { pattern: /codec not currently supported|not supported in this build/i, severity: "error", message: "编码器/容器不兼容", suggestion: "该编码器与输出容器格式不兼容，请更换编码器或输出格式" },
  { pattern: /Error while opening encoder/i, severity: "error", message: "编码器打开失败", suggestion: "编码器初始化失败，可能是参数不兼容或硬件编码器不可用" },
  { pattern: /Permission denied/i, severity: "error", message: "写入权限被拒绝", suggestion: "请检查输出目录是否有写入权限，或更换输出路径" },
  { pattern: /Invalid data found when processing input/i, severity: "error", message: "输入文件损坏或格式不匹配", suggestion: "文件可能已损坏或不是有效媒体文件，请尝试其他文件" },
  { pattern: /At least one output file must be specified/i, severity: "error", message: "未指定输出文件", suggestion: "请设置输出文件路径" },
  { pattern: /Unrecognized option/i, severity: "error", message: "参数不识别", suggestion: "存在无效的 FFmpeg 参数，请检查参数名称" },
  { pattern: /Option not found/i, severity: "error", message: "参数未找到", suggestion: "FFmpeg 版本不支持该参数，请升级 FFmpeg 或移除该参数" },
  { pattern: /Conversion failed/i, severity: "error", message: "转换失败", suggestion: "请检查底部日志的详细错误信息" },
  { pattern: /does not contain any stream/i, severity: "error", message: "文件中没有媒体流", suggestion: "输入文件可能不含有效音视频流" },
  { pattern: /resolution not supported/i, severity: "error", message: "分辨率不支持", suggestion: "请调整缩放分辨率或移除该参数" },
  { pattern: /ffmpeg executable not found/i, severity: "error", message: "FFmpeg 未找到", suggestion: "请在设置页配置 FFmpeg 路径或添加至系统 PATH" },
  { pattern: /Subtitle encoding failed/i, severity: "error", message: "字幕编码失败", suggestion: "字幕文件格式可能不支持，请检查字幕文件" },
  { pattern: /Could not open file/i, severity: "error", message: "无法打开文件", suggestion: "请检查文件路径是否包含中文或特殊字符，文件是否存在" },
  { pattern: /Invalid argument/i, severity: "warning", message: "参数值无效", suggestion: "请检查参数取值是否在有效范围内" },
  { pattern: /deprecated/i, severity: "warning", message: "参数已弃用", suggestion: "该参数在新版 FFmpeg 中已弃用，建议移除" },
  { pattern: /Hardware device.*failed/i, severity: "error", message: "硬件加速设备初始化失败", suggestion: "当前系统不支持所选硬件编码器，请切换为软编码" },
  { pattern: /Cannot open resource/i, severity: "error", message: "无法打开资源", suggestion: "文件被其他程序占用或路径包含非法字符" },
];

/** 分析 stderr 日志，返回匹配的错误建议 */
export function analyzeFfmpegError(stderr: string): FfmpegErrorSuggestion[] {
  const results: FfmpegErrorSuggestion[] = [];
  for (const pat of ERROR_PATTERNS) {
    if (pat.pattern.test(stderr)) {
      results.push(pat);
    }
  }
  return results;
}

/** 快速判断日志行是否包含错误关键词（用于日志行着色） */
export function isErrorLine(line: string): "error" | "warning" | null {
  const lower = line.toLowerCase();
  if (lower.startsWith("error") || lower.includes("error:") || lower.includes(" cannot ") || lower.includes("failed")) {
    return "error";
  }
  if (lower.startsWith("warning") || lower.includes("warning:") || lower.includes(" deprecated")) {
    return "warning";
  }
  return null;
}
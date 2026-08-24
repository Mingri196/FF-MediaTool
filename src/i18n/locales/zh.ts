/**
 * 中文语言包（基准词条）。
 * 约定：
 * - 扁平键值，键名点分命名；
 * - 专业术语保留通用英文名（Encoder、CRF、FFprobe 等），必要时附中文释义；
 * - en.ts 以 `Record<keyof typeof zh, string>` 强制与本站完全对齐。
 */
export const zh = {
  /* ---------- 应用名 / 导航 ---------- */
  "app.name": "FF-MediaTool",
  "app.tagline": "基于 FFmpeg 的本地音视频处理工具",
  "app.subtitle": "视频 · 音频 · 剪辑",
  "app.collapseNav": "收起导航",

  "nav.videoConvert": "视频转换",
  "nav.audioConvert": "音频转换",
  "nav.videoClip": "视频剪辑",
  "nav.mediaInfo": "媒体信息",
  "nav.batch": "批量任务",
  "nav.settings": "设置",

  "page.comingSoon.title": "功能建设中",
  "page.comingSoon.desc": "该功能模块将在后续迭代中逐步上线，敬请期待。",

  /* ---------- 设置页 ---------- */
  "settings.title": "设置",
  "settings.desc": "语言、外观与 FFmpeg 环境配置",

  "settings.language.title": "语言 Language",
  "settings.language.desc": "切换后全局界面实时生效，无需重启应用",
  "settings.language.zh": "简体中文",
  "settings.language.en": "English",

  "settings.appearance.title": "外观",
  "settings.appearance.desc": "主题模式与自定义强调色，即时生效",
  "settings.appearance.themeLabel": "主题模式",
  "settings.appearance.theme.light": "浅色",
  "settings.appearance.theme.dark": "深色",
  "settings.appearance.theme.system": "跟随系统",
  "settings.appearance.accentLabel": "强调色 Accent",

  "settings.habits.title": "使用习惯记忆",
  "settings.habits.desc": "窗口大小与位置、上次使用的输出目录、最近使用的编码预设，下次启动自动恢复",
  "settings.habits.window": "窗口大小与位置",
  "settings.habits.windowVal": "自动记忆（关闭窗口时保存）",
  "settings.habits.lastInputDir": "上次输入目录",
  "settings.habits.lastOutputDir": "上次输出目录",
  "settings.habits.recentPresets": "最近使用的预设",
  "settings.habits.empty": "暂无记录，完成一次任务后自动保存",

  "settings.ffmpeg.title": "FFmpeg 环境",
  "settings.ffmpeg.desc": "优先调用系统 PATH 中的 ffmpeg / ffprobe；也可手动指定绿色版路径，配置后自动校验",
  "settings.ffmpeg.ffmpeg": "ffmpeg",
  "settings.ffmpeg.ffprobe": "ffprobe",
  "settings.ffmpeg.manual": "手动指定",
  "settings.ffmpeg.systemPath": "系统 PATH",
  "settings.ffmpeg.notInstalled": "未检测到",
  "settings.ffmpeg.invalidPath": "路径无效",
  "settings.ffmpeg.browseFfmpeg": "选择 ffmpeg.exe",
  "settings.ffmpeg.browseFfprobe": "选择 ffprobe.exe",
  "settings.ffmpeg.validate": "验证配置",
  "settings.ffmpeg.validateSuccess": "FFmpeg 环境配置有效 ✓",
  "settings.ffmpeg.validateFail": "配置无效，请检查路径",
  "settings.ffmpeg.resetToPath": "重置为系统 PATH",
  "settings.ffmpeg.redetect": "重新检测",
  "settings.ffmpeg.download": "前往下载 FFmpeg",
  "settings.ffmpeg.checking": "检测中…",
  "settings.ffmpeg.sourceManual": "手动路径",
  "settings.ffmpeg.sourcePath": "系统 PATH",
  "settings.ffmpeg.noPath": "未设置（使用系统 PATH）",
  "settings.ffmpeg.useSystemHint": "当前使用系统 PATH 中的版本",

  /* ---------- 预设管理 ---------- */
  "settings.presets.title": "编码预设模板",
  "settings.presets.desc": "保存自定义编码参数，支持快速调用、重命名、删除",
  "settings.presets.empty": "暂无预设。在视频/音频转换页配置好参数后，点击「保存为预设」即可添加。",
  "settings.presets.categoryVideo": "视频",
  "settings.presets.categoryAudio": "音频",
  "settings.presets.new": "新建预设",
  "settings.presets.rename": "重命名",
  "settings.presets.delete": "删除",
  "settings.presets.deleteConfirm": "确定删除预设「{name}」吗？此操作不可撤销。",
  "settings.presets.nameLabel": "预设名称",
  "settings.presets.namePlaceholder": "例如：H.264 高画质",
  "settings.presets.categoryLabel": "预设类型",
  "settings.presets.createdAt": "创建于 {date}",
  "settings.presets.noParamsHint": "当前预设暂无参数内容（由转换页保存时写入）",
  "settings.presets.usedCount": "使用 {count} 次",

  /* ---------- 首次启动引导弹窗 ---------- */
  "firstrun.title": "未检测到 FFmpeg",
  "firstrun.desc": "FF-MediaTool 基于 FFmpeg 运行，首次使用需要配置 FFmpeg 环境。\n请选择 ffmpeg.exe 所在路径，或前往官方推荐源下载适用于 Windows 的版本。",
  "firstrun.browse": "手动选择 ffmpeg.exe",
  "firstrun.download": "前往下载 FFmpeg",
  "firstrun.later": "稍后再说",
  "firstrun.laterHint": "稍后可在「设置 → FFmpeg 环境」中随时配置",

  /* ---------- 通用 ---------- */
  "common.save": "保存",
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.close": "关闭",
  "common.create": "创建",
  "common.delete": "删除",
  "common.rename": "重命名",
  "common.browse": "浏览…",
  "common.loading": "加载中…",
  "common.unknown": "未知",

  /* ---------- 底部任务栏 ---------- */
  "taskbar.idle": "空闲 — 添加任务开始处理",
  "taskbar.stopping": "正在停止…",
  "taskbar.stop": "停止",
  "taskbar.noTask": "暂无任务",
  "taskbar.eta": "剩余 {time}",
  "taskbar.elapsed": "已处理 {time}",
  "taskbar.speed": "{speed}x",
  "taskbar.percent": "{percent}%",
  "taskbar.queueCount": "队列 {count} 个任务",
  "taskbar.log.title": "运行日志",
  "taskbar.log.pause": "暂停",
  "taskbar.log.resume": "跟随",
  "taskbar.log.clear": "清空",
  "taskbar.log.export": "导出",
  "taskbar.log.empty": "暂无日志",
  "taskbar.log.expand": "展开",
  "taskbar.log.collapse": "收起",
  "taskbar.log.totalLines": "共 {count} 行",

  /* ---------- 任务状态 ---------- */
  "status.queued": "等待中",
  "status.running": "运行中",
  "status.completed": "已完成",
  "status.failed": "失败",
  "status.cancelled": "已取消",

  /* ---------- 批量任务页 ---------- */
  "batch.title": "批量任务",
  "batch.desc": "多任务排队串行执行，同一时间仅运行一个 FFmpeg 进程，避免 CPU / 磁盘满载",
  "batch.add": "添加任务",
  "batch.queue": "排队队列",
  "batch.current": "当前任务",
  "batch.history": "历史记录",
  "batch.emptyQueue": "队列为空 — 点击「添加任务」开始",
  "batch.emptyHistory": "暂无历史记录",
  "batch.moveUp": "上移",
  "batch.moveDown": "下移",
  "batch.remove": "移除",
  "batch.clearFinished": "清空已结束",
  "batch.retry": "重试",

  /* ---------- 快速任务对话框（模块二验证入口，模块三/四升级为完整面板） ---------- */
  "quick.title": "添加快速任务",
  "quick.desc": "简易转码入口，用于验证任务引擎；完整参数面板将在后续模块上线",
  "quick.input": "输入文件",
  "quick.inputPlaceholder": "选择要处理的媒体文件",
  "quick.browseInput": "选择文件…",
  "quick.profile": "处理方式",
  "quick.profile.mp4": "转 MP4（H.264 + AAC）",
  "quick.profile.mkv": "转 MKV（H.264 + AAC）",
  "quick.profile.webm": "转 WebM（VP9 + Opus）",
  "quick.profile.mp3": "提取音频 → MP3",
  "quick.profile.flac": "提取音频 → FLAC",
  "quick.profile.copy": "流复制（无损改封装）",
  "quick.output": "输出文件",
  "quick.browseOutput": "选择保存位置…",
  "quick.add": "添加到队列",
  "quick.errorNoInput": "请先选择输入文件",
  "quick.errorNoOutput": "请设置输出文件路径",
  "quick.autoOutput": "默认输出到输入文件同目录（文件名 原名_out.后缀），可在下方修改",

  /* ---------- 通用 ---------- */
  "common.add": "添加",
  "common.clearAll": "清空",
  "common.copy": "复制",
  "common.export": "导出",
  "common.processing": "处理中…",
  "common.done": "完成",
  "common.failed": "失败",

  /* ---------- 错误提示 ---------- */
  "error.settingsLoadFailed": "读取设置失败",
  "error.settingsSaveFailed": "设置保存失败",
  "error.ffmpegDetectFailed": "FFmpeg 检测失败",
  "error.filePickFailed": "选择文件失败",
  "error.taskAddFailed": "添加任务失败",
  "error.taskStopFailed": "停止任务失败",
  "error.taskRemoveFailed": "删除任务失败",
  "error.exportLogFailed": "导出日志失败",
} as const;

export type I18nKey = keyof typeof zh;
import type { I18nKey } from "./zh";

/**
 * 英文语言包。类型约束 `Record<I18nKey, string>` 保证与 zh.ts 键集合完全一致，
 * 任何漏译/多键都会在编译期直接报错（自检手段之一）。
 */
export const en: Record<I18nKey, string> = {
  /* ---------- App name / nav ---------- */
  "app.name": "FF-MediaTool",
  "app.tagline": "Local audio & video processing tool powered by FFmpeg",
  "app.subtitle": "Video · Audio · Edit",
  "app.collapseNav": "Collapse",

  "nav.videoConvert": "Video Convert",
  "nav.audioConvert": "Audio Convert",
  "nav.videoClip": "Video Edit",
  "nav.mediaInfo": "Media Info",
  "nav.batch": "Batch Tasks",
  "nav.settings": "Settings",

  "page.comingSoon.title": "Under Construction",
  "page.comingSoon.desc": "This module will be available in upcoming iterations.",

  /* ---------- Settings page ---------- */
  "settings.title": "Settings",
  "settings.desc": "Language, appearance and FFmpeg environment",

  "settings.language.title": "Language 语言",
  "settings.language.desc": "Takes effect instantly across the whole app, no restart needed",
  "settings.language.zh": "简体中文",
  "settings.language.en": "English",

  "settings.appearance.title": "Appearance",
  "settings.appearance.desc": "Theme mode and custom accent color, applied instantly",
  "settings.appearance.themeLabel": "Theme mode",
  "settings.appearance.theme.light": "Light",
  "settings.appearance.theme.dark": "Dark",
  "settings.appearance.theme.system": "Follow system",
  "settings.appearance.accentLabel": "Accent color",

  "settings.habits.title": "Usage Memory",
  "settings.habits.desc": "Window size & position, last output directory and recent presets are restored on next launch",
  "settings.habits.window": "Window size & position",
  "settings.habits.windowVal": "Saved automatically on window close",
  "settings.habits.lastInputDir": "Last input directory",
  "settings.habits.lastOutputDir": "Last output directory",
  "settings.habits.recentPresets": "Recent presets",
  "settings.habits.empty": "Nothing recorded yet — it will be saved after you run a task",

  "settings.ffmpeg.title": "FFmpeg Environment",
  "settings.ffmpeg.desc": "Prefers ffmpeg / ffprobe from your system PATH; you can also point to a portable build, which is validated automatically",
  "settings.ffmpeg.ffmpeg": "ffmpeg",
  "settings.ffmpeg.ffprobe": "ffprobe",
  "settings.ffmpeg.manual": "Manual",
  "settings.ffmpeg.systemPath": "System PATH",
  "settings.ffmpeg.notInstalled": "Not detected",
  "settings.ffmpeg.invalidPath": "Invalid path",
  "settings.ffmpeg.browseFfmpeg": "Choose ffmpeg.exe",
  "settings.ffmpeg.browseFfprobe": "Choose ffprobe.exe",
  "settings.ffmpeg.validate": "Validate",
  "settings.ffmpeg.validateSuccess": "FFmpeg environment is valid ✓",
  "settings.ffmpeg.validateFail": "Invalid configuration, please check the paths",
  "settings.ffmpeg.resetToPath": "Reset to system PATH",
  "settings.ffmpeg.redetect": "Re-detect",
  "settings.ffmpeg.download": "Download FFmpeg",
  "settings.ffmpeg.checking": "Checking…",
  "settings.ffmpeg.sourceManual": "Manual path",
  "settings.ffmpeg.sourcePath": "System PATH",
  "settings.ffmpeg.noPath": "Not set (use system PATH)",
  "settings.ffmpeg.useSystemHint": "Currently using the version from system PATH",

  /* ---------- Presets ---------- */
  "settings.presets.title": "Encode Presets",
  "settings.presets.desc": "Save your custom encode parameters for quick use, rename and delete",
  "settings.presets.empty": "No presets yet. Configure parameters on the convert pages and click “Save as preset” to add one.",
  "settings.presets.categoryVideo": "Video",
  "settings.presets.categoryAudio": "Audio",
  "settings.presets.new": "New preset",
  "settings.presets.rename": "Rename",
  "settings.presets.delete": "Delete",
  "settings.presets.deleteConfirm": "Delete preset “{name}”? This cannot be undone.",
  "settings.presets.nameLabel": "Preset name",
  "settings.presets.namePlaceholder": "e.g. H.264 High Quality",
  "settings.presets.categoryLabel": "Preset type",
  "settings.presets.createdAt": "Created {date}",
  "settings.presets.noParamsHint": "This preset has no parameters yet (written when saved from a convert page)",
  "settings.presets.usedCount": "Used {count} times",

  /* ---------- First-run dialog ---------- */
  "firstrun.title": "FFmpeg not detected",
  "firstrun.desc": "FF-MediaTool runs on FFmpeg, so an FFmpeg environment is required.\nPlease locate ffmpeg.exe, or download a Windows build from an official recommended source.",
  "firstrun.browse": "Choose ffmpeg.exe",
  "firstrun.download": "Download FFmpeg",
  "firstrun.later": "Not now",
  "firstrun.laterHint": "You can configure it anytime under Settings → FFmpeg Environment",

  /* ---------- Common ---------- */
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.close": "Close",
  "common.create": "Create",
  "common.delete": "Delete",
  "common.rename": "Rename",
  "common.browse": "Browse…",
  "common.loading": "Loading…",
  "common.unknown": "Unknown",

  /* ---------- Errors ---------- */
  "error.settingsLoadFailed": "Failed to load settings",
  "error.settingsSaveFailed": "Failed to save settings",
  "error.ffmpegDetectFailed": "Failed to detect FFmpeg",
  "error.filePickFailed": "Failed to pick file",
};
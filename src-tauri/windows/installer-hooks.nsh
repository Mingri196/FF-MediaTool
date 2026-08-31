; FF-MediaTool installer hooks
; 强制安装程序总是显示语言选择对话框（中文/英文可手动切换）。
; Tauri 默认模板使用 LangDLL 的 auto-close 行为：当检测到的系统语言与
; 安装包内语言匹配时自动选择并跳过对话框；定义 MUI_LANGDLL_ALWAYSSHOW
; 后无论系统语言如何都弹出语言选择器，满足"自动检测 + 可切换"需求。
!define MUI_LANGDLL_ALWAYSSHOW
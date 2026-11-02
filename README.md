# FF-MediaTool

> 基于 FFmpeg 的桌面音视频及图片转换工具 | A desktop audio, video & image converter powered by FFmpeg

<div align="center">

![FF-MediaTool](src-tauri/FF-MediaTool.ico)

[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-purple)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.98-orange)](https://www.rust-lang.org)

[English](#english) | [中文](#中文)

</div>

---

## 中文

### 简介

FF-MediaTool 是一款基于 FFmpeg 的桌面应用，支持音视频及图片的格式转换、参数调整、批量处理。基于 Tauri 2 + React 构建，界面简洁直观。

### 应用预览

<p align="center">
  <img src="docs/screenshots/01-main.png" width="80%" alt="主界面预览" />
</p>

### 功能

- **视频转换** — MP4、MKV、AVI、MOV、WebM 等格式互转，支持编码器选择（H.264/H.265/AV1、H.264 Media Foundation 硬编）、画质参数、滤镜处理（裁剪/缩放/旋转/去噪等）
- **音频转换** — MP3、AAC、FLAC、WAV、OGG 等格式互转，支持码率、采样率、声道调整
- **图片转换** — JPG、PNG、WebP、AVIF 等格式批量转换，支持尺寸调整、旋转/裁剪/色彩编辑、GIF 拆分/合成
- **视频剪辑** — 时间裁剪、多片段拼接
- **媒体信息** — 查看音视频文件详细元数据，支持多流切换
- **批量任务** — 队列管理、进度查看、实时日志
- **多标签** — 内部功能页多标签管理，各标签独立保存页面状态与后台任务，Q/E 快捷键切换、右键复制、悬停预览
- **硬件监控** — 标题栏实时显示 GPU / CPU / 内存占用
- **主题** — 浅色/深色/跟随系统

### 从源码构建

```bash
# 前置要求
# - Rust 1.70+
# - Node.js 18+
# - FFmpeg 9.0+（在 PATH 中或在设置页配置）

# 克隆仓库
git clone https://github.com/Mingri196/FF-MediaTool.git
cd FF-MediaTool

# 安装前端依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布版
npm run tauri build
```

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + shadcn/ui (Base UI) + Tailwind v4 |
| 后端 | Rust + Tauri 2 |
| 媒体引擎 | FFmpeg 9.0 |
| 打包 | NSIS (setup.exe) |

### 协议

本项目基于 **MIT License** 发布。详见 [LICENSE](LICENSE) 文件。

本项目包含以下开源组件：
- **FFmpeg** — GPL/LGPL 授权
- **Tauri** — Apache 2.0 / MIT 授权
- 其他库详见各依赖的许可证

---

## English

### Introduction

FF-MediaTool is a desktop application for audio, video, and image conversion powered by FFmpeg. Built with Tauri 2 + React, it features a clean and intuitive interface.

### Preview

<p align="center">
  <img src="docs/screenshots/01-main.png" width="80%" alt="Main UI preview" />
</p>

### Features

- **Video Convert** — Format conversion between MP4, MKV, AVI, MOV, WebM, etc. Encoder selection (H.264/H.265/AV1, H.264 Media Foundation hardware encode), quality settings, filter processing (crop/scale/rotate/denoise)
- **Audio Convert** — Format conversion between MP3, AAC, FLAC, WAV, OGG, etc. Bitrate, sample rate, channel adjustment
- **Image Convert** — Batch conversion between JPG, PNG, WebP, AVIF, etc. Resize, rotate, crop, color editing, GIF split/combine
- **Video Clip** — Time-based trimming, multi-segment concatenation
- **Media Info** — View detailed media metadata, multi-track switching
- **Batch Tasks** — Queue management, progress tracking, real-time logs
- **Multi-Tab** — Multi-tab management for internal pages; each tab keeps its own page state and background tasks, Q/E hotkey switching, right-click duplicate, hover preview
- **Hardware Monitor** — Real-time GPU / CPU / memory usage in the title bar
- **Theme** — Light / Dark / System

### Build from Source

```bash
# Prerequisites
# - Rust 1.70+
# - Node.js 18+
# - FFmpeg 9.0+ (in PATH or configured in Settings)

git clone https://github.com/Mingri196/FF-MediaTool.git
cd FF-MediaTool
npm install
npm run tauri dev    # development
npm run tauri build  # production build
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + shadcn/ui (Base UI) + Tailwind v4 |
| Backend | Rust + Tauri 2 |
| Media Engine | FFmpeg 9.0 |
| Packaging | NSIS (setup.exe) |

### License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

It incorporates the following open-source components:
- **FFmpeg** — GPL/LGPL
- **Tauri** — Apache 2.0 / MIT
- Other libraries as listed in their respective licenses

---

## Contact

[GitHub Issues](https://github.com/Mingri196/FF-MediaTool/issues)
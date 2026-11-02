# FF-MediaTool User Guide

> **Version: Beta** — Features may change, and stability is not guaranteed.

## Introduction

FF-MediaTool is a desktop application for audio, video, and image conversion based on FFmpeg. It supports batch processing, format conversion, and parameter adjustment. Built with Tauri 2 + React, it features a clean and intuitive interface.

## System Requirements

- Windows 10/11 64-bit
- FFmpeg (recommended 6.0+, configurable in Settings)
- Memory: 4GB+ recommended
- Disk space: varies by file size

## Quick Start

1. Launch the application and select a module from the left sidebar
2. Drop or click to select input files
3. Set output format and parameters
4. Click "Start" to begin conversion

## Modules

### Video Convert

Supports common video format conversion: MP4, MKV, AVI, MOV, WebM, etc.

**Steps:**
1. Drop a video file or click "Browse"
2. Select output format (MP4, MKV, AVI, etc.)
3. Adjust video parameters: encoder (H.264/H.265/AV1), quality (CRF), resolution, framerate
4. Adjust audio parameters: encoder, bitrate, sample rate, channels
5. Set output directory (defaults to Settings configuration)
6. Click "Start Convert"

**Batch:** Multiple files supported, executed sequentially.

### Audio Convert

Supports common audio format conversion: MP3, AAC, FLAC, WAV, OGG, M4A, etc.

**Steps:**
1. Drop audio file or click "Browse"
2. Select output format
3. Adjust parameters: bitrate, sample rate, channels, volume
4. Set output directory
5. Click "Start Convert"

**Concat mode:** Merge multiple audio segments into one file.
**Split mode:** Split audio into multiple segments by time.

### Image Convert

Supports batch image format conversion: JPG, PNG, WebP, BMP, GIF, TIFF, ICO, AVIF, etc.

**Steps:**
1. Click "Add Files" or "Add Folder" to import images
2. Check files to convert (all selected by default)
3. Select output format
4. Adjust size: original, percentage, fit width/height, fixed size, custom resolution
5. Adjust quality parameters (varies by format)
6. Edit: rotate, flip, crop, color adjustment, canvas expand
7. Set output directory and naming rules
8. Click "Batch Convert"

**File list:** Check/select all, remove selected, clear all.
**Custom resolution:** Manual width/height input with adapt mode (None/Stretch/Fit/Cover).

### Video Clip

Supports time-based trimming and multi-segment concatenation.

**Trim mode:** Set start and end time to extract a clip.
**Concat mode:** Add multiple clips to merge into one file.

**Video processing:** Rotate (0°/90°/180°/270°), horizontal/vertical flip, crop.

### Media Info

View detailed metadata of audio/video files: codec, resolution, bitrate, framerate, duration, audio tracks, etc.

Supports multi-track switching and information export.

### Batch Tasks

View and manage all running and completed tasks.

**Features:**
- View task progress and status
- Pause/resume tasks
- Stop tasks
- Delete completed tasks
- View task logs

### Settings

**Language:** Supports Simplified Chinese and English, real-time switching.
**Theme:** Light, Dark, and System follow modes.
**Default Output Path:** Configure default output directories per module. Falls back to App Root/opt folder.
**FFmpeg:** Auto-detect or manually specify FFmpeg/FFprobe paths.
**Presets:** Save and load commonly used encoding parameter templates.

## Output Path Priority

1. Manual edit in the module page (current task only)
2. Custom path in Settings for the corresponding module
3. Global default opt directory

## FAQ

**Q: FFmpeg not found?**
A: Click "Auto Detect" in Settings, or manually specify the FFmpeg and FFprobe executable paths.

**Q: Drag and drop not working?**
A: Make sure to drag files from File Explorer. Single and multiple files are supported.

**Q: Where are the converted files?**
A: Default output is in the opt folder under the application root directory. Custom paths can be configured in Settings.

**Q: What image formats are supported?**
A: Input: JPG, PNG, WebP, BMP, GIF, TIFF, ICO, AVIF, JPEG XL, TGA, PPM, PGM. Output: JPG, PNG, WebP, BMP, GIF, TIFF, ICO, AVIF.

## Support

For questions or suggestions, please open an issue on GitHub:
https://github.com/Mingri196/FF-MediaTool/issues
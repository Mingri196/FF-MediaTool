# 贡献指南（CONTRIBUTING）

感谢你愿意为 **FF-MediaTool** 贡献！无论是提交 Issue、改进代码、补充文档还是完善翻译，我们都欢迎。

- 遇到问题请先搜索 [Issues](https://github.com/Mingri196/FF-MediaTool/issues) 是否已有相同讨论
- 安全漏洞**请勿在 Issue 公开**，请私信仓库所有者或在 Issue 中说明后等待处理
- 想直接贡献代码？继续阅读本文档

---

## 仓库结构

| 目录                                            | 说明                                                   |
| --------------------------------------------- | ---------------------------------------------------- |
| `src/`                                        | 前端源码（React 19 + TypeScript），绝大多数页面与逻辑开发都在这里          |
| `src/pages/`                                  | 业务页面：视频转换 / 音频转换 / 图片转换 / 视频剪辑 / 媒体信息 / 批量任务 / 设置    |
| `src/components/`                             | 组件：顶层布局（AppShell、TabBar、CustomTitleBar）、业务组件、ui 基础组件 |
| `src/video/` / `src/audio/` / `src/image/`    | 各模块的业务逻辑：参数类型、预设、FFmpeg 命令构建（builder）                |
| `src/tabs/`                                   | 多标签管理核心（TabManager、每标签独立状态快照）                        |
| `src/tasks/`                                  | 全局任务上下文（队列、日志、按标签隔离的任务归属）                            |
| `src/i18n/`                                   | 双语字典（`zh.ts` / `en.ts`，**两个文件键必须对称**）                |
| `src/lib/`                                    | 通用工具（格式化、Tauri 封装、路由等）                               |
| `src/settings/` / `src/theme/` / `src/hooks/` | 设置持久化 / 主题 / 共享 Hooks                                |
| `src-tauri/`                                  | Rust 后端 + Tauri 配置                                   |
| `src-tauri/src/`                              | Rust 源码：FFmpeg 进程管理、硬件监控（PDH）、窗口圆角、设置持久化             |
| `scripts/`                                    | E2E / 调试脚本（CDP 驱动）                                   |
| `tests/`                                      | 顶层专项测试                                               |
| `docs/screenshots/`                           | README 用的应用预览截图                                      |

## 开发环境

- [Node.js 18+](https://nodejs.org/)
- [Rust 1.70+](https://www.rust-lang.org/)（项目当前使用 1.98）
- [FFmpeg 9.0+](https://ffmpeg.org/)（在 PATH 中，或在应用设置页配置路径）
- Windows 10/11（当前仅支持 Windows）

## 本地开发

```bash
# 安装前端依赖
npm install

# 开发模式（热重载 + Rust 后端）
npm run tauri dev
```

> 注意：目前仓库**未配置 CI**，请以本地完整检查为准（见下节）。

## 构建与测试

推送代码前请依次跑完以下检查（全部通过再提交）：

```bash
# 1. Rust 后端检查
cargo check          # 在 src-tauri/ 目录下

# 2. Rust 单元测试
cargo test --lib     # 在 src-tauri/ 目录下

# 3. TypeScript 类型检查（前端）
npx tsc --noEmit

# 4. 前端单元测试（vitest）
npm test

# 4b. 只跑某个测试文件（开发时快速验证）
npx vitest run src/video/builder.test.ts

# 5. 生产构建
npm run tauri build  # 生成 release exe + NSIS 安装包
```

> `cargo check` 存在**既有**的 lint 提示（如 Rust 2015 相关警告，属历史遗留、非本次改动引入）——以「无新增错误」为准即可，不要为此改动无关代码。

## 代码规范

请遵循既有代码风格：

- **前端**：TypeScript 严格模式；组件使用函数式 + Hooks；UI 沿用既有组件（Base UI 封装，勿自造）
- **双语**：新增任何用户可见文案，必须同时添加 `zh.ts` 与 `en.ts` 两个键（**对称，缺失会类型报错**）
- **多标签适配**：新增页面状态如需在「复制标签」时复刻，请接入 `useTabInitialState` / `useRegisterPageSnapshot` 快照机制；不要破坏每个标签独立保存状态的架构
- **任务隔离**：任务通过 `taskTabMap` 归属标签，新增触发任务的逻辑请保留标签归属传递
- **不回归业务逻辑**：多标签是状态抽离层，优先考虑对既有功能的影响面
- **测试**：新增逻辑尽量附带 vitest 测试
- **品牌资源勿随意更换**：`public/app-icon.gif`（标题栏动图）、应用图标等由所有者指定，除非明确要求不要更换

## 提交规范

提交信息建议使用 Conventional Commits 前缀，正文可用中文：

```
feat: 新增 xxx 功能
fix: 修复 xxx 问题
docs: 更新文档
refactor: 重构 xxx
test: 补充测试
chore: 构建/工具链/依赖改动
```

示例：

```
feat: 视频转换支持 AV1 编码器

- 编码器列表新增 libsvtav1
- 参数面板适配 AV1 默认预设
```

**禁止提交**：缓存文件（已在 .gitignore 中）

## 提交流程（Pull Request）

1. **Fork** 本仓库（`Mingri196/FF-MediaTool`）到你的账号
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 修改代码，本地跑完上面「构建与测试」的全部检查
4. 提交并推送到你的 Fork：`git push origin feat/your-feature`
5. 向主仓库发起 Pull Request
6. 在 PR 描述中说明：改动目的、影响范围、测试情况（跑了哪些检查 / 结果如何）

## Issue 规范

- 提交 Bug 前请先搜索是否已存在相同问题
- Bug 报告请尽量包含：
  - FF-MediaTool 版本
  - 操作系统版本 / CPU / GPU / 显卡驱动版本
  - 复现步骤
  - 期望行为与实际行为
  - 截图或日志（如有）
- 新功能建议请描述使用场景，而不是只写「希望能支持 xxx」

## 许可证

本项目采用 **MIT License** 发布（详见 [LICENSE](LICENSE)）。你的贡献将基于 MIT 授权，提交即表示你同意你的代码以该协议发布。
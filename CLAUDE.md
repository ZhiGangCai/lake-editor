# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个名为 "lake-editor" 的 VSCode 扩展，用于在本地编辑语雀（Yuque）lake 格式文件。它使用 VSCode 的 Custom Editor API 将语雀编辑器（@alipay_lakex-doc）嵌入为 webview。扩展还提供了树形视图用于浏览 .lakebook 文件。

基于原项目 [ilimei/vscode-plugin-lake-editor](https://github.com/ilimei/vscode-plugin-lake-editor) 重构改进。

## 开发命令

```bash
npm run watch      # 开发模式构建（监听文件变化）
npm run compile    # 一次性 webpack 构建
npm run package    # 生产构建（压缩，隐藏 source map）
npm run lint       # ESLint 检查 src/ 目录
npm run preset     # 从 node_modules 预置编辑器资源到 media/editor/
npm run vsce       # 打包 .vsix 扩展文件
npm run test       # 运行测试（需要先执行 pretest: compile + lint）
```

**注意**：安装依赖后必须运行 `npm run preset`，将 @alipay_lakex-doc 编辑器资源复制到 `media/editor/`。

## 架构

### 目录结构

```
src/
├── extension.ts          # 扩展入口
├── config/              # 配置管理
│   └── index.ts         # 统一配置读取，类型安全
├── common/              # 公共基础模块
│   ├── dispose.ts       # Disposable 基类，资源管理
│   ├── message-protocol.ts  # 消息协议类型定义
│   ├── message-client.ts   # webview 消息客户端（运行在前端）
│   ├── message-server.ts   # 扩展主机消息服务端
│   ├── github-core.ts      # GitHub 图片上传
│   └── constants.ts       # 常量定义
├── editor/              # Custom Editor 核心
│   ├── base-preview.ts  # 基础 webview 预览抽象类
│   ├── services/        # 业务服务
│   │   └── file-change-detector.ts  # 文件外部变更检测服务
│   └── lake-preview/    # Lake 编辑器后端实现
│       ├── lake-editor-provider.ts
│       ├── lake-document.ts
│       └── lake-preview.ts
├── webview/             # 前端代码（运行在 webview）
│   └── lake-preview/    # Lake 编辑器前端入口
└── tree-provider/       # .lakebook 树形浏览
    ├── index.ts
    ├── lake-model.ts
    └── lakebook-tree-provider.ts
```

### Custom Editor 模式

扩展实现 VSCode 的 `CustomEditorProvider` API，由三个核心组件组成：

1. **LakeEditorProvider** ([src/editor/lake-preview/lake-editor-provider.ts](src/editor/lake-preview/lake-editor-provider.ts)) - 管理编辑器生命周期，创建 `LakeDocument` 实例
2. **LakeDocument** ([src/editor/lake-preview/lake-document.ts](src/editor/lake-preview/lake-document.ts)) - 实现 `CustomDocument`，处理文件读写和备份
3. **LakePreview** ([src/editor/lake-preview/lake-preview.ts](src/editor/lake-preview/lake-preview.ts)) - 继承 `BasePreview`，管理 webview 和消息通信

### 文件外部变更检测

[FileChangeDetector](src/editor/services/file-change-detector.ts) 独立服务实现文件外部变更检测：

- 创建文件系统监听器监听当前文件（监听 `onDidChange` / `onDidCreate` / `onDidDelete` 三种事件）
- 兼容各种编辑器的保存策略（写入临时文件→删除→重命名）
- 收到变更事件后使用防抖处理，只处理最后一次变更
- 通过 `markSaved()` 机制过滤扩展自身保存触发的变更，避免死循环
- 弹出提示询问用户是否重新加载
- 用户确认后通过 delegate 回调通知重新加载

### 消息通信

扩展使用扩展主机与 webview 之间的双向消息协议：

- **扩展 → Webview**：更新内容、配置变更、主题更新
- **Webview → 扩展**：内容变更、图片上传请求、粘贴命令

[message-protocol.ts](src/common/message-protocol.ts) 定义统一的消息类型，[message-server.ts](src/common/message-server.ts) 在扩展主机处理消息，[message-client.ts](src/common/message-client.ts) 在 webview 处理消息。

### Tree Provider

[LakebookTreeProvider](src/tree-provider/lakebook-tree-provider.ts) 实现 `TreeDataProvider`，用于浏览 .lakebook 压缩包，支持右键菜单操作（Explore、Unzip、Open Source）。

性能优化：
- Tar 条目缓存，打开文档不用重新遍历整个 tar 包
- LRU 缓存淘汰，最多缓存 10 个 lakebook，内存占用可控

### 资源管理

[Dispose](src/common/dispose.ts) 模块提供 `Disposable` 基类，用于管理 VSCode 资源和防止内存泄漏。

### 配置管理

[config/index.ts](src/config/index.ts) 提供统一类型安全的配置访问，支持配置变更监听。任何配置变更会立即通知编辑器，无需重启生效。

## Webpack 构建

[webpack.config.js](webpack.config.js) 中包含两个构建配置：

1. **扩展构建** - 输出 Node.js 的 CommonJS2 模块，入口：`src/extension.ts`
2. **Web 资源构建** - 输出 UMD 模块供 webview 使用，打包 `src/webview/` 下的前端入口文件，支持 CSS/Less

## 配置项

扩展设置定义在 `package.json` 的 `contributes.configuration` 中：

- `lakeEditor.showTitle` - 在 lake 文件中显示可编辑的标题
- `lakeEditor.showToc` - 显示目录
- `lakeEditor.showToolbar` - 显示编辑器工具栏
- `lakeEditor.paragraphSpacing` - 增加段间距
- `lakeEditor.defaultFontSize` - 默认字号（12-48px）
- `lakeEditor.formatLake` - 保存时格式化 XML
- `lakeEditor.uploadImageToGithub` - 上传图片到 GitHub 仓库

## 快捷键

`Cmd+Shift+V` / `Ctrl+Shift+V` - 粘贴为纯文本（当 `lakeEditorFocus` 上下文激活时有效）

## 外部依赖

- **@alipay_lakex-doc**：语雀 lake 编辑器（通过 `npm run preset` 打包）
- **@octokit/rest**：GitHub API，用于图片上传功能
- **tar**：用于解压 .lakebook 文件
- **vscode-nls**：国际化支持

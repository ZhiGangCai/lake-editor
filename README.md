# lake-editor

[![Version](https://img.shields.io/badge/version-0.0.18-blue.svg)](https://marketplace.visualstudio.com/items?itemName=chenjingqing.lake-editor)

在 VSCode 中使用**语雀 Lake 编辑器**本地化编辑语雀 `.lake` 文件和 `.md` Markdown 文件。

## ✨ 功能特性

- 📝 **完全本地化** - 使用语雀官方 Lake 编辑器在本地编辑，无需联网
- 📚 **支持 .lakebook** - 树形浏览语雀知识库压缩包，可以打开任意文档
- 🎨 **完整编辑体验** - 支持代码块、公式、表格、图表等所有语雀卡片
- 📋 **一键复制** - 编辑完成后可以直接复制到语雀网页
- 🌓 **深色模式** - 自动跟随 VSCode 主题切换亮色/深色模式
- ⚡ **外部变更检测** - 文件在其他编辑器修改后自动提示重新加载
- 📤 **图片上传** - 支持上传图片到 GitHub 仓库

## 📥 安装

### 从 VSCode 插件市场安装

在 VSCode 插件市场搜索 `lake-editor` 点击安装。

### 手动安装

从 [GitHub Releases](https://github.com/ilimei/vscode-plugin-lake-editor/releases) 下载 `.vsix` 文件，然后在 VSCode 中：

```bash
code --install-extension lake-editor-0.0.18.vsix
```

## 🚀 使用方法

### 编辑 .lake 文件

1. 在文件浏览器中双击 `.lake` 文件即可打开
2. 使用语雀 Lake 编辑器编辑
3. 保存后即可更新到文件

### 编辑 Markdown 文件

- `.md` 文件也可以使用 Lake 编辑器打开（选择"lake-editor"）
- 编辑完成后保存，Lake 格式会自动转换回 Markdown

### 浏览 .lakebook 知识库

1. 在文件浏览器中右键点击 `.lakebook` 文件
2. 选择 `Explore Lakebook`
3. 左侧边栏会显示文档树，点击即可打开文档

### 常用操作

- **粘贴为纯文本** - `Cmd+Shift+V` / `Ctrl+Shift+V`

## ⚙️ 配置选项

打开 VSCode 设置，搜索 `lakeEditor` 可以配置以下选项：

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `lakeEditor.showTitle` | `false` | 在 lake 文件中显示可编辑的标题 |
| `lakeEditor.showToc` | `false` | 显示文档目录大纲 |
| `lakeEditor.showToolbar` | `true` | 显示编辑器工具栏 |
| `lakeEditor.paragraphSpacing` | `false` | 增加段间距 |
| `lakeEditor.defaultFontSize` | `15` | 默认字号（12-48px） |
| `lakeEditor.formatLake` | `false` | 保存时格式化 XML |
| `lakeEditor.uploadImageToGithub` | `false` | 上传图片到 GitHub 仓库 |

## 🔄 外部文件变更检测

当你同时在其他编辑器（比如 Typora、VSCode 其他窗口等）修改了当前打开的文件，切回 VSCode 时会自动弹出提示询问是否重新加载：

- 点击 **重新加载** - 关闭当前编辑器并重新打开，加载磁盘最新内容
- 点击 **忽略** - 保持当前编辑内容不变

扩展会自动过滤掉自身保存文件触发的变更，不会弹出提示，不会死循环。

## 💡 常见问题

### 支持 VSCode/GitHub Copilot 代码补全吗？

由于 lake-editor 使用 Custom Editor + Webview 嵌入语雀编辑器，VSCode 的原生代码补全/AI 代码预测功能**无法工作**，这些功能只对 VSCode 原生文本编辑器开放。

如果你需要 AI 代码补全，建议在原生文本编辑器中编写代码，然后复制粘贴到 lake-editor。

## 📸 截图

待补充

## 🏗️ 开发

### 环境要求

- Node.js 16+
- npm 或 yarn

### 安装依赖

```bash
npm install
npm run preset
```

> **注意**：`npm run preset` 会将 `@alipay_lakex-doc` 编辑器资源复制到 `media/editor/`，必须执行这一步。

### 开发命令

```bash
npm run watch      # 开发模式构建（监听文件变化）
npm run compile    # 一次性 webpack 构建
npm run package    # 生产构建（压缩，隐藏 source map）
npm run lint       # ESLint 检查 src/ 目录
npm run vsce       # 打包 .vsix 扩展文件
```

### 项目架构

- `src/extension.ts` - 扩展入口
- `src/editor/` - Custom Editor 实现
  - `base-preview.ts` - 基础 webview 预览类，处理生命周期和外部变更检测
  - `lake-preview/` - Lake 编辑器具体实现
- `src/tree-provider/` - .lakebook 树形浏览
- `src/common/` - 通用工具和消息通信

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE)

## 🔗 相关链接

- [语雀编辑器开发文档](https://www.yuque.com/yuque/developer/gfoax065u2v72isu)
- [GitHub 仓库](https://github.com/ilimei/vscode-plugin-lake-editor)
- [VSCode 插件市场](https://marketplace.visualstudio.com/items?itemName=ilimei.lake-editor)

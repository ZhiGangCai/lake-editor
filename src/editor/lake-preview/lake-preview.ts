/**
 * @filedescription Lake 编辑器具体实现
 * 继承 BasePreview，处理 Lake 编辑器特有逻辑
 */

import * as vscode from 'vscode';
import * as path from 'path';

import BasePreview, { ViewState } from "../base-preview";
import htmlTemplate from './index.html';
import { getConfig } from '../../config';
import { getGithubCore } from '../../common/github-core';

/**
 * Lake 编辑器预览
 *
 * 职责：
 * 1. 提供 Lake 编辑器需要的 CSS/JS 资源
 * 2. 处理消息路由（contentchange、visitLink 等）
 * 3. 提供快捷键命令（pasteAsPlainText、undo/redo）
 * 4. 处理图片上传（本地/GitHub）
 * 5. 实现 reloadContent 重新打开编辑器
 */
export default class LakePreview extends BasePreview {
  /** 内容变化事件 */
  private readonly _onDidChange = this._register(new vscode.EventEmitter<void>());
  public readonly onDidChange = this._onDidChange.event;

  /** 编辑器就绪事件 */
  private readonly _onReady = this._register(new vscode.EventEmitter<void>());
  public readonly onReady = this._onReady.event;

  /** 保存事件 */
  private readonly _onSave = this._register(new vscode.EventEmitter<void>());
  public readonly onSave = this._onSave.event;

  /** 当前活跃的编辑器实例，用于快捷键命令 */
  private static _activeEditor: LakePreview | undefined;

  /**
   * 获取当前活跃的编辑器实例
   */
  public static get activeEditor(): LakePreview | null {
    return this._activeEditor || null;
  }

  /**
   * 当前是否已销毁
   */
  public isDisposed(): boolean {
    return this._previewState === ViewState.disposed;
  }

  /**
   * 快捷键命令：粘贴为纯文本
   * 静态方法，由扩展命令调用，转发到当前活跃编辑器
   */
  public static pasteAsPlainText(): void {
    this._activeEditor?.pasteAsPlainText();
  }

  /** 当前配置 */
  config = getConfig();
  /** GitHub 图片上传实例 */
  githubCore = getGithubCore();

  /**
   * 初始化钩子
   */
  protected override init(): void {
    // 监听配置变化，更新所有配置到前端
    this._register(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('lakeEditor')) {
        // 配置变化后重新读取完整配置并发送给前端
        this.config = getConfig();
        this.message.callClient('updateConfig', this.getConfig());
      }
    }));
  }

  /**
   * 获取需要加载的 CSS 路径
   */
  getCSSSource(): string[] {
    return [
      '/media/editor/antd.4.24.13.css',
      '/media/editor/doc.css',
    ];
  }

  /**
   * 获取需要加载的 JS 路径
   */
  getJSSource(): string[] {
    return [
      '/media/editor/react.production.min.js',
      '/media/editor/react-dom.production.min.js',
      '/media/editor/doc.umd.js',
      '/media/message.js',
      '/media/lake-preview.js'
    ];
  }

  /**
   * 获取 HTML 模板
   */
  getHTMLTemplate(): string {
    return htmlTemplate;
  }

  /**
   * 处理 webview 消息
   */
  override onMessage(message: {type: string}): void {
    switch (message.type) {
      case 'contentchange':
        this._onDidChange.fire();
        break;
      case 'ready':
        this._onReady.fire();
        break;
      case 'save':
        this._onSave.fire();
        break;
      default:
        super.onMessage(message);
        break;
    }
  }

  /**
   * 在工作区查找文件
   * @param path 相对路径
   * @returns 找到返回 URI，否则 null
   */
  async getWorkspaceFileUri(path: string): Promise<vscode.Uri | null> {
    if (!vscode.workspace.workspaceFolders) {
      return null;
    }
    for (const folder of vscode.workspace.workspaceFolders) {
      const uri = folder.uri.with({ path: folder.uri.path + '/' + path });
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File) {
          return uri;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * 打开文件到指定行号列号
   * @param filePath 文件路径
   * @param line 行号（从 1 开始）
   * @param column 列号（从 1 开始）
   */
  async openFileAtPosition(filePath: string, line: number, column: number): Promise<void> {
    try {
      const finalURI = path.isAbsolute(filePath) ? vscode.Uri.parse(filePath) : await this.getWorkspaceFileUri(filePath);
      if (!finalURI) {
        return;
      }
      const stat = await vscode.workspace.fs.stat(finalURI);
      if (stat.type === vscode.FileType.File) {
        await vscode.commands.executeCommand('vscode.open', finalURI);
        // 如果有位置信息，跳转到指定位置
        if (vscode.window.activeTextEditor && line > 0) {
          const position = new vscode.Position(line - 1, column - 1);
          vscode.window.activeTextEditor.selection = new vscode.Selection(position, position);
          vscode.window.activeTextEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 处理链接点击
   * @param href 链接地址，可以是 URL 或者本地文件带行号
   */
  async visitLink(href: string): Promise<void> {
    // 外部链接直接打开
    if (href.startsWith('http')) {
      await vscode.env.openExternal(vscode.Uri.parse(href));
      return;
    }
    // 解析本地文件:行号:列号 格式
    const result = href.match(/^(.+?)(:\d+)?(:\d+)?$/);
    if (result) {
      const [, filePath, lineMatch, columnMatch] = result;
      if (filePath) {
        const line = lineMatch ? Number(lineMatch.slice(1)) : 0;
        const column = columnMatch ? Number(columnMatch.slice(1)) : 1;
        await this.openFileAtPosition(filePath, line, column);
      }
    }
  }

  /**
   * 获取当前配置给前端
   */
  async getConfig(): Promise<{
    showToc: boolean;
    showTitle: boolean;
    showToolbar: boolean;
    formatLake: boolean;
    defaultFontSize: number;
    paragraphSpacing: boolean;
    uploadImageToGithub: boolean;
  }> {
    return {
      showToc: this.config.showToc,
      showTitle: this.config.showTitle,
      showToolbar: this.config.showToolbar,
      formatLake: this.config.formatLake,
      defaultFontSize: this.config.defaultFontSize,
      paragraphSpacing: this.config.paragraphSpacing,
      uploadImageToGithub: this.config.uploadImageToGithub
    };
  }

  /**
   * 当编辑器变为激活状态
   * 更新上下文，设置全局活跃实例
   */
  override async onActive(): Promise<void> {
    LakePreview._activeEditor = this;
    vscode.commands.executeCommand('setContext', 'lakeEditorFocus', true);
    if (!this.isDisposed) {
      return this.message.callClient('setActive');
    }
  }

  /**
   * 当编辑器变为不激活
   * 清除上下文，清除全局活跃实例
   */
  protected override onUnActive(): void {
    if (LakePreview._activeEditor === this) {
      vscode.commands.executeCommand('setContext', 'lakeEditorFocus', false);
      LakePreview._activeEditor = undefined;
    }
  }

  /**
   * 窗口焦点变化
   */
  async windowStateChange(focused: boolean): Promise<void> {
    if (!this.isDisposed) {
      return this.message.callClient('windowStateChange', { active: this.webviewEditor.active && focused });
    }
  }

  /**
   * 撤销
   */
  async undo(): Promise<void> {
    if (!this.isDisposed) {
      return this.message.callClient('undo');
    }
  }

  /**
   * 重做
   */
  async redo(): Promise<void> {
    if (!this.isDisposed) {
      return this.message.callClient('redo');
    }
  }

  /**
   * 粘贴为纯文本快捷键命令
   */
  async pasteAsPlainText(): Promise<void> {
    if (this.isDisposed) {return;}
    const clipboardText = await vscode.env.clipboard.readText();
    return this.message.callClient('pasteAsPlainText', { clipboardText });
  }

  /**
   * 切换主题
   * 跟随 VSCode 主题变化
   */
  async switchTheme(): Promise<void> {
    if (!this.isDisposed) {
      return this.message.callClient('switchTheme', { isDark: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark });
    }
  }

  /**
   * 判断当前文件是否是 Markdown 文件
   */
  isMarkdownFile(): boolean {
    return this.resource.path.toLowerCase().endsWith('.md');
  }

  /**
   * 获取当前编辑器内容
   * @param type 'text/markdown' 导出 Markdown，空导出 lake 格式
   */
  async getContent(type = ''): Promise<Uint8Array> {
    // 保存内容到磁盘完成后，标记我们刚刚保存过，
    // 忽略接下来短时间内的文件系统变更事件（那是我们自己保存触发的）
    this.markSaved();
    return this.message.callClient('getContent', type);
  }

  /**
   * 更新内容到编辑器
   * @param content 新内容
   */
  async updateContent(content?: Uint8Array): Promise<void> {
    return this.message.callClient('updateContent', content);
  }

  /**
   * 重新加载内容 - 方案：关闭当前编辑器，让 VSCode 重新打开
   * 这比增量更新更干净，整个编辑器状态重新初始化
   */
  protected override async reloadContent(): Promise<void> {
    try {
      // 先关闭当前编辑器
      this.webviewEditor.dispose();

      // 短暂延迟让 VSCode 完成关闭操作，再重新打开
      await new Promise(resolve => setTimeout(resolve, 100));

      // 使用 VSCode 命令重新打开文件
      await vscode.commands.executeCommand('vscode.open', this.resource);

      console.info('External changes reloaded by reopening editor');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`重新加载失败: ${message}`);
    }
  }

  /**
   * 上传图片到本地（和 lake 文件同目录）
   * @param data 图片二进制数据
   * @returns 图片信息给编辑器
   */
  async uploadImage(data: Uint8Array): Promise<{ size: number; url: string; filename: string }> {
    const newPath = path.join(path.dirname(this.resource.fsPath), 'image.png');
    const targetResource = this.resource.with({ path: newPath });
    try {
      await vscode.workspace.fs.writeFile(targetResource, data);
      return {
        size: data.length,
        url: this.webviewEditor.webview.asWebviewUri(targetResource).toString().replace(/"/g, '&quot;'),
        filename: 'image.png',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to save image: ${message}`);
      throw error;
    }
  }

  /**
   * 上传图片到 GitHub 仓库
   * @param base64 图片 base64 编码
   * @returns 返回图片 URL，失败返回 false
   */
  async uploadToGithub(base64: string): Promise<{ url: string | false }> {
    try {
      const url = await this.githubCore.uploadImage(base64);
      return {
        url: url || false,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`GitHub upload failed: ${message}`);
      return {
        url: false,
      };
    }
  }
}

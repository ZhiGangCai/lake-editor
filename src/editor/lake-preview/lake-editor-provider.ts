/**
 * @fileoverview Lake 编辑器自定义编辑器提供者
 * 实现 VSCode CustomEditorProvider 接口
 */

import * as vscode from 'vscode';
import LakePreview from './lake-preview';
import { Disposable, disposeAll } from '../../common/dispose';
import LakeDocument from './lake-document';
import { LakeViewType } from '../../common/constants';

/**
 * Lake 编辑器自定义编辑器提供者
 *
 * 负责：
 * 1. 打开自定义文档
 * 2. 解析文档创建 webview 面板
 * 3. 处理文档变更，通知 VSCode 文档已修改
 * 4. 处理保存/还原/备份
 */
export default class LakeEditorProvider extends Disposable implements vscode.CustomEditorProvider<LakeDocument> {
  public static readonly viewType = LakeViewType;
  /** 所有打开的预览实例 */
  private previews: LakePreview[] = [];

  // 防抖延迟，避免过于频繁的脏状态更新
  private readonly _debounceDelay = 300;

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<LakeDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  /**
   * 保存文档到磁盘
   */
  saveCustomDocument(document: LakeDocument, cancellation: vscode.CancellationToken): Thenable<void> {
    return document.saveAs(document.uri, cancellation);
  }

  /**
   * 另存为到指定位置
   */
  saveCustomDocumentAs(document: LakeDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  /**
   * 还原文档到磁盘原始内容
   */
  revertCustomDocument(document: LakeDocument, cancellation: vscode.CancellationToken): Thenable<void> {
    return document.revert(cancellation);
  }

  /**
   * 备份文档，用于热退出
   */
  backupCustomDocument(document: LakeDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  /**
   * 打开自定义文档
   * 这里只是创建文档实例，实际 webview 在 resolveCustomEditor
   */
  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext): Promise<LakeDocument> {
    console.info('open custom document', uri);
    const doc = await LakeDocument.create(uri, openContext.backupId);
    return doc;
  }

  /**
   * 解析自定义编辑器，创建 webview 面板
   */
  resolveCustomEditor(document: LakeDocument, webviewEditor: vscode.WebviewPanel): void | Thenable<void> {
    const lakePreview = new LakePreview(this.extensionRoot, document.uri, webviewEditor);
    this.previews.push(lakePreview);

    // 监听 dispose，从列表移除
    this._register(lakePreview.onDispose(() => {
      const index = this.previews.indexOf(lakePreview);
      if (index !== -1) {
        this.previews.splice(index, 1);
      }
    }));

    // 设置 delegate，从文档获取内容
    document.setDelegate({
      getFileData: async () => {
        // 即使 webview 已经 dispose，依然尝试获取内容
        // 因为 VSCode 关闭文档时会最后保存一次，返回空会清空原文件！
        const contentType = lakePreview.isMarkdownFile() ? 'text/markdown' : '';
        try {
          const content = await lakePreview.getContent(contentType);
          return content;
        } catch (e) {
          console.error('Failed to get document content', e);
          return new Uint8Array();
        }
      },
    });

    const listeners: vscode.Disposable[] = [];

    // 文档内容变化 → 更新 webview
    listeners.push(document.onDidChangeContent(e => {
      if (lakePreview) {
        lakePreview.updateContent(e.content);
      }
    }));

    // 文档 dispose → 清理监听
    document.onDidDispose(() => disposeAll(listeners));

    // 编辑器就绪 → 从磁盘读取内容加载到编辑器
    this._register(lakePreview.onReady(async () => {
      const content = await document.content();
      lakePreview.updateContent(content);
    }));

    // 防抖：内容变化 → 通知 VSCode 文档已修改
    let debounceTimer: NodeJS.Timeout | null = null;
    this._register(lakePreview.onDidChange(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        // 通知 VSCode 文档已修改，允许保存
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {
            lakePreview.undo();
          },
          redo: () => {
            lakePreview.redo();
          },
        });
      }, this._debounceDelay);
    }));

    // 监听主题变化 → 通知编辑器更新主题
    this._register(vscode.window.onDidChangeActiveColorTheme(theme => {
      lakePreview.switchTheme();
    }));
    // 监听窗口焦点变化 → 通知编辑器
    this._register(vscode.window.onDidChangeWindowState(windowState => {
      lakePreview.windowStateChange(windowState.focused);
    }));
  }

  constructor(private readonly extensionRoot: vscode.Uri) {
    super();
  }
}

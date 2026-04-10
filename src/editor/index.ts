/**
 * @fileoverview 自定义编辑器提供者注册入口
 * 注册 Lake 编辑器和 Markdown 编辑器到 VSCode
 */

import * as vscode from 'vscode';
import LakeEditorProvider from './lake-preview/lake-editor-provider';
import LakePreview from './lake-preview/lake-preview';

/**
 * 注册自定义编辑器提供者到 VSCode
 * 注册两种编辑器：
 * 1. `.lake` 文件的 Lake 编辑器
 * 2. `.md` 文件可选的 Lake Markdown 编辑器
 * 同时注册粘贴为纯文本快捷键命令
 * @param context 扩展上下文
 */
export function registerCustomEditorProvider(context: vscode.ExtensionContext): void {
  const lakeEditorProvider = new LakeEditorProvider(context.extensionUri);

  // 初始状态：没有编辑器获得焦点
  vscode.commands.executeCommand('setContext', 'lakeEditorFocus', false);

  // 注册 .lake 自定义编辑器
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(LakeEditorProvider.viewType, lakeEditorProvider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true,
      }
    })
  );

  // 注册快捷键命令：粘贴为纯文本
  context.subscriptions.push(vscode.commands.registerCommand('lakeEditor.pasteAsPlainText', () => {
    LakePreview.pasteAsPlainText();
  }));

  // 注册可选的 Markdown 编辑器（用于 .md 文件）
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('lakeEditor.markdownEditor', lakeEditorProvider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true,
      }
    })
  );
}

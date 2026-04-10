/**
 * @fileoverview 树形视图提供者注册入口
 * 将 LakeBookTreeProvider 注册到 VSCode 侧边栏
 */

import * as vscode from 'vscode';
import LakeBookTreeProvider from './lakebook-tree-provider';

/**
 * 注册 .lakebook 树形视图提供者到 VSCode
 * @param context 扩展上下文
 */
export function registerTreeProvider(context: vscode.ExtensionContext): void {
    const treeProvider = new LakeBookTreeProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('lakeEditor.lakebookExplorer', treeProvider));
}
/**
 * @fileoverview VSCode 扩展入口文件
 * 激活扩展时注册自定义编辑器提供者和树形视图提供者
 */

import * as vscode from 'vscode';
import { registerCustomEditorProvider } from './editor';
import { registerTreeProvider } from './tree-provider';

/**
 * VSCode 扩展激活入口
 * 扩展第一次被使用时调用，注册所有提供者和命令
 * @param context 扩展上下文
 */
export function activate(context: vscode.ExtensionContext): void {
  registerCustomEditorProvider(context);
  registerTreeProvider(context);
}

/**
 * VSCode 扩展停用时调用
 * 清理工作留到各模块 dispose 方法处理
 */
export function deactivate(): void { }

/**
 * @fileoverview .lakebook 文件树形视图提供者
 * 实现 VSCode TreeDataProvider 接口，在侧边栏展示 .lakebook 文档结构
 * 支持打开、关闭、解压、导出 Markdown 等操作
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LakeViewType } from '../common/constants';
import { ILakeNode, LakeBookModel, ILakeTocNode, LakeRoot } from './lake-model';
import LakePreview from '../editor/lake-preview/lake-preview';

/**
 * .lakebook 文件树形视图提供者
 *
 * 职责：
 * 1. 在 VSCode 侧边栏展示 .lakebook 的文档树形结构
 * 2. 处理右键菜单命令（浏览、解压、打开、关闭、导出 Markdown）
 * 3. 提供静态方法供 `LakeDocument` 读取 lake:// 协议内容
 */
export default class LakeBookTreeProvider implements vscode.TreeDataProvider<ILakeNode> {
    /** 树数据变化事件 */
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void | ILakeNode | ILakeNode[]>();
    /** 树数据变化事件，供 VSCode 订阅 */
    readonly onDidChangeTreeData: vscode.Event<void | ILakeNode | ILakeNode[]> = this._onDidChangeTreeData.event;

    /** 当前全局 LakeBookModel 实例，供静态方法访问 */
    static currentModel: LakeBookModel | null = null;

    /**
     * 静态方法：从当前打开的 lakebook 中获取文档内容
     * 供 `LakeDocument` 读取 lake:// 协议的文档内容
     * @param uri lake:// 协议 URI，包含文档查询信息
     * @returns 文档内容二进制数据
     */
    static async getLakeURIContent(uri: vscode.Uri): Promise<Uint8Array> {
        if (this.currentModel && uri.scheme === 'lake') {
            return LakeBookModel.getLakeURIContent(uri);
        }
        return new Uint8Array();
    }

    /** 当前管理的所有 lakebook 模型 */
    private model: LakeBookModel;

    /**
     * 构造函数
     * @param context 扩展上下文
     */
    constructor(private readonly context: vscode.ExtensionContext) {
        this.clear();
        this.registerCommands();
    }

    /**
     * 打开一个 .lakebook 文件并添加到树形视图
     * @param uri .lakebook 文件 URI
     */
    openLakeBook(uri: vscode.Uri): void {
        this.model?.openLakeBook(uri);
        this._onDidChangeTreeData.fire();
    }

    /**
     * 从树形视图关闭一个 .lakebook 文件
     * @param uri .lakebook 文件 URI
     */
    closeLakeBook(uri: vscode.Uri): void {
        this.model?.closeLakeBook(uri);
        this._onDidChangeTreeData.fire();
    }

    /**
     * 将整个 .lakebook 解压到工作区
     * 每个文档导出为 .lake 文件，保持目录结构
     * @param uri .lakebook 文件 URI
     */
    unzipLakeBook(uri: vscode.Uri): void {
        this.model?.unzipLakeBook(uri);
        vscode.window.showInformationMessage('Lakebook unzipped successfully!');
    }

    /**
     * 在 Lake 编辑器中打开文档源码
     * @param uri 文档 URI（lake:// 协议）
     */
    openLakebookSource(uri: vscode.Uri): void {
        vscode.commands.executeCommand('vscode.openWith', uri, LakeViewType, { preview: true });
    }

    /**
     * 将当前打开的 Lake 文档导出为 Markdown 文件
     * 弹出保存对话框让用户选择保存位置
     */
    saveAsMd(): void {
        if (LakePreview.activeEditor) {
            const options: vscode.SaveDialogOptions = {
                saveLabel: 'Save As Markdown',
                filters: {
                    'Markdown Files': ['md'],
                    'All Files': ['*']
                }
            };

            vscode.window.showSaveDialog(options).then(async fileUri => {
                if (fileUri && LakePreview.activeEditor) {
                    const content = await LakePreview.activeEditor.getContent('text/markdown');

                    fs.writeFile(fileUri.fsPath, content, (err) => {
                        if (err) {
                            vscode.window.showErrorMessage('Failed to save file!');
                        } else {
                            vscode.window.showInformationMessage('File saved successfully!');
                        }
                    });
                }
            });
        }
    }

    /**
     * VSCode TreeDataProvider 接口：获取节点的 TreeItem 表示
     * @param element 树形节点
     * @returns 对应的 TreeItem，包含标签、图标、命令等信息
     */
    getTreeItem(element: ILakeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const isFile = element.type === 'DOC';
        const command = element instanceof ILakeTocNode && isFile ? {
            command: 'lakeEditor.openLakebookSource',
            title: 'Open Lakebook Source',
            arguments: [element.sourceUri.with({
                scheme: 'lake',
                path: path.join(element.sourceUri.path.replace(/^\/([^:+]:)/, '$1'), element.title),
                query: element.url + '.json',
            })],
        } : void 0;

        if (element instanceof LakeRoot) {
            return {
                label: element.title,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                contextValue: 'lakebook',
                iconPath: new vscode.ThemeIcon('file-zip'),
            };
        }
        return {
            label: element.title,
            command,
            collapsibleState: isFile ? void 0 : vscode.TreeItemCollapsibleState.Expanded,
            contextValue: 'lakebook',
            iconPath: isFile ? vscode.ThemeIcon.File : new vscode.ThemeIcon('folder'),
        };
    }

    /**
     * VSCode TreeDataProvider 接口：获取节点的子节点
     * @param element 父节点，undefined 表示获取根节点列表
     * @returns 子节点数组
     */
    getChildren(element?: ILakeNode): vscode.ProviderResult<ILakeNode[]> {
        if (!element) {
            return this.model.roots;
        }
        return element.nodes;
    }

    /**
     * VSCode TreeDataProvider 接口：获取节点的父节点
     * 暂未实现，不需要
     * @param element 子节点
     */
    getParent?(element: ILakeNode): vscode.ProviderResult<ILakeNode> {
        throw new Error('Method not implemented.');
    }

    /**
     * VSCode TreeDataProvider 接口：解析 TreeItem
     * 暂未实现，不需要
     */
    resolveTreeItem?(item: vscode.TreeItem, element: ILakeNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        throw new Error('Method not implemented.');
    }

    /**
     * 清空所有打开的 lakebook，重新初始化模型
     */
    private clear(): void {
        this.model = null;
        this.model = new LakeBookModel();
        LakeBookTreeProvider.currentModel = this.model;
        this._onDidChangeTreeData.fire();
    }

    /**
     * 注册所有树形视图相关命令
     */
    private registerCommands(): void {
        vscode.commands.registerCommand('lakeEditor.exploreLakebook', (uri: vscode.Uri) => {
            this.openLakeBook(uri);
        });
        vscode.commands.registerCommand('lakeEditor.unzipLakebook', (uri: vscode.Uri) => {
            this.unzipLakeBook(uri);
        });
        vscode.commands.registerCommand('lakeEditor.openLakebookSource', (uri: vscode.Uri) => {
            this.openLakebookSource(uri);
        });
        vscode.commands.registerCommand('lakeEditor.closeLakebook', (uri: vscode.Uri) => {
            this.closeLakebook(uri);
            vscode.window.showInformationMessage('Lakebook closed successfully!');
        });
        vscode.commands.registerCommand('lakeEditor.saveToMd', () => {
            this.saveAsMd();
        });
    }
}

/**
 * @fileoverview Lake 文档实现
 * 实现 VSCode CustomDocument 接口，处理文件读写和备份
 */

import * as vscode from 'vscode';
import { Disposable } from '../../common/dispose';
import LakeBookTreeProvider from '../../tree-provider/lakebook-tree-provider';

/**
 * Lake 文档委托接口
 * 文档从委托获取最新内容保存到磁盘
 */
export interface LakeDocumentDelegate {
  /** 获取文件最新内容 */
  getFileData(): Promise<Uint8Array>;
}

/**
 * Lake 文档
 * 实现 VSCode CustomDocument 接口
 *
 * 生命周期：
 * 1. create - 创建文档实例
 * 2. 保存 - 从委托获取内容写入磁盘
 * 3. 还原 - 从磁盘重新读取
 * 4. 备份 - 备份用于热退出
 */
export default class LakeDocument extends Disposable implements vscode.CustomDocument {
  /**
   * 创建 Lake 文档实例
   */
  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
  ): Promise<LakeDocument | PromiseLike<LakeDocument>> {
    const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
    return new LakeDocument(uri, dataFile);
  }

  /**
   * 静态方法：读取文件内容
   * 支持 lake:// 协议（从 .lakebook 中读取）和普通文件
   * @param uri 文件 URI
   */
  public static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === 'untitled') {
      return new Uint8Array();
    }
    if(uri.scheme === 'lake') {
      // 从 lakebook 树中读取内容
      return LakeBookTreeProvider.getLakeURIContent(uri);
    }
    // 普通文件从磁盘读取
    return new Uint8Array(await vscode.workspace.fs.readFile(uri));
  }

  /** 文档委托，获取保存内容 */
  private delegate: LakeDocumentDelegate;

  /**
   * 构造函数
   * @param uri 文件 URI
   * @param dataURI 数据 URI（backup 情况下不同）
   */
  constructor(public readonly uri: vscode.Uri, private _dataURI: vscode.Uri) {
    super();
  }

  /**
   * 设置委托
   */
  setDelegate(delegate: LakeDocumentDelegate): void {
    this.delegate = delegate;
  }

  /**
   * 获取文档内容
   */
  async content(): Promise<Uint8Array> {
    return await LakeDocument.readFile(this._dataURI);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }

  /** dispose 事件 */
  private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
  public readonly onDidDispose = this._onDidDispose.event;

  /** 内容变化事件 */
  private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
    readonly content?: Uint8Array;
  }>());
  public readonly onDidChangeContent = this._onDidChangeDocument.event;

  /** 文档变化事件 */
  private readonly _onDidChange = this._register(new vscode.EventEmitter<{}>());
  public readonly onDidChange = this._onDidChange.event;

  /**
   * VSCode 调用：保存文档到当前 URI
   */
  async save(cancellation: vscode.CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation);
  }

  /**
   * VSCode 调用：保存文档到目标 URI
   */
  async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
    const fileData = await this.delegate.getFileData();
    if (cancellation.isCancellationRequested) {
      return;
    }
    await vscode.workspace.fs.writeFile(targetResource, fileData);
  }

  /**
   * VSCode 调用：还原文档到磁盘内容
   */
  async revert(_cancellation: vscode.CancellationToken): Promise<void> {
    const diskContent = await LakeDocument.readFile(this.uri);
    this._onDidChangeDocument.fire({
      content: diskContent,
    });
  }

  /**
   * VSCode 调用：备份文档，用于 VSCode 热退出
   * @param destination 备份目标 URI
   * @param cancellation 取消令牌
   */
  async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation);

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination);
        } catch {
          // 忽略删除错误
        }
      },
    };
  }
}

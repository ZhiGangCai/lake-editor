/**
 * @fileoverview vscode 扩展主机端的消息处理服务
 * 处理扩展主机 ↔ webview 之间的异步消息通信
 */

import * as vscode from 'vscode';
import type { Request } from './message-client';
import type { BaseMessage, MessageHandlerContext } from './message-protocol';

/**
 * 扩展主机端消息服务
 *
 * 功能：
 * 1. 接收 webview 发来的消息，调用上下文对应的处理方法
 * 2. 向 webview 发起 RPC 调用并等待结果返回
 * 3. 管理挂起的请求，dispose 时清理防止内存泄漏
 */
export default class MessageServer {
    /** 最大目录深度 */
    maxDeep = 0;
    /** 当前图片数据大小 */
    size = 0;
    /** 工作区根文件夹 URI */
    rootFolder: vscode.Uri | undefined;
    /** 挂起的请求映射 */
    requestsMap: { [key: string]: Request } = {};

    private readonly _onSizeChange: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    /** 图片大小变化事件 */
    readonly onSizeChange: vscode.Event<number> = this._onSizeChange.event;

    /**
     * 构造函数
     * @param webview webview 实例
     * @param resource 当前打开的文件 URI
     * @param resourceRoot 资源根路径
     */
    constructor(
        private readonly webview: vscode.Webview,
        private readonly resource: vscode.Uri,
        private readonly resourceRoot: vscode.Uri
    ) {
        // 查找当前文件所在工作区根目录
        const rootFolder = vscode.workspace.workspaceFolders?.find(v => {
            return this.resourceRoot.path.startsWith(v.uri.path);
        });
        this.rootFolder = rootFolder?.uri;
        this.maxDeep = this.resourceRoot.path.split('/').length - 1;
    }

    /**
     * 处理从 webview 发来的消息
     * @param message 消息对象
     * @param context 消息处理上下文（包含处理方法）
     */
    async onMessage(message: BaseMessage, context: MessageHandlerContext): Promise<void> {
        const requestIdStr = String(message.requestId);
        // 如果是回复我们之前发起的请求，直接 resolve
        if (this.requestsMap[requestIdStr]) {
            this.requestsMap[requestIdStr].resolve(message.data);
            delete this.requestsMap[requestIdStr];
            return;
        }
        // 否则是 webview 发起的请求，调用上下文处理方法
        if (message.type) {
          if (!context[message.type] || typeof context[message.type] !== 'function') {
              console.error(`[MessageServer] message.type '${message.type}' method not found in context`);
              return;
          }
          const result = await context[message.type](message.data);
          this.webview.postMessage({ requestId: message.requestId, data: result });
        }
    }

    /**
     * 调用 webview 方法并等待结果
     * @param type 消息类型（方法名）
     * @param data 参数数据
     * @param timeout 超时时间（毫秒），-1 表示不超时
     * @returns Promise 解析 webview 返回的结果
     */
    public callClient<T = unknown>(type: string, data: unknown = null, timeout: number = -1): Promise<T> {
      const requestId = 'server_' + parseInt((Math.random() + '').slice(2), 10);
      const request: Request = {
          requestId,
          resolve: () => { },
      };
      const promise = new Promise<T>((resolve, reject) => {
          request.resolve = resolve as (data: unknown) => void;
          if (timeout > 0) {
              setTimeout(() => {
                  delete this.requestsMap[requestId];
                  reject(new Error(`call method ${type} data=${JSON.stringify(data)} timeout ${timeout}ms`));
              }, timeout);
          }
      });
      this.requestsMap[requestId] = request;
      this.webview.postMessage({
          type,
          requestId,
          data,
      });
      return promise;
    }

    /**
     * 清理所有待处理的请求，防止内存泄漏
     * 在 webview dispose 时调用
     */
    public dispose(): void {
        // 清除所有待处理请求
        this.requestsMap = {};
        this._onSizeChange.dispose();
    }
}

/**
 * @fileoverview 运行在webview中的消息客户端
 * 处理 webview → 扩展主机 的异步消息通信
 */

/**
 * 挂起的请求定义
 */
export interface Request {
  requestId: string | number;
  resolve: (data: unknown) => void;
}

/**
 * Webview 消息客户端
 *
 * 提供异步 RPC 调用能力，将消息发送到扩展主机并等待返回结果
 * 运行在 webview 环境中
 */
export default class MessageClient {
  /** 超时请求列表 */
  timeout: Request[] = [];
  /** 挂起的请求映射 requestId → Request */
  requestsMap: { [key: string]: Request } = {};

  constructor() {
    window.addEventListener('message', async e => {
      if (this.requestsMap[e.data.requestId]) {
        this.requestsMap[e.data.requestId].resolve(e.data.data);
        delete this.requestsMap[e.data.requestId];
      }
    });
  }

  /**
   * 回复服务器端的请求（服务器 → 客户端调用后回复）
   * @param requestId 请求ID
   * @param data 返回数据
   */
  public replayServer(requestId: string | number, data: unknown = null): void {
    // @ts-ignore
    vscode.postMessage({
      requestId,
      data,
    });
  }

  /**
   * 调用扩展主机方法并等待结果
   * @param type 消息类型（对应方法名）
   * @param data 参数数据
   * @param timeout 超时时间（毫秒），-1 表示不超时
   * @returns Promise 解析返回结果
   */
  public callServer<T = unknown>(type: string, data: unknown = null, timeout: number = -1): Promise<T> {
    const requestId = parseInt((Math.random() + '').slice(2), 10);
    const request: Request = {
      requestId,
      resolve: () => { },
    };
    const p = new Promise<T>((resolve, reject) => {
      request.resolve = resolve as (data: unknown) => void;
      if (timeout > 0) {
        setTimeout(() => {
          delete this.requestsMap[requestId.toString()];
          reject(new Error(`call method ${type} data=${JSON.stringify(data)} timeout ${timeout}ms`));
        }, timeout);
      }
    });
    this.requestsMap[requestId.toString()] = request;
    // @ts-ignore
    vscode.postMessage({
      type,
      requestId,
      data,
    });
    return p;
  }
}

// 实例化后挂载到 window 全局
// @ts-ignore
window.message = new MessageClient();

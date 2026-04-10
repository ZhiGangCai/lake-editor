/**
 * 消息协议通用类型定义
 * 定义扩展主机 ↔ webview 之间的消息通信协议
 */

/** 基础消息结构 */
export interface BaseMessage {
  type: string;
  requestId: number | string;
  data?: unknown;
}

/** 挂起的请求 */
export interface PendingRequest {
  requestId: string | number;
  resolve: (data: unknown) => void;
}

/** 请求回调 */
export type RequestHandler = (data: unknown) => Promise<unknown> | unknown;

/** 消息处理上下文 */
export type MessageHandlerContext = Record<string, RequestHandler>;

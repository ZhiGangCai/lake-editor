/**
 * @fileoverview 基础 webview 预览抽象类
 * 处理 webview 生命周期、消息路由、主题变化、外部文件变更检测
 */

import * as vscode from 'vscode';
import MessageServer from '../common/message-server';
import { Disposable } from '../common/dispose';
import { FileChangeDetector, FileChangeDetectorDelegate } from './services/file-change-detector';

/**
 * webview 视图状态
 */
export enum ViewState {
    /** 已释放 */
    disposed,
    /** 可见但不活跃 */
    visible,
    /** 活跃（焦点） */
    active,
}

/**
 * 判断当前平台是否是 MacOS
 */
function isMac(): boolean {
    if (typeof process === 'undefined') {
        return false;
    }
    return process.platform === 'darwin';
}

/**
 * HTML 属性转义，替换 " 为 &quot;
 */
function escapeAttribute(value: string | vscode.Uri): string {
    return value.toString().replace(/"/g, '&quot;');
}

/**
 * 生成随机 nonce 用于 CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}


/**
 * 基础 webview 预览抽象类
 *
 * 职责：
 * 1. 初始化 webview HTML 内容
 * 2. 处理生命周期（激活/失活/显示/释放）
 * 3. 路由消息到 MessageServer
 * 4. 委托外部文件变更检测给 FileChangeDetector
 * 5. 定义钩子方法供子类实现具体功能
 *
 * 子类需要实现：
 * - `getCSSSource()` / `getJSSource()` - 返回需要加载的 CSS/JS
 * - `getHTMLTemplate()` - 返回 HTML 模板
 * - `reloadContent()` - 重新加载内容（外部变更后调用）
 * - 各种生命周期钩子 `onActive()` / `onDisposed()` 等
 */
export default class BasePreview extends Disposable implements FileChangeDetectorDelegate {
    /** 唯一实例 ID */
    protected readonly id: string = `${Date.now()}-${Math.random().toString()}`;

    /** dispose 事件 */
    private readonly _onDispose = this._register(new vscode.EventEmitter<void>());
    /** dispose 事件 */
    public readonly onDispose = this._onDispose.event;

    /** 当前视图状态 */
    protected _previewState = ViewState.visible;
    /** 当前图片二进制大小 */
    protected _imageBinarySize: number = 0;
    /** 消息服务 */
    protected message: MessageServer;
    /** CSP nonce */
    protected nonce = getNonce();
    /** 文件外部变更检测器 */
    private readonly _fileChangeDetector: FileChangeDetector;

    /**
     * 构造函数
     * @param extensionRoot 扩展根路径
     * @param resource 当前打开的文件
     * @param webviewEditor webview 面板
     */
    constructor(
        protected readonly extensionRoot: vscode.Uri,
        protected readonly resource: vscode.Uri,
        protected readonly webviewEditor: vscode.WebviewPanel,
    ) {
        super();
        // 计算资源根目录
        const resourceRoot = resource.with({
            path: resource.path.replace(/\/[^\/]+?\.\w+$/, '/'),
        });
        // 配置 webview 选项
        webviewEditor.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                resourceRoot,
                extensionRoot,
            ]
        };

        // 创建消息服务
        this.message = new MessageServer(webviewEditor.webview, resource, resourceRoot);

        // 监听 webview 消息
        this._register(webviewEditor.webview.onDidReceiveMessage(message => {
            this.onMessage(message);
        }));

        // 监听视图状态变化
        this._register(webviewEditor.onDidChangeViewState((e: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
            this.update(e.webviewPanel.active);
        }));

        // 监听 dispose
        this._register(webviewEditor.onDidDispose(() => {
            if (this._previewState === ViewState.active) {
                this.onDisposed();
            }
            this._previewState = ViewState.disposed;
            this._onDispose.fire();
            // 清理 MessageServer 待处理请求
            this.message.dispose();
            this.dispose();
        }));

        // 文件外部变更检测
        this._fileChangeDetector = this._register(new FileChangeDetector(resource, this));

        // 监听图片大小变化
        this._register(this.message.onSizeChange(size => {
            this._imageBinarySize = size;
            this.update(true);
        }));

        // 初始化钩子
        this.init();
        // 渲染 HTML
        this.render();
        // 更新状态
        this.update(true);
        // 通知前端激活
        this.message.callClient('setActive');
    }

    /**
     * 实现 FileChangeDetectorDelegate 接口
     * 检查当前是否已 disposed
     */
    isDisposed(): boolean {
        return this._previewState === ViewState.disposed || this.disposed;
    }

    /**
     * 实现 FileChangeDetectorDelegate 接口
     * 用户确认重新加载，委托给子类
     */
    async onReloadRequested(): Promise<void> {
        await this.reloadContent();
    }

    /**
     * 初始化钩子，子类可以覆盖
     */
    protected init(): void {
    }

    /**
     * 获取当前文件 URI
     */
    get resourceUri(): vscode.Uri {
        return this.resource;
    }

    /**
     * 获取页面标题，子类可以覆盖
     */
    protected getTitle(): string {
        return '';
    }

    /**
     * 获取需要加载的 CSS 路径列表，子类必须覆盖
     */
    protected getCSSSource(): string[] {
        return [];
    }

    /**
     * 获取需要加载的 JS 路径列表，子类必须覆盖
     */
    protected getJSSource(): string[] {
        return [];
    }

    /**
     * 获取 HTML 内容模板，子类必须覆盖
     */
    protected getHTMLTemplate(): string {
        return '';
    }

    /**
     * 处理 webview 消息，默认转发给 messageServer
     * @param message 消息对象
     */
    protected onMessage(message: unknown): void {
        this.message?.onMessage(message as any, this);
    }

    /**
     * 视图变为激活状态钩子，子类可以覆盖
     */
    protected onActive(): void {
    }

    /**
     * 视图变为不激活钩子，子类可以覆盖
     */
    protected onUnActive(): void {
    }

    /**
     * 视图变为可见钩子，子类可以覆盖
     */
    protected onVisible(): void {
    }

    /**
     * dispose 钩子，子类可以覆盖
     */
    protected onDisposed(): void {
    }

    /**
     * 标记当前文件刚刚被保存
     * 用于忽略接下来短时间内的文件系统变更（我们自己保存触发的）
     */
    protected markSaved(): void {
        this._fileChangeDetector.markSaved();
    }

    /**
     * 重新加载内容，子类必须实现
     * 当文件在外部被修改，用户确认重新加载时调用
     */
    protected async reloadContent(): Promise<void> {
        // 默认空实现
    }

    /**
     * 更新视图状态
     * @param isActive 是否激活
     */
    protected update(isActive: boolean = false): void {
        if (this._previewState === ViewState.disposed) {
            return;
        }

        // 从激活变为不激活
        if (!isActive && this._previewState === ViewState.active) {
            this.onUnActive();
        }

        // 变为激活
        if (this.webviewEditor.active && isActive && this._previewState !== ViewState.active) {
            this._previewState = ViewState.active;
            this.onActive();
        } else {
            // 仍然可见
            if (this._previewState === ViewState.active) {
                this.onVisible();
            }
            this._previewState = ViewState.visible;
        }
    }

    /**
     * 生成 webview HTML 内容
     */
    private async getWebviewContents(): Promise<string> {
        const settings = {
            isMac: isMac(),
        };

        const nonce = this.nonce;

        return /* html */`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">

        <!-- Disable pinch zooming -->
        <meta name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

        <title>${this.getTitle()}</title>
        ${this.getCSSSource().map(source => {
            return `<link rel="stylesheet" href="${escapeAttribute(this.extensionResource(source))}" type="text/css" media="screen" nonce="${nonce}">`;
        }).join('\n')
            }
        <meta name='referrer' content='never'>
        <meta id="image-preview-settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
        <script type="text/javascript" nonce="${nonce}">
            window.isDarkMode = ${vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'true' : 'false'};
            window.extensionResourceURI = ${JSON.stringify(this.extensionResource('/media').toString())};
            window.currentResourceURI = ${JSON.stringify(this.resource)};
            window.vscode = acquireVsCodeApi();
        </script>
    </head>
    <body>
        ${this.getHTMLTemplate()}
        ${this.getJSSource().map(source => {
                return `<script src="${escapeAttribute(this.extensionResource(source))}" nonce="${nonce}"></script>`;
            }).join('\n')}
    </body>
    </html>`;
    }

    /**
     * 获取扩展资源的转义后的 URL
     * 供 HTML 模板使用
     * @param path 路径
     */
    public async getExtensionResource(path: string): Promise<string> {
        return escapeAttribute(this.extensionResource(path));
    }

    /**
     * 转换扩展资源为 webview 可访问的 URI
     * @param path 相对于扩展根的路径
     */
    private extensionResource(path: string): vscode.Uri {
        if (path.startsWith('http')) {
            return vscode.Uri.parse(path);
        }
        return this.webviewEditor.webview.asWebviewUri(this.extensionRoot.with({
            path: this.extensionRoot.path + path
        }));
    }

    /**
     * 渲染 HTML 到 webview
     */
    private async render(): Promise<void> {
        if (this._previewState !== ViewState.disposed) {
            this.webviewEditor.webview.html = await this.getWebviewContents();
        }
    }
}

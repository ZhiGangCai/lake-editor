import * as vscode from 'vscode';
import { Disposable } from '../../common/dispose';

/**
 * 文件外部变更检测器
 *
 * 负责监听文件系统变更，当文件在外部被修改时提示用户，
 * 支持自保存过滤（避免死循环：我们自己保存触发的变更不需要提示）
 *
 * 监听所有三种事件：onDidChange / onDidCreate / onDidDelete
 * 兼容各种编辑器的保存策略（包括：写入临时文件→删除→重命名）
 */
export interface FileChangeDetectorDelegate {
  /** 当用户确认重新加载时调用 */
  onReloadRequested(): Promise<void>;
  /** 检查文档是否已 disposed */
  isDisposed(): boolean;
}

export class FileChangeDetector extends Disposable {
  /** 防抖定时器，避免短时间内多次弹出提示 */
  private _timer: NodeJS.Timeout | null = null;
  /** 记录最后保存时间，忽略我们自己保存触发的变更 */
  private _lastSaveTime = 0;
  /** 等待延迟（毫秒），让文件保存完成 */
  private readonly _delay = 300;
  /** 自保存过滤窗口（毫秒），300ms 内的变更忽略 */
  /** 太长会导致提示不及时，太短可能触发多余提示 */
  private readonly _ignoreWindow = 300;

  constructor(
    private readonly _resource: vscode.Uri,
    private readonly _delegate: FileChangeDetectorDelegate,
  ) {
    super();

    // 创建文件监听器
    const watcher = this._register(vscode.workspace.createFileSystemWatcher(_resource.fsPath));
    this._register(watcher.onDidChange(e => {
      if (e.fsPath === _resource.fsPath) {
        this._handleChange();
      }
    }));
    // 很多编辑器使用"写入新文件→重命名"保存策略，会触发onDidCreate，必须监听！
    this._register(watcher.onDidCreate(e => {
      if (e.fsPath === _resource.fsPath) {
        this._handleChange();
      }
    }));
    this._register(watcher.onDidDelete(e => {
      if (e.fsPath === _resource.fsPath) {
        // 文件被删除，关闭编辑器
        vscode.window.showWarningMessage(`文件 "${vscode.workspace.asRelativePath(_resource)}" 已被删除`);
      }
    }));
  }

  /**
   * 标记当前文件刚刚被保存，忽略接下来短时间内的变更
   * 因为我们自己保存文件到磁盘会触发文件系统变更，不需要提示
   */
  markSaved(): void {
    this._lastSaveTime = Date.now();
  }

  private _handleChange(): void {
    const now = Date.now();
    const diff = now - this._lastSaveTime;

    // 如果是最近 ignoreWindow 内刚刚保存过，忽略这次变更（这是我们自己保存触发的）
    if (diff < this._ignoreWindow) {
      return;
    }

    if (this._delegate.isDisposed()) {
      return;
    }

    // 延迟处理，等待文件保存完成
    this._timer = setTimeout(async () => {
      if (this._delegate.isDisposed()) {
        return;
      }
      const answer = await vscode.window.showWarningMessage(
        `文件 "${vscode.workspace.asRelativePath(this._resource)}" 在编辑器外被修改`,
        { title: '重新加载', isCloseAffordance: true },
        { title: '忽略' }
      );

      if (answer?.title === '重新加载') {
        await this._delegate.onReloadRequested();
      }
    }, this._delay);
  }

  dispose(): void {
    if (this._timer) {
      clearTimeout(this._timer);
    }
    super.dispose();
  }
}
